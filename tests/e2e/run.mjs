// End-to-end API test against a running dev server (pnpm dev on BASE) + mock Telegram (tests/e2e/mock-telegram.mjs).
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "123456789:AAtestTOKENtestTOKENtestTOKENtestTOKEN";
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "local_dev_webhook_secret_123";

function signInitData(fields) {
  const params = new URLSearchParams(fields);
  const dcs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(dcs).digest("hex"));
  return params.toString();
}

function initDataFor(userId, startParam) {
  return signInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: `User${userId}`, username: `user${userId}` }),
    chat_type: "supergroup",
    chat_instance: `inst_${startParam}`,
    ...(startParam ? { start_param: startParam } : {}),
  });
}

async function webhook(update) {
  const res = await fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
    body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), ...update }),
  });
  assert.equal(res.status, 200, "webhook should return 200");
}

async function api(token, method, path, body, raw = false) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  if (raw) return res;
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const step = (name) => console.log(`✓ ${name}`);
const chatA = -1001000000001;
const chatB = -1001000000002;

// 0. webhook without secret is rejected
{
  const res = await fetch(`${BASE}/api/telegram/webhook`, { method: "POST", body: "{}" });
  assert.equal(res.status, 403);
  step("webhook rejects missing secret");
}

// 1. bot added to two groups → chats created
for (const [id, title] of [[chatA, "Group A"], [chatB, "Group B"]]) {
  await webhook({
    my_chat_member: {
      chat: { id, type: "supergroup", title },
      from: { id: 1, is_bot: false, first_name: "Owner" },
      date: 1,
      old_chat_member: { status: "left", user: { id: 999, is_bot: true, first_name: "Files" } },
      new_chat_member: { status: "administrator", user: { id: 999, is_bot: true, first_name: "Files" } },
    },
  });
}
step("bot added to groups via my_chat_member");

// 2. /files in group A from user 1 → records membership; we need the chat_key: fetch it through the DB-less route:
//    the bot reply contains the deep link; our mock doesn't expose it, so resolve via the picker flow instead.
await webhook({
  message: {
    message_id: 1,
    date: 1,
    chat: { id: chatA, type: "supergroup", title: "Group A" },
    from: { id: 1, is_bot: false, first_name: "Owner" },
    text: "/files@test_files_bot",
    entities: [{ type: "bot_command", offset: 0, length: 21 }],
  },
});
await webhook({
  message: {
    message_id: 2,
    date: 1,
    chat: { id: chatB, type: "supergroup", title: "Group B" },
    from: { id: 2, is_bot: false, first_name: "Member" },
    text: "/files",
    entities: [{ type: "bot_command", offset: 0, length: 6 }],
  },
});
step("/files commands handled");

// 3. Session without start_param → chat picker (user 1 sees Group A)
let r = await api(null, "POST", "/api/auth/session", { initData: initDataFor(1) });
assert.equal(r.status, 200, JSON.stringify(r.json));
assert.equal(r.json.status, "select-chat");
assert.ok(r.json.chats.some((c) => c.title === "Group A"), "owner should see Group A in picker");
const pickerToken = r.json.token;
const groupAId = r.json.chats.find((c) => c.title === "Group A").id;
step("picker lists groups the user was seen in");

// 4. Select chat → chat session (owner)
r = await api(pickerToken, "POST", "/api/auth/select-chat", { chatId: groupAId });
assert.equal(r.status, 200, JSON.stringify(r.json));
assert.equal(r.json.role, "owner");
const owner = r.json.token;
const ownerMedia = r.json.mediaToken;
const chatKeyA = r.json.chat.chatKey;
step("owner session for Group A (role=owner)");

// 5. Deep link start_param c_<key> resolves the chat directly (member user 2)
r = await api(null, "POST", "/api/auth/session", { initData: initDataFor(2, `c_${chatKeyA}`) });
assert.equal(r.status, 200, JSON.stringify(r.json));
assert.equal(r.json.status, "chat");
assert.equal(r.json.role, "member");
const member = r.json.token;
step("start_param c_<chatKey> → member session");

// 6. Non-member is rejected
r = await api(null, "POST", "/api/auth/session", { initData: initDataFor(3, `c_${chatKeyA}`) });
assert.equal(r.status, 403);
assert.equal(r.json.error.code, "NOT_A_MEMBER");
step("non-member rejected (403 NOT_A_MEMBER)");

