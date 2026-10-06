# Group Files — a Telegram Mini App file manager

A Google-Drive-like file manager for Telegram groups, delivered as a Telegram Mini App.
Folders, subfolders, uploads, previews, search, move/rename/delete, and per-group permissions.

**Telegram is the file storage.** Uploaded bytes go to Telegram through the bot (`sendDocument`) and only the
Telegram `file_id` / `file_unique_id` plus metadata are kept in PostgreSQL. There is no S3, R2, Firebase or
Supabase Storage anywhere in this project. Downloads are streamed from Telegram through the server, or delivered
to the user directly in Telegram.

```text
📁 Group Files
├── 📁 Events
│   ├── 📄 Program.pdf
│   └── 📁 Photos
│       └── 🖼️ Photo 1.jpg
└── 📁 Lessons
    └── 📄 Lesson 01.pdf
```

---

## Contents

1. [Telegram limitations that shape the design](#1-telegram-limitations-that-shape-the-design)
2. [Architecture](#2-architecture)
3. [Security model](#3-security-model)
4. [Project structure](#4-project-structure)
5. [Database schema](#5-database-schema)
6. [API](#6-api)
7. [Local development](#7-local-development)
8. [Telegram bot configuration](#8-telegram-bot-configuration)
9. [Database setup](#9-database-setup)
10. [Production deployment](#10-production-deployment)
11. [Permissions](#11-permissions)
12. [Error handling](#12-error-handling)
13. [Testing](#13-testing)

---

## 1. Telegram limitations that shape the design

Verified against the official docs for **Bot API 10.3 (August 24, 2026)** and the Mini Apps reference.

| Fact | Consequence in this app |
| --- | --- |
| Bots can **upload at most 50 MB** per file via multipart (`sendDocument`), 10 MB for `sendPhoto`. | Browser → server → Telegram uploads are capped by `MAX_UPLOAD_BYTES` (default 20 MB, max 50 MB). Everything is sent as a *document* so the original file name is kept. |
| Bots can **download at most 20 MB** via `getFile`. The returned `file_path` is temporary (valid ≥ 1 hour). | Browser downloads/previews work for files ≤ 20 MB. `file_path` is never stored; a fresh one is fetched per request. Larger files get **"Send to me in Telegram"**: the bot re-sends the stored `file_id` to the user's private chat, which has **no size limit**. |
| Re-sending a file by `file_id` has **no size limit**, and a bot can *receive* files of any size the user can send (2 GB, 4 GB with Premium). | **"Upload via Telegram"**: the user picks a folder in the Mini App, taps a deep link, and sends files to the bot in a private chat. The bot records the `file_id` into that folder. Zero server bandwidth, any size. |
| A **self-hosted Bot API server** lifts limits to 2000 MB upload and unlimited download. | Set `TELEGRAM_API_ROOT` (and `TELEGRAM_LOCAL_MODE`) and raise `MAX_UPLOAD_BYTES` / `MAX_DOWNLOAD_BYTES=0`. No code changes. |
| The **menu button** (`setChatMenuButton`) and `web_app` keyboard/inline buttons are **private-chat only**. | In groups, the bot answers `/files` with a **direct-link button** (`https://t.me/<bot>?startapp=c_<chatKey>`). The menu button is still configured for private chats and opens a group picker. |
| Only Mini Apps launched from a **direct link** receive `chat_type`, `chat_instance` and `start_param`. The `chat` object is only provided for attachment-menu launches. `chat_instance` is opaque and cannot be mapped to a chat id by itself. | The group is identified through `start_param` (an opaque per-group key, or a folder/file id). `chat_instance` is remembered once learned so later launches from the same group resolve without a parameter. Membership is **always** re-verified with `getChatMember`. |
| `getChatMember` is "only guaranteed to work for other users if the bot is an administrator". | **Add the bot as an admin** in each group. It works as a plain member in most groups, but admin is the supported configuration. |
| Bot API 10.3: Mini App methods are refused from origins other than the configured Mini App domain. | `NEXT_PUBLIC_APP_URL` must match the domain configured in @BotFather. |
| Bot API 10.2: ephemeral commands/messages. | `/files` in groups is registered as *ephemeral*, so the command and the bot's reply are visible only to the sender (no group spam). Falls back to a normal silent reply on older clients. |
| Vercel-style serverless functions cap request bodies at ~4.5 MB. | For browser uploads up to 50 MB deploy on a Node host (Docker, Railway, Fly, VPS). "Upload via Telegram" is unaffected either way. |

---

## 2. Architecture

```text
Telegram group ──/files──▶ Bot (webhook) ──▶ direct link  https://t.me/<bot>?startapp=c_<chatKey>
                                                        │
                                                        ▼
                                       Mini App (Next.js, React, Tailwind, shadcn/ui)
                                                        │  initData + API calls (Bearer JWT)
                                                        ▼
                                    Next.js route handlers (/app/api/**) ── PostgreSQL (metadata only)
                                                        │
                                                        ▼
                                    Telegram Bot API (server-side only): sendDocument, getFile, copyMessage…
```

**Upload (browser):** Mini App → `POST /api/files/upload` (multipart) → `sendDocument` to the storage chat →
`file_id` + metadata → DB row.

**Upload (Telegram):** Mini App → `POST /api/uploads/telegram` → deep link `t.me/<bot>?start=up_<session>` →
user sends files to the bot → webhook stores each `file_id` in the chosen folder (optionally copying the message
into the storage channel).

**Download:** `POST /api/files/:id/download-url` issues a 10-minute single-file token → `GET /api/files/:id/download?t=…`
calls `getFile` and streams the bytes (Range supported) with a safe `Content-Disposition`. Images/videos/PDFs may
render inline; anything else is forced to download (XSS protection). Files over the download limit → `413` with a
hint to use **Send to me**.

**Storage chat:** uploads are posted to `TELEGRAM_STORAGE_CHAT_ID` (a private channel where the bot is admin) when
set, otherwise silently into the group itself. The storage `chat_id`/`message_id` is kept for `copyMessage` and
for best-effort cleanup when a file is deleted.

---

## 3. Security model

Every chat-scoped request goes through `lib/auth/context.ts`:

```text
Bearer JWT  →  Telegram user  →  chat bound to the token  →  membership re-verified via getChatMember (cached)  →  role
                                                                                     ↓
                                              service layer loads the folder/file WHERE id = ? AND chat_id = ctx.chat.id
```

- **initData is validated server-side** (HMAC-SHA256 with the bot token, `auth_date` freshness, timing-safe compare) in `lib/telegram/init-data.ts`.
- The **chat is never taken from the client**. It is bound into the session JWT at login; there is no `/api/chats/:chatId/...` surface to tamper with. Changing an id in a URL yields `404` because every query is scoped by `chat_id`.
- **Permissions are enforced in route handlers** (`assertCan`) — the UI only hides buttons.
- Tokens: `chat` (API), `media` (chat-scoped read grant for `<img>` thumbnails), `download` (10-minute single-file grant). Read grants cannot be used for writes or listings.
- Webhook requests must carry the `X-Telegram-Bot-Api-Secret-Token` header matching `TELEGRAM_WEBHOOK_SECRET`.
- The bot token and `DATABASE_URL` exist only in server modules guarded by `lib/server-guard.ts` / `server-only`.
- SQL goes through Drizzle (parameterised). File names are sanitised (basename only, no control chars); `Content-Disposition` uses RFC 5987 encoding; downloads set `nosniff` + a sandboxing CSP; HTML/SVG/XML never render inline.
- Folder moves are checked against the descendant set (recursive CTE) to prevent cycles; names are unique per parent (case-insensitive) at the database level.
- No cookies → no CSRF surface. The page CSP restricts `frame-ancestors` to Telegram origins.

---

## 4. Project structure

```text
app/
├── api/
│   ├── auth/session, auth/select-chat      initData → session; group picker
│   ├── folders/[folderId], folders/tree    listing, rename, delete, move, tree
│   ├── files/upload, files/[fileId]/…      upload, metadata, rename, delete, move, download-url, download, thumbnail, send
│   ├── bulk/delete, bulk/move, bulk/send   multi-select actions on files + folders
│   ├── search                              scoped search
│   ├── uploads/telegram                    "Upload via Telegram" sessions
│   ├── telegram/webhook                    bot updates
│   └── health
├── layout.tsx  page.tsx  globals.css       Mini App shell, Telegram theme tokens
components/
├── FileManager/                            FileManager, Header, Breadcrumbs, SearchView, PreviewSheet, SelectionBar, ChatPicker, hooks, selection, session-context
├── FolderList/  FileList/                  rows
├── ContextMenu/ItemMenu.tsx                ⋮ menu
├── UploadDialog/  CreateFolderDialog/  dialogs/ (Rename, Move, Delete)
├── common/                                 toast, icons, loading/empty/error states
└── ui/                                     shadcn/ui primitives
lib/
├── telegram/   bot-api.ts (server wrapper), bot.ts (update handler), init-data.ts, links.ts, media.ts, webapp.ts (client SDK), types.ts
├── auth/       session.ts (JWT), context.ts (request → user/chat/role)
├── permissions/ policy.ts (roles ↔ permissions), index.ts (can / assertCan)
├── services/   chats, users, members, folders, folder-tree, files, bulk, search, upload-sessions, auth, naming
├── db/         schema.ts, index.ts
├── api/        errors.ts (ApiError, route wrapper), stream.ts, client.ts (browser client)
└── env.ts      validated environment + effective Telegram limits
drizzle/        SQL migrations
scripts/        telegram-setup.ts, telegram-poll.ts, migrate.ts
tests/          unit tests (vitest) + tests/e2e (API test against a mock Telegram server)
```

---

## 5. Database schema

Normalised PostgreSQL schema (`lib/db/schema.ts`, migration in `drizzle/0000_initial.sql`). UUID primary keys; Telegram ids stored as `bigint`.

| Table | Purpose | Notable indexes / constraints |
| --- | --- | --- |
| `users` | Telegram users seen by the bot | unique `telegram_user_id` |
| `telegram_chats` | Groups the bot has been added to; `chat_key` is the opaque id used in deep links; `bot_status`; learned `chat_instance` | unique `telegram_chat_id`, `chat_key`, `chat_instance` |
| `chat_members` | Cached membership (`telegram_status`, derived `role`, optional `custom_role`, `checked_at`) | PK `(chat_id, user_id)`, index `user_id` |
| `folders` | Tree via `parent_id` (NULL = root), cascade delete | `(chat_id, parent_id)`, `(chat_id, name)`, unique `(chat_id, coalesce(parent_id), lower(name))` |
| `files` | Telegram identifiers + metadata; `folder_id` NULL = root; `storage_chat_id`/`storage_message_id` | `(chat_id, folder_id)`, `(chat_id, file_name)`, `telegram_file_unique_id`, `created_by` |
| `upload_sessions` | "Upload via Telegram" targets (chat, folder, user, status, expiry) | `(user_id, status, expires_at)` |

`files` stores `telegram_file_id`, `telegram_file_unique_id`, `telegram_kind` (document/photo/video/…), `thumbnail_file_id`, `file_name`, `mime_type`, `file_size`, `width/height/duration`, `created_by`, timestamps. Temporary `file_path`s are never stored.

---

## 6. API

All chat-scoped endpoints require `Authorization: Bearer <chat token>`. Errors are `{ "error": { "code", "message", "details?" } }`.

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/session` | – | `{ initData, chatId? }` → chat session, or `select-chat` with the user's groups |
| POST | `/api/auth/select-chat` | user token | `{ chatId }` → chat session (membership verified) |
| GET | `/api/folders/:id` (`root`) | files.view | folder, breadcrumbs, subfolders, files |
| GET | `/api/folders/tree` | files.view | full tree for Move dialog |
| POST | `/api/folders` | folders.create | `{ parentId, name }` |
| PATCH | `/api/folders/:id` | folders.rename | `{ name }` |
| DELETE | `/api/folders/:id` | folders.delete | cascades |
| POST | `/api/folders/:id/move` | folders.move | `{ parentId }`, rejects cycles (`INVALID_MOVE`) |
| POST | `/api/files/upload` | files.upload | multipart `file`, `folderId` |
| GET | `/api/files/:id` | files.view | metadata |
| PATCH | `/api/files/:id` | files.rename (or own) | `{ fileName }` |
| DELETE | `/api/files/:id` | files.delete (or own) | best-effort deletes storage message |
| POST | `/api/files/:id/move` | files.move | `{ folderId }` |
| POST | `/api/files/:id/download-url` | files.download | short-lived URL |
| GET | `/api/files/:id/download?t=…` | files.download | streams from Telegram; `disposition=inline` for previews |
| GET | `/api/files/:id/thumbnail?t=…` | files.view | Telegram-generated JPEG thumbnail |
| POST | `/api/files/:id/send` | files.download | re-sends the file to the user's chat with the bot |
| POST | `/api/bulk/delete` | per item | `{ fileIds, folderIds }` → deletes everything in one transaction; one forbidden item rejects the request |
| POST | `/api/bulk/move` | files.move / folders.move | `{ fileIds, folderIds, destinationId }` → one transaction; `INVALID_MOVE` when the destination is a selected folder or inside one |
| POST | `/api/bulk/send` | files.download | `{ fileIds }` → sends each file to the user's chat; `{ sent, failed[] }` per-file results |
| GET | `/api/search?q=` | files.view | scoped to the session's chat |
| POST | `/api/uploads/telegram` | files.upload | `{ folderId }` → `t.me` deep link |
| POST | `/api/telegram/webhook` | secret header | Telegram updates |
| GET | `/api/health` | – | DB check |

Deep links: `https://t.me/<bot>?startapp=c_<chatKey>` (group), `…startapp=folder_<uuid>`, `…startapp=file_<uuid>`.
With a Direct Link Mini App: `https://t.me/<bot>/<short_name>?startapp=…`. The target's group is resolved
server-side and membership is still enforced.

---

## 7. Local development

Prerequisites: Node 22+, pnpm 9+, PostgreSQL 15+ (or Docker), a Telegram bot token, and an HTTPS tunnel
(Telegram only opens Mini Apps over HTTPS): [ngrok](https://ngrok.com), `cloudflared tunnel --url http://localhost:3000`, or similar.

```bash
pnpm install
cp .env.example .env.local            # fill in the values (see comments in the file)
docker compose up -d db               # or use your own PostgreSQL
pnpm db:migrate                       # applies ./drizzle/*.sql
pnpm dev                              # http://localhost:3000
```

Expose it:

```bash
cloudflared tunnel --url http://localhost:3000   # prints https://xxxx.trycloudflare.com
```

Put that HTTPS URL in `NEXT_PUBLIC_APP_URL`, restart `pnpm dev`, then configure the bot (next section).

> Next.js blocks cross-origin requests to dev-only endpoints (including the hot-reload WebSocket). `next.config.ts`
> allow-lists common tunnel domains plus the hostname of `NEXT_PUBLIC_APP_URL` via `allowedDevOrigins`. If you use a
> different tunnel provider and see `Unauthorized` errors in its log, add its domain there.

Receiving bot updates locally, two options:

- **Webhook** (recommended when the tunnel URL is stable): `pnpm telegram:setup` registers `https://<tunnel>/api/telegram/webhook`.
- **Polling**: `pnpm telegram:poll` deletes the webhook and forwards `getUpdates` to your local webhook route, so you don't have to re-register the webhook each time the tunnel URL changes. Run `pnpm telegram:setup` again before deploying.

Useful scripts:

| Script | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm db:generate` | generate a migration from `lib/db/schema.ts` |
| `pnpm db:migrate` | apply migrations (uses `DIRECT_URL` if set) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm telegram:setup [--drop-pending] [--no-webhook]` | webhook, commands, menu button, descriptions |
| `pnpm telegram:poll` | local long-polling bridge |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | checks |

---

## 8. Telegram bot configuration

1. **Create the bot** in [@BotFather](https://t.me/BotFather): `/newbot`. Copy the token into `TELEGRAM_BOT_TOKEN`, the username into `TELEGRAM_BOT_USERNAME` and `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
2. **Enable the Mini App** so direct links work from groups. In @BotFather: *Bot Settings → Configure Mini App → Enable Mini App* and set the URL to `NEXT_PUBLIC_APP_URL`. (This is the "Main Mini App"; links look like `t.me/<bot>?startapp=…`.)
   Alternative: `/newapp` to create a Direct Link Mini App with a short name and set `TELEGRAM_MINI_APP_SHORT_NAME`; links then look like `t.me/<bot>/<short_name>?startapp=…`.
3. **Allow groups**: *Bot Settings → Allow Groups? → Turn groups on*. Group Privacy can stay enabled; commands and `my_chat_member` updates are delivered regardless.
4. **Run the setup script** (sets webhook + secret, commands for private/group scopes with ephemeral `/files`, the `📁 Files` menu button, descriptions):

   ```bash
   pnpm telegram:setup
   ```

5. **(Recommended) Storage channel**: create a private channel, add the bot as an administrator with *Post messages* and *Delete messages*, and put its id (`-100…`) in `TELEGRAM_STORAGE_CHAT_ID`. Get the id by forwarding a channel post to [@userinfobot](https://t.me/userinfobot) or by reading `chat.id` from a `channel_post` update. Without it, files are posted silently into the group itself.
6. **Add the bot to a group as an administrator** and send `/files`. The bot replies (only to you, ephemerally) with an **📁 Open Files** button.

Bot commands: `/files` opens the file manager (group or picker), `/help`, `/done` finishes an "Upload via Telegram" session. The menu button `📁 Files` appears in the bot's private chat and opens the group picker.

---

## 9. Database setup

Any PostgreSQL 15+ works. Two typical setups:

**Local (Docker):** `docker compose up -d db` → `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tg_files`.

**Supabase:** create a project → *Project Settings → Database*. Use the **Transaction pooler** URI (port 6543) as
`DATABASE_URL` and the **direct / session** URI (port 5432) as `DIRECT_URL` (migrations need a direct connection).
The driver is configured with `prepare: false` for pooler compatibility. Only PostgreSQL is used — not Supabase
Storage or Supabase Auth; authentication is Telegram `initData`.

Apply migrations with `pnpm db:migrate`. For schema changes edit `lib/db/schema.ts`, run `pnpm db:generate`, review the SQL in `drizzle/`, commit it, and run `pnpm db:migrate` in each environment.

---

## 10. Production deployment

Requirements: HTTPS, Node 22 runtime, PostgreSQL, and the environment variables from `.env.example`.
Generate secrets with `openssl rand -hex 24` (webhook) and `openssl rand -base64 48` (session).

**Docker (any VPS / Railway / Fly / Render):**

```bash
docker build \
  --build-arg NEXT_PUBLIC_APP_URL=https://files.example.com \
  --build-arg NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=my_files_bot \
  -t tg-files .
docker run --env-file .env.production -p 3000:3000 tg-files
```

Run migrations once per release from a machine with the repo: `DIRECT_URL=… pnpm db:migrate`.
Then `NEXT_PUBLIC_APP_URL=https://files.example.com pnpm telegram:setup` to point the webhook at production.

**Vercel + Supabase (recommended for a quick production setup):**

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new). Framework preset: Next.js. No build settings need changing.
2. Create a Supabase project. In *Project Settings → Database → Connection string*, copy the **Transaction pooler** URI (port 6543) and the **Direct connection** URI (port 5432).
3. Apply the schema from your machine using the direct URI:

   ```bash
   DIRECT_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' pnpm db:migrate
   ```

4. In Vercel → *Settings → Environment Variables*, add every variable from `.env.example`:
   `DATABASE_URL` = pooler URI (6543), `DIRECT_URL` = direct URI (5432), `NEXT_PUBLIC_APP_URL` = `https://<project>.vercel.app`,
   and `MAX_UPLOAD_BYTES=4500000` (Vercel's serverless request-body cap is ~4.5 MB; larger files use **Upload via Telegram**,
   which has no size limit and does not pass through Vercel).
5. Deploy. Check `https://<project>.vercel.app/api/health` returns `{"ok":true,"db":"up"}`.
6. Point Telegram at production: set the Mini App URL in @BotFather to the Vercel URL, then from your machine run

   ```bash
   NEXT_PUBLIC_APP_URL=https://<project>.vercel.app pnpm telegram:setup
   ```

   (the script reads the rest from `.env.local`; the webhook moves from your tunnel to Vercel).

Notes: Vercel's Hobby tier is for non-commercial use; use Pro for work projects. Supabase's free tier pauses idle
projects, which makes the first request after a quiet week slow. Only Supabase's Postgres is used — not Storage or Auth.

**Self-hosted Bot API server (optional, for 20 MB+ browser downloads and up to 2000 MB uploads):** run
[tdlib/telegram-bot-api](https://github.com/tdlib/telegram-bot-api), set `TELEGRAM_API_ROOT=http://bot-api:8081`,
`TELEGRAM_LOCAL_MODE=true` if started with `--local` (the app then reads files from the shared volume),
`MAX_UPLOAD_BYTES=2000000000`, `MAX_DOWNLOAD_BYTES=0`. Log the bot out of the hosted API first (`logOut`) as Telegram requires.

Checklist:

- `NEXT_PUBLIC_APP_URL` equals the Mini App URL configured in @BotFather (Bot API 10.3 enforces the origin).
- Webhook reachable at `https://<host>/api/telegram/webhook` (ports 443/80/88/8443).
- Bot is admin in groups (reliable `getChatMember`) and in the storage channel.
- `SESSION_SECRET` ≥ 32 chars; `TELEGRAM_BOT_TOKEN` / `DATABASE_URL` never prefixed with `NEXT_PUBLIC_`.

---

## 11. Permissions

Roles are derived from `getChatMember` (`lib/permissions/policy.ts`) and cached for `MEMBERSHIP_CACHE_SECONDS`:

| Telegram status | Role | Can |
| --- | --- | --- |
| `creator` | owner | everything below + `chat.manage` (reserved) |
| `administrator` | admin | create/rename/move/delete folders; rename/move/delete any file; + member rights |
| `member` | member | view, download, upload; rename/delete **their own** uploads |
| `restricted` | restricted | view, download |
| `left` / `kicked` | — | no access (403 `NOT_A_MEMBER`) |

Custom roles are supported structurally: `chat_members.custom_role` overrides the derived role for members, and
`ROLE_PERMISSIONS` is the single place to add roles or permissions. Every handler calls `assertCan(...)`; the
`.own` variants are evaluated against `created_by`.

---

## 12. Error handling

| Situation | Behaviour |
| --- | --- |
| Invalid / expired `initData` | 401 `INVALID_INIT_DATA` → Mini App asks to reopen |
| Session token expired | 401 `SESSION_EXPIRED` → client re-authenticates with `initData` automatically |
| User left / was removed from the group | 403 `NOT_A_MEMBER` on the next (re)check |
| Bot removed from the group | `my_chat_member` marks the chat; API returns 403 `BOT_NOT_IN_CHAT` |
| User loses admin rights | role downgraded on the next membership refresh (≤ `MEMBERSHIP_CACHE_SECONDS`) |
| Telegram API failure / rate limit | 502 `TELEGRAM_ERROR` / 429 `RATE_LIMITED`; membership falls back to cache on 429 |
| Upload too large | 413 `FILE_TOO_LARGE` (checked on `Content-Length`, blob size and Telegram's response) |
| Download too large for `getFile` | 413 `FILE_TOO_LARGE_FOR_DOWNLOAD` → "Send to me in Telegram" |
| File deleted on Telegram | 410 `FILE_GONE` |
| Duplicate names | folders: 409 `CONFLICT`; files: automatic `name (2).ext` |
| Blocked file type | 415 `FILE_TYPE_BLOCKED` (`BLOCKED_FILE_EXTENSIONS`) |
| Folder deleted while in use | 404 `NOT_FOUND`; the UI navigates to the parent |
| Invalid move (self/descendant) | 400 `INVALID_MOVE` |
| Database failure | 500 `INTERNAL_ERROR`; `/api/health` reports `db: down` |
| "Send to me" before the user started the bot | 409 `USER_NOT_REACHABLE` with a start link |

Upload UI handles multiple files (2 concurrent), progress, cancel, retry, and per-file errors.

---

## 13. Testing

```bash
pnpm test        # unit tests: initData HMAC validation, deep links, name sanitising, permissions, tree/paths, media extraction
pnpm typecheck
pnpm lint
```

An end-to-end API test lives in `tests/e2e/` (see its README). It runs the real routes against PostgreSQL with a
**test-only** mock of `api.telegram.org`, covering sessions, isolation between groups, permissions, uploads,
downloads (incl. Range), moves, search, deletes, "Upload via Telegram" and deep links.
