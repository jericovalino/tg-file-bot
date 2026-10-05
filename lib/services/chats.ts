import "server-only";
import { eq, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db, schema } from "@/lib/db";
import type { TgChat } from "@/lib/telegram/types";
import type { ChatDto } from "@/lib/types";

const chatKeyAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", 16);

export function chatTitle(chat: TgChat) {
  return chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(" ") ?? String(chat.id);
}

/** Insert or refresh a chat row from a Telegram Chat object. */
export async function upsertChat(chat: TgChat, botStatus?: string) {
  const [row] = await db
    .insert(schema.telegramChats)
    .values({
      telegramChatId: chat.id,
      chatKey: chatKeyAlphabet(),
      title: chatTitle(chat),
      type: chat.type,
      username: chat.username ?? null,
      botStatus: botStatus ?? "member",
    })
    .onConflictDoUpdate({
      target: schema.telegramChats.telegramChatId,
      set: {
        title: sql`excluded.title`,
        type: sql`excluded.type`,
        username: sql`excluded.username`,
        ...(botStatus ? { botStatus } : {}),
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return row;
}

export async function getChatById(id: string) {
  return db.query.telegramChats.findFirst({ where: eq(schema.telegramChats.id, id) });
}

export async function getChatByKey(chatKey: string) {
  return db.query.telegramChats.findFirst({ where: eq(schema.telegramChats.chatKey, chatKey) });
}

export async function getChatByTelegramId(telegramChatId: number) {
  return db.query.telegramChats.findFirst({ where: eq(schema.telegramChats.telegramChatId, telegramChatId) });
}

export async function getChatByInstance(chatInstance: string) {
  return db.query.telegramChats.findFirst({ where: eq(schema.telegramChats.chatInstance, chatInstance) });
}

export async function setChatBotStatus(id: string, botStatus: string) {
  await db.update(schema.telegramChats).set({ botStatus, updatedAt: new Date() }).where(eq(schema.telegramChats.id, id));
}

/** Remember the Mini App chat_instance for a chat so later launches can resolve it without a start_param. */
export async function rememberChatInstance(id: string, chatInstance: string) {
  try {
    await db
      .update(schema.telegramChats)
      .set({ chatInstance, updatedAt: new Date() })
      .where(sql`${schema.telegramChats.id} = ${id} and ${schema.telegramChats.chatInstance} is null`);
  } catch {
    // unique violation: another chat already claimed this instance — ignore.
  }
}

/** Telegram supergroup migration: the chat id changes, keep the same row. */
export async function migrateChatId(oldId: number, newId: number) {
  await db
    .update(schema.telegramChats)
    .set({ telegramChatId: newId, type: "supergroup", updatedAt: new Date() })
    .where(eq(schema.telegramChats.telegramChatId, oldId));
}

export function toChatDto(c: typeof schema.telegramChats.$inferSelect): ChatDto {
  return { id: c.id, chatKey: c.chatKey, title: c.title, type: c.type, botStatus: c.botStatus };
}