// 7. Tampered initData rejected
r = await api(null, "POST", "/api/auth/session", { initData: initDataFor(1, `c_${chatKeyA}`).replace("User1", "Mallory") });
assert.equal(r.status, 401);
assert.equal(r.json.error.code, "INVALID_INIT_DATA");
step("tampered initData rejected (401)");

// 8. Folder CRUD
r = await api(member, "POST", "/api/folders", { parentId: null, name: "Events" });
assert.equal(r.status, 403, "member must not create folders");
step("member cannot create folders (403)");

r = await api(owner, "POST", "/api/folders", { parentId: null, name: "Events" });
assert.equal(r.status, 201, JSON.stringify(r.json));
const events = r.json.folder;
r = await api(owner, "POST", "/api/folders", { parentId: events.id, name: "2026" });
const y2026 = r.json.folder;
r = await api(owner, "POST", "/api/folders", { parentId: y2026.id, name: "Photos" });
const photos = r.json.folder;
r = await api(owner, "POST", "/api/folders", { parentId: null, name: "events" });
assert.equal(r.status, 409, "duplicate (case-insensitive) sibling name must conflict");
r = await api(owner, "POST", "/api/folders", { parentId: null, name: "a/b" });
assert.equal(r.status, 400);
step("folders created; duplicate + invalid names rejected");

r = await api(member, "GET", `/api/folders/${photos.id}`);
assert.equal(r.status, 200);
assert.deepEqual(r.json.breadcrumbs.map((b) => b.name), ["Group Files", "Events", "2026", "Photos"]);
step("breadcrumbs: Group Files / Events / 2026 / Photos");

// 9. Upload (member can) into Photos
const form = new FormData();
form.append("file", new Blob([Buffer.alloc(2048, 7)], { type: "image/png" }), "Photo 1.png");
form.append("folderId", photos.id);
r = await api(member, "POST", "/api/files/upload", form);
assert.equal(r.status, 201, JSON.stringify(r.json));
const photo1 = r.json.file;
assert.equal(photo1.fileName, "Photo 1.png");
assert.equal(photo1.mimeType, "image/png");
assert.equal(photo1.fileSize, 2048);
assert.equal(photo1.hasThumbnail, true);
step("member uploaded Photo 1.png (stored as Telegram file_id)");

const form2 = new FormData();
form2.append("file", new Blob([Buffer.alloc(10)], { type: "image/png" }), "Photo 1.png");
form2.append("folderId", photos.id);
r = await api(member, "POST", "/api/files/upload", form2);
assert.equal(r.status, 201);
assert.equal(r.json.file.fileName, "Photo 1 (2).png");
const photo2 = r.json.file;
step("duplicate file name auto-suffixed → Photo 1 (2).png");

const big = new FormData();
big.append("file", new Blob([Buffer.alloc(21 * 1024 * 1024)]), "big.bin");
r = await api(member, "POST", "/api/files/upload", big);
assert.equal(r.status, 413);
assert.equal(r.json.error.code, "FILE_TOO_LARGE");
step("oversized upload rejected (413 FILE_TOO_LARGE)");

// 10. Listing contains folders + files
r = await api(member, "GET", `/api/folders/${photos.id}`);
assert.equal(r.json.files.length, 2);
r = await api(member, "GET", "/api/folders/root");
assert.deepEqual(r.json.folders.map((f) => f.name), ["Events"]);
step("listing shows folders and files");

// 11. Download via short-lived URL + thumbnail via media token + range request
r = await api(member, "POST", `/api/files/${photo1.id}/download-url`);
assert.equal(r.status, 200, JSON.stringify(r.json));
let dl = await fetch(r.json.url.replace(/^https?:\/\/[^/]+/, BASE));
assert.equal(dl.status, 200);
assert.match(dl.headers.get("content-disposition"), /attachment; filename="Photo 1.png"/);
assert.equal((await dl.arrayBuffer()).byteLength, 2800);
dl = await fetch(`${r.json.url.replace(/^https?:\/\/[^/]+/, BASE)}&disposition=inline`, { headers: { range: "bytes=0-99" } });
assert.equal(dl.status, 206);
assert.equal(dl.headers.get("content-type"), "image/png");
assert.equal((await dl.arrayBuffer()).byteLength, 100);
const th = await fetch(`${BASE}/api/files/${photo1.id}/thumbnail?t=${encodeURIComponent(ownerMedia)}`);
assert.equal(th.status, 200);
assert.equal(th.headers.get("content-type"), "image/jpeg");
// download token for photo1 must not work for photo2
dl = await fetch(r.json.url.replace(/^https?:\/\/[^/]+/, BASE).replace(photo1.id, photo2.id));
assert.equal(dl.status, 403);
step("download streams bytes (attachment/inline/range); token bound to one file");

