import "@/lib/server-guard";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env, effectiveLimits } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";
import { InitDataError, validateInitData, type ParsedInitData } from "@/lib/telegram/init-data";
import { buildMiniAppLink, parseStartParam } from "@/lib/telegram/links";
import { signToken } from "@/lib/auth/session";
import { permissionsForRole } from "@/lib/permissions/policy";
import type { ChatChoiceDto, ChatSessionDto, SelectChatSessionDto, SessionDto, StartTargetDto } from "@/lib/types";
import { getChatById, getChatByInstance, getChatByKey, rememberChatInstance, toChatDto } from "./chats";
import { toUserDto, upsertUser } from "./users";
import { ensureMembership, listCandidateChats } from "./members";

type ChatRow = typeof schema.telegramChats.$inferSelect;

function deepLinkBase() {
  const e = env();
  return buildMiniAppLink(e.TELEGRAM_BOT_USERNAME, "X", e.TELEGRAM_MINI_APP_SHORT_NAME).replace(/X$/, "");
}

async function resolveChatFromStart(parsed: ParsedInitData): Promise<{ chat: ChatRow; target: StartTargetDto; viaChatLink: boolean } | null> {
  const target = parseStartParam(parsed.startParam);
  if (target) {
    if (target.type === "chat") {
      const chat = await getChatByKey(target.chatKey);
      return chat ? { chat, target: {}, viaChatLink: true } : null;
    }
    if (target.type === "folder") {
      const folder = await db.query.folders.findFirst({ where: eq(schema.folders.id, target.folderId) });
      if (!folder) return null;
      const chat = await getChatById(folder.chatId);
      return chat ? { chat, target: { folderId: folder.id }, viaChatLink: false } : null;
    }
    if (target.type === "file") {
      const file = await db.query.files.findFirst({ where: eq(schema.files.id, target.fileId) });
      if (!file) return null;
      const chat = await getChatById(file.chatId);
      return chat ? { chat, target: { folderId: file.folderId, fileId: file.id }, viaChatLink: false } : null;
    }
  }
  // Attachment-menu launches carry the chat object directly.
  if (parsed.chat && (parsed.chat.type === "group" || parsed.chat.type === "supergroup")) {
    const chat = await db.query.telegramChats.findFirst({ where: eq(schema.telegramChats.telegramChatId, parsed.chat.id) });
    if (chat) return { chat, target: {}, viaChatLink: false };
  }
  // Direct-link launches from a group we've seen before.
  if (parsed.chatInstance && (parsed.chatType === "group" || parsed.chatType === "supergroup")) {
    const chat = await getChatByInstance(parsed.chatInstance);
    if (chat) return { chat, target: {}, viaChatLink: false };
  }
  return null;
}

/**
 * Exchanges Telegram Mini App initData for a session. Resolution order for the chat:
 *   start_param (c_<chatKey> | folder_<id> | file_<id>) → initData.chat → known chat_instance → explicit selection.
 * Membership is always verified against Telegram before a chat session is issued.
 */
export async function createSession(initDataRaw: string, selectedChatId?: string): Promise<SessionDto> {
  const e = env();
  let parsed: ParsedInitData;
  try {
    parsed = validateInitData(initDataRaw, e.TELEGRAM_BOT_TOKEN, e.INIT_DATA_MAX_AGE_SECONDS);
  } catch (err) {
    if (err instanceof InitDataError) throw new ApiError(401, "INVALID_INIT_DATA", err.message, { reason: err.code });
    throw err;
  }
  const user = await upsertUser(parsed.user);

  let resolved = await resolveChatFromStart(parsed);
  if (!resolved && selectedChatId) {
    const chat = await getChatById(selectedChatId);
    if (chat) resolved = { chat, target: {}, viaChatLink: false };
  }

  if (!resolved) return selectChatSession(user);

  const { chat, target, viaChatLink } = resolved;
  const membership = await ensureMembership(chat, user, { force: true });

  if (viaChatLink && parsed.chatInstance && !chat.chatInstance && (parsed.chatType === "group" || parsed.chatType === "supergroup")) {
    await rememberChatInstance(chat.id, parsed.chatInstance);
  }

  const ttl = e.SESSION_TTL_SECONDS;
  const [token, mediaToken] = await Promise.all([
    signToken({ kind: "chat", sub: user.id, tg: user.telegramUserId, chat: chat.id, role: membership.role }, ttl),
    signToken({ kind: "media", sub: user.id, tg: user.telegramUserId, chat: chat.id }, ttl),
  ]);

  const session: ChatSessionDto = {
    status: "chat",
    token,
    mediaToken,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    user: toUserDto(user),
    chat: toChatDto(chat),
    role: membership.role,
    permissions: [...permissionsForRole(membership.role)],
    limits: effectiveLimits(),
    botUsername: e.TELEGRAM_BOT_USERNAME,
    deepLinkBase: deepLinkBase(),
    target,
  };
  return session;
}

async function selectChatSession(user: typeof schema.users.$inferSelect): Promise<SelectChatSessionDto> {
  const e = env();
  const candidates = await listCandidateChats(user.id);
  const checks = await Promise.allSettled(
    candidates.slice(0, 25).map(async ({ chat }) => {
      const m = await ensureMembership(chat, user);
      return { id: chat.id, title: chat.title, type: chat.type, role: m.role } satisfies ChatChoiceDto;
    }),
  );
  const chats = checks.flatMap((c) => (c.status === "fulfilled" ? [c.value] : []));
  const token = await signToken({ kind: "user", sub: user.id, tg: user.telegramUserId }, 15 * 60);
  return { status: "select-chat", token, user: toUserDto(user), chats, botUsername: e.TELEGRAM_BOT_USERNAME };
}

/** Second step of the picker flow: a user token + a chat id the user is a member of → chat session. */
export async function createSessionForSelectedChat(userId: string, chatId: string): Promise<ChatSessionDto> {
  const e = env();
  const [user, chat] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, userId) }),
    db.query.telegramChats.findFirst({ where: and(eq(schema.telegramChats.id, chatId)) }),
  ]);
  if (!user) throw new ApiError(401, "UNAUTHORIZED", "Unknown user.");
  if (!chat) throw ApiError.notFound("Group");
  const membership = await ensureMembership(chat, user, { force: true });
  const ttl = e.SESSION_TTL_SECONDS;
  const [token, mediaToken] = await Promise.all([
    signToken({ kind: "chat", sub: user.id, tg: user.telegramUserId, chat: chat.id, role: membership.role }, ttl),
    signToken({ kind: "media", sub: user.id, tg: user.telegramUserId, chat: chat.id }, ttl),
  ]);
  return {
    status: "chat",
    token,
    mediaToken,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    user: toUserDto(user),
    chat: toChatDto(chat),
    role: membership.role,
    permissions: [...permissionsForRole(membership.role)],
    limits: effectiveLimits(),
    botUsername: e.TELEGRAM_BOT_USERNAME,
    deepLinkBase: deepLinkBase(),
    target: {},
  };
}
