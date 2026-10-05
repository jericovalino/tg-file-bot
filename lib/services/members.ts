import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";
import { telegram, TelegramApiError } from "@/lib/telegram/bot-api";
import { isRole, roleFromTelegramStatus, type Role } from "@/lib/permissions/policy";
import { setChatBotStatus } from "./chats";

export interface Membership {
  role: Role;
  telegramStatus: string;
  checkedAt: Date;
}

function resolveRole(telegramStatus: string, isMember: boolean | undefined, customRole: string | null): Role | null {
  const base = roleFromTelegramStatus(telegramStatus, isMember);
  if (!base) return null; // not a member: custom roles never grant access to non-members
  if (customRole && isRole(customRole)) return customRole;
  return base;
}

/**
 * Verifies, via Telegram, that `user` is a member of `chat`, caches the result and returns the role.
 * Throws 403 NOT_A_MEMBER / BOT_NOT_IN_CHAT when access must be denied.
 */
export async function ensureMembership(
  chat: typeof schema.telegramChats.$inferSelect,
  user: typeof schema.users.$inferSelect,
  opts: { force?: boolean } = {},
): Promise<Membership> {
  const cacheSeconds = env().MEMBERSHIP_CACHE_SECONDS;
  const existing = await db.query.chatMembers.findFirst({
    where: and(eq(schema.chatMembers.chatId, chat.id), eq(schema.chatMembers.userId, user.id)),
  });

  const fresh = existing && Date.now() - existing.checkedAt.getTime() < cacheSeconds * 1000;
  if (existing && fresh && !opts.force) {
    const role = resolveRole(existing.telegramStatus, undefined, existing.customRole);
    if (!role) throw new ApiError(403, "NOT_A_MEMBER", "You are not a member of this group anymore.");
    return { role, telegramStatus: existing.telegramStatus, checkedAt: existing.checkedAt };
  }

  if (chat.botStatus === "left" || chat.botStatus === "kicked") {
    throw new ApiError(403, "BOT_NOT_IN_CHAT", "The bot has been removed from this group. Ask an admin to add it back.");
  }

  let status: string;
  let isMember: boolean | undefined;
  try {
    const member = await telegram().getChatMember(chat.telegramChatId, user.telegramUserId);
    status = member.status;
    isMember = member.is_member;
  } catch (err) {
    if (err instanceof TelegramApiError) {
      if (err.isUserNotFound) {
        status = "left";
      } else if (err.isBotNotInChat) {
        await setChatBotStatus(chat.id, "left");
        throw new ApiError(403, "BOT_NOT_IN_CHAT", "The bot has been removed from this group. Ask an admin to add it back.");
      } else if (err.code === 429) {
        // Rate limited: fall back to the cached value if we have one rather than locking everyone out.
        if (existing) {
          const role = resolveRole(existing.telegramStatus, undefined, existing.customRole);
          if (role) return { role, telegramStatus: existing.telegramStatus, checkedAt: existing.checkedAt };
        }
        throw new ApiError(429, "RATE_LIMITED", "Telegram is rate limiting membership checks. Try again shortly.");
      } else {
        throw new ApiError(502, "TELEGRAM_ERROR", `Could not verify group membership: ${err.description}`);
      }
    } else {
      throw err;
    }
  }

  const role = resolveRole(status, isMember, existing?.customRole ?? null);
  const now = new Date();
  await db
    .insert(schema.chatMembers)
    .values({ chatId: chat.id, userId: user.id, telegramStatus: status, role: role ?? "restricted", checkedAt: now })
    .onConflictDoUpdate({
      target: [schema.chatMembers.chatId, schema.chatMembers.userId],
      set: { telegramStatus: status, role: role ?? "restricted", checkedAt: now, updatedAt: sql`now()` },
    });

  if (!role) throw new ApiError(403, "NOT_A_MEMBER", "You are not a member of this group.");
  return { role, telegramStatus: status, checkedAt: now };
}

/** Record that a user was seen in a chat (e.g. they sent /files there); verification happens lazily. */
export async function recordSeenMember(chatId: string, userId: string, telegramStatus = "member", tx?: Tx) {
  const role = roleFromTelegramStatus(telegramStatus) ?? "member";
  const epoch = new Date(0); // force a real check on first API use
  await (tx ?? db)
    .insert(schema.chatMembers)
    .values({ chatId, userId, telegramStatus, role, checkedAt: epoch })
    .onConflictDoNothing();
}

/** Chats the user has been seen in and the bot is still part of. Used by the chat picker. */
export async function listCandidateChats(userId: string) {
  return db
    .select({ chat: schema.telegramChats, member: schema.chatMembers })
    .from(schema.chatMembers)
    .innerJoin(schema.telegramChats, eq(schema.chatMembers.chatId, schema.telegramChats.id))
    .where(
      and(
        eq(schema.chatMembers.userId, userId),
        sql`${schema.telegramChats.botStatus} not in ('left','kicked')`,
        sql`${schema.telegramChats.type} in ('group','supergroup')`,
      ),
    )
    .orderBy(schema.telegramChats.title)
    .limit(50);
}