// 12. Rename / move / cycle protection
r = await api(member, "PATCH", `/api/files/${photo1.id}`, { fileName: "Cover" });
assert.equal(r.status, 200, "member may rename own file");
assert.equal(r.json.file.fileName, "Cover.png", "extension preserved");
r = await api(member, "POST", `/api/files/${photo1.id}/move`, { folderId: events.id });
assert.equal(r.status, 403, "member cannot move files");
r = await api(owner, "POST", `/api/files/${photo1.id}/move`, { folderId: events.id });
assert.equal(r.status, 200);
assert.equal(r.json.file.folderId, events.id);
r = await api(owner, "POST", `/api/folders/${events.id}/move`, { parentId: photos.id });
assert.equal(r.status, 400);
assert.equal(r.json.error.code, "INVALID_MOVE");
r = await api(owner, "POST", `/api/folders/${events.id}/move`, { parentId: events.id });
assert.equal(r.status, 400);
r = await api(owner, "POST", "/api/folders", { parentId: null, name: "Lessons" });
const lessons = r.json.folder;
r = await api(owner, "POST", `/api/folders/${y2026.id}/move`, { parentId: lessons.id });
assert.equal(r.status, 200);
r = await api(owner, "GET", `/api/folders/${photos.id}`);
assert.deepEqual(r.json.breadcrumbs.map((b) => b.name), ["Group Files", "Lessons", "2026", "Photos"], "descendants follow the moved folder");
step("rename/move work; moving into self/descendant rejected");

// 13. Search scoped to chat
r = await api(member, "GET", "/api/search?q=photo");
assert.equal(r.status, 200);
assert.ok(r.json.folders.some((f) => f.name === "Photos"));
assert.ok(r.json.files.some((f) => f.fileName === "Photo 1 (2).png"));
assert.deepEqual(r.json.files[0].path.map((p) => p.name), ["Group Files", "Lessons", "2026", "Photos"]);
step("search returns folders + files with paths");

// 14. Cross-group isolation: user 2 opens Group B, tries to reach Group A resources by id
r = await api(null, "POST", "/api/auth/session", { initData: initDataFor(2) });
const groupBId = r.json.chats.find((c) => c.title === "Group B").id;
r = await api(r.json.token, "POST", "/api/auth/select-chat", { chatId: groupBId });
const memberB = r.json.token;
for (const [m, p] of [
  ["GET", `/api/folders/${photos.id}`],
  ["GET", `/api/files/${photo1.id}`],
  ["POST", `/api/files/${photo1.id}/download-url`],
  ["PATCH", `/api/files/${photo1.id}`],
  ["DELETE", `/api/files/${photo2.id}`],
]) {
  r = await api(memberB, m, p, m === "PATCH" ? { fileName: "x" } : undefined);
  assert.equal(r.status, 404, `${m} ${p} from another group must 404, got ${r.status}`);
}
r = await api(memberB, "GET", "/api/search?q=photo");
assert.equal(r.json.files.length + r.json.folders.length, 0);
r = await api(memberB, "POST", "/api/files/upload", (() => { const f = new FormData(); f.append("file", new Blob([Buffer.alloc(3)]), "x.bin"); f.append("folderId", photos.id); return f; })());
assert.equal(r.status, 404, "cannot upload into another group's folder");
step("cross-group access by id is impossible (404s, empty search)");

// 15. Tokens: media token can't do writes; download token can't list
r = await api(ownerMedia, "GET", "/api/folders/root");
assert.equal(r.status, 401);
step("read grants cannot be used as session tokens");

