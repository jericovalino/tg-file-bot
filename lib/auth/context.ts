import "server-only";
import { ApiError } from "@/lib/api/errors";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ensureMembership } from "@/lib/services/members";
import { bearerToken, verifyToken, type SessionClaims } from "./session";
import type { Role } from "@/lib/permissions/policy";
import type { Principal } from "@/lib/permissions";

export interface ChatContext {
  claims: SessionClaims;
  user: typeof schema.users.$inferSelect;
  chat: typeof schema.telegramChats.$inferSelect;
  role: Role;
  principal: Principal;
}

export interface UserContext {
  claims: SessionClaims;
  user: typeof schema.users.$inferSelect;
}

async function loadUser(id: string) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
  if (!user) throw new ApiError(401, "UNAUTHORIZED", "Unknown user.");
  return user;
}

async function loadChat(id: string) {
  const chat = await db.query.telegramChats.findFirst({ where: eq(schema.telegramChats.id, id) });
  if (!chat) throw new ApiError(404, "NOT_FOUND", "This group is no longer available.");
  return chat;
}

/**
 * Every chat-scoped API call goes through here:
 *   token → Telegram user → chat bound to the token → membership re-verified (cached) → role.
 * Resource ownership (folder/file belongs to this chat) is checked by the services using ctx.chat.id.
 */
export async function requireChatContext(req: Request): Promise<ChatContext> {
  const token = bearerToken(req);
  if (!token) throw new ApiError(401, "UNAUTHORIZED", "Missing session token.");
  const claims = await verifyToken(token, ["chat"]);
  if (!claims.chat) throw new ApiError(401, "CHAT_NOT_SELECTED", "No group selected.");
  const [user, chat] = await Promise.all([loadUser(claims.sub), loadChat(claims.chat)]);
  const membership = await ensureMembership(chat, user);
  return { claims, user, chat, role: membership.role, principal: { userId: user.id, role: membership.role } };
}

export async function requireUserContext(req: Request): Promise<UserContext> {
  const token = bearerToken(req);
  if (!token) throw new ApiError(401, "UNAUTHORIZED", "Missing session token.");
  const claims = await verifyToken(token, ["user", "chat"]);
  const user = await loadUser(claims.sub);
  return { claims, user };
}

/** Validates a read grant carried in a URL query string (`?t=`), for downloads/thumbnails. */
export async function requireReadGrant(req: Request, fileId: string): Promise<ChatContext> {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? bearerToken(req);
  if (!token) throw new ApiError(401, "UNAUTHORIZED", "Missing access token.");
  const claims = await verifyToken(token, ["download", "media", "chat"]);
  if (claims.kind === "download" && claims.file !== fileId) throw new ApiError(403, "FORBIDDEN", "This link is not valid for this file.");
  if (!claims.chat) throw new ApiError(401, "CHAT_NOT_SELECTED", "No group selected.");
  const [user, chat] = await Promise.all([loadUser(claims.sub), loadChat(claims.chat)]);
  // Download tokens are short-lived and already gated at issue time; re-check membership from cache only.
  const membership = await ensureMembership(chat, user);
  return { claims, user, chat, role: membership.role, principal: { userId: user.id, role: membership.role } };
}