// 16. Delete: member can delete own file, not others'; owner deletes folder tree
r = await api(member, "DELETE", `/api/files/${photo2.id}`);
assert.equal(r.status, 200);
const f3 = new FormData();
f3.append("file", new Blob([Buffer.alloc(3)]), "owner.txt");
r = await api(owner, "POST", "/api/files/upload", f3);
const ownersFile = r.json.file;
r = await api(member, "DELETE", `/api/files/${ownersFile.id}`);
assert.equal(r.status, 403);
r = await api(owner, "DELETE", `/api/folders/${lessons.id}`);
assert.equal(r.status, 200);
assert.equal(r.json.removedFolders, 3);
r = await api(owner, "GET", `/api/folders/${photos.id}`);
assert.equal(r.status, 404);
step("delete respects ownership; folder delete cascades");

// 17. Upload via Telegram: session + incoming document through the webhook
r = await api(member, "POST", "/api/uploads/telegram", { folderId: events.id });
assert.equal(r.status, 201, JSON.stringify(r.json));
const sessionId = r.json.sessionId;
assert.match(r.json.link, /t\.me\/test_files_bot\?start=up_/);
await webhook({ message: { message_id: 10, date: 1, chat: { id: 2, type: "private" }, from: { id: 2, is_bot: false, first_name: "Member" }, text: `/start up_${sessionId}`, entities: [{ type: "bot_command", offset: 0, length: 6 }] } });
await webhook({
  message: {
    message_id: 11,
    date: Math.floor(Date.now() / 1000),
    chat: { id: 2, type: "private" },
    from: { id: 2, is_bot: false, first_name: "Member" },
    document: { file_id: "doc_big_1", file_unique_id: "u_big_1", file_name: "Lecture.mp4", mime_type: "video/mp4", file_size: 1_500_000_000 },
  },
});
r = await api(member, "GET", `/api/folders/${events.id}`);
const lecture = r.json.files.find((f) => f.fileName === "Lecture.mp4");
assert.ok(lecture, "file sent to the bot must be filed into the chosen folder");
assert.equal(lecture.browserDownloadable, false, "1.5 GB file is not browser-downloadable");
r = await api(member, "POST", `/api/files/${lecture.id}/download-url`);
assert.equal(r.json.browserDownloadable, false);
dl = await fetch(r.json.url.replace(/^https?:\/\/[^/]+/, BASE));
assert.equal(dl.status, 413);
r = await api(member, "POST", `/api/files/${lecture.id}/send`);
assert.equal(r.status, 200, "send-to-me works regardless of size");
step("upload via Telegram (1.5 GB) filed correctly; too-big download → 413; send-to-me OK");

// 17b. Bulk operations: permission-checked as a whole, atomic delete/move, per-file send results
async function uploadAs(token, name, folderId = null) {
  const fd = new FormData();
  fd.append("file", new Blob([Buffer.alloc(16, 1)], { type: "text/plain" }), name);
  if (folderId) fd.append("folderId", folderId);
  const res = await api(token, "POST", "/api/files/upload", fd);
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json.file;
}
r = await api(owner, "POST", "/api/folders", { parentId: null, name: "Bulk A" });
const bulkA = r.json.folder;
r = await api(owner, "POST", "/api/folders", { parentId: bulkA.id, name: "Sub" });
const bulkSub = r.json.folder;
r = await api(owner, "POST", "/api/folders", { parentId: null, name: "Bulk B" });
const bulkB = r.json.folder;
const b1 = await uploadAs(member, "b1.txt");
const b2 = await uploadAs(member, "b2.txt");
const ownersBulkFile = await uploadAs(owner, "o.txt");

r = await api(owner, "POST", "/api/bulk/delete", { fileIds: [], folderIds: [] });
assert.equal(r.status, 400, "empty selection rejected");
r = await api(member, "POST", "/api/bulk/delete", { fileIds: [b1.id, ownersBulkFile.id] });
assert.equal(r.status, 403, "one forbidden item rejects the whole bulk delete");
r = await api(member, "GET", `/api/files/${b1.id}`);
assert.equal(r.status, 200, "nothing was deleted when the request was rejected");
r = await api(member, "POST", "/api/bulk/move", { fileIds: [b1.id], destinationId: bulkA.id });
assert.equal(r.status, 403, "members cannot move files");
r = await api(memberB, "POST", "/api/bulk/delete", { fileIds: [b1.id] });
assert.equal(r.status, 404, "ids from another group are invisible");
r = await api(owner, "POST", "/api/bulk/send", { fileIds: [b1.id, "00000000-0000-4000-8000-000000000000"] });
assert.equal(r.status, 404, "unknown id → 404, nothing sent");
step("bulk: empty/forbidden/cross-group/unknown selections rejected as a whole");

r = await api(owner, "POST", "/api/bulk/move", { fileIds: [b1.id, b2.id], folderIds: [bulkB.id], destinationId: bulkA.id });
assert.equal(r.status, 200, JSON.stringify(r.json));
assert.deepEqual({ movedFiles: r.json.movedFiles, movedFolders: r.json.movedFolders }, { movedFiles: 2, movedFolders: 1 });
r = await api(owner, "GET", `/api/folders/${bulkA.id}`);
assert.deepEqual(r.json.folders.map((f) => f.name).sort(), ["Bulk B", "Sub"]);
assert.deepEqual(r.json.files.map((f) => f.fileName).sort(), ["b1.txt", "b2.txt"]);
r = await api(owner, "POST", "/api/bulk/move", { fileIds: [b1.id], folderIds: [bulkB.id], destinationId: bulkA.id });
assert.equal(r.status, 200);
assert.equal(r.json.movedFiles + r.json.movedFolders, 0, "already in place → no-op");
r = await api(owner, "POST", "/api/bulk/move", { folderIds: [bulkA.id], destinationId: bulkSub.id });
assert.equal(r.status, 400);
assert.equal(r.json.error.code, "INVALID_MOVE", "cannot move a folder into its own subfolder");
r = await api(owner, "POST", "/api/bulk/move", { folderIds: [bulkA.id, bulkB.id], destinationId: bulkA.id });
assert.equal(r.json.error.code, "INVALID_MOVE", "cannot move a selection into one of the selected folders");
r = await api(owner, "POST", "/api/folders", { parentId: bulkSub.id, name: "Bulk B" });
assert.equal(r.status, 201);
r = await api(owner, "POST", "/api/bulk/move", { folderIds: [bulkB.id], fileIds: [b1.id], destinationId: bulkSub.id });
assert.equal(r.status, 409, "name clash in destination → CONFLICT, nothing moved");
r = await api(owner, "GET", `/api/files/${b1.id}`);
assert.equal(r.json.file.folderId, bulkA.id, "file stayed put when the folder move failed (atomic)");
const dup = await uploadAs(owner, "b1.txt", bulkSub.id);
r = await api(owner, "POST", "/api/bulk/move", { fileIds: [b1.id], destinationId: bulkSub.id });
assert.equal(r.status, 200);
r = await api(owner, "GET", `/api/folders/${bulkSub.id}`);
assert.deepEqual(r.json.files.map((f) => f.fileName).sort(), ["b1 (2).txt", "b1.txt"], "moved file gets a deduped name");
step("bulk move: atomic, cycle-safe, dedupes names, no-op when already in place");

r = await api(member, "POST", "/api/bulk/send", { fileIds: [b1.id, b2.id] });
assert.equal(r.status, 200, JSON.stringify(r.json));
assert.deepEqual({ sent: r.json.sent, failed: r.json.failed }, { sent: 2, failed: [] });
step("bulk send delivers each file");

r = await api(owner, "POST", "/api/bulk/delete", { fileIds: [ownersBulkFile.id], folderIds: [bulkA.id] });
assert.equal(r.status, 200, JSON.stringify(r.json));
assert.equal(r.json.removedFolders, 4, "Bulk A, Sub, Bulk B (moved) and Sub/Bulk B");
assert.equal(r.json.removedFiles, 4, "o.txt + b1, b2 and the duplicate inside the tree");
r = await api(owner, "GET", `/api/folders/${bulkB.id}`);
assert.equal(r.status, 404);
r = await api(owner, "GET", `/api/files/${dup.id}`);
assert.equal(r.status, 404);
step("bulk delete removes files and whole folder trees in one transaction");

// 18. Deep link to a file resolves chat + target
r = await api(null, "POST", "/api/auth/session", { initData: initDataFor(1, `file_${lecture.id}`) });
assert.equal(r.json.status, "chat");
assert.equal(r.json.target.fileId, lecture.id);
assert.equal(r.json.target.folderId, events.id);
r = await api(null, "POST", "/api/auth/session", { initData: initDataFor(3, `file_${lecture.id}`) });
assert.equal(r.status, 403, "deep link does not bypass membership");
step("file deep links resolve target; membership still enforced");

// 19. Health
r = await api(null, "GET", "/api/health");
assert.equal(r.json.ok, true);
step("health ok");

console.log("\nAll end-to-end checks passed.");
