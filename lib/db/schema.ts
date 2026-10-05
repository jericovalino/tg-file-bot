import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  bigint,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramUserId: bigint("telegram_user_id", { mode: "number" }).notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    username: text("username"),
    languageCode: text("language_code"),
    photoUrl: text("photo_url"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_telegram_user_id_uq").on(t.telegramUserId)],
);

export const telegramChats = pgTable(
  "telegram_chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramChatId: bigint("telegram_chat_id", { mode: "number" }).notNull(),
    /** Opaque public key used in deep links (never the raw Telegram chat id). */
    chatKey: text("chat_key").notNull(),
    title: text("title").notNull(),
    type: text("type").notNull(), // group | supergroup | channel | private
    username: text("username"),
    /** Mini App `chat_instance` learned from a direct-link launch; lets later launches resolve the chat without start_param. */
    chatInstance: text("chat_instance"),
    /** Bot membership in this chat: member | administrator | restricted | left | kicked */
    botStatus: text("bot_status").notNull().default("member"),
    /** Per-chat override of the storage chat (defaults to env TELEGRAM_STORAGE_CHAT_ID, then the chat itself). */
    storageChatId: bigint("storage_chat_id", { mode: "number" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("telegram_chats_telegram_chat_id_uq").on(t.telegramChatId),
    uniqueIndex("telegram_chats_chat_key_uq").on(t.chatKey),
    uniqueIndex("telegram_chats_chat_instance_uq").on(t.chatInstance),
  ],
);

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: uuid("chat_id")
      .notNull()
      .references(() => telegramChats.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Raw Telegram ChatMember status: creator | administrator | member | restricted | left | kicked */
    telegramStatus: text("telegram_status").notNull(),
    /** Resolved application role (owner | admin | member | restricted). */
    role: text("role").notNull(),
    /** Optional custom role assigned inside the app; takes precedence over the Telegram-derived role. */
    customRole: text("custom_role"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.chatId, t.userId] }), index("chat_members_user_id_idx").on(t.userId)],
);

export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => telegramChats.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => folders.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("folders_chat_parent_idx").on(t.chatId, t.parentId),
    index("folders_chat_name_idx").on(t.chatId, t.name),
    // Sibling names are unique per chat, case-insensitively; NULL parent (root) is treated as a value.
    uniqueIndex("folders_chat_parent_name_uq").on(
      t.chatId,
      sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(${t.name})`,
    ),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => telegramChats.id, { onDelete: "cascade" }),
    /** NULL = chat root folder. */
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "cascade" }),
    telegramFileId: text("telegram_file_id").notNull(),
    telegramFileUniqueId: text("telegram_file_unique_id").notNull(),
    /** Which Telegram media type holds the file: document | photo | video | animation | audio | voice | video_note */
    telegramKind: text("telegram_kind").notNull().default("document"),
    /** Thumbnail PhotoSize file_id when Telegram generated one. */
    thumbnailFileId: text("thumbnail_file_id"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    fileSize: bigint("file_size", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    duration: integer("duration"),
    /** Telegram chat + message holding the file (used for copyMessage / cleanup). */
    storageChatId: bigint("storage_chat_id", { mode: "number" }),
    storageMessageId: bigint("storage_message_id", { mode: "number" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("files_chat_folder_idx").on(t.chatId, t.folderId),
    index("files_chat_file_name_idx").on(t.chatId, t.fileName),
    index("files_telegram_file_unique_id_idx").on(t.telegramFileUniqueId),
    index("files_created_by_idx").on(t.createdBy),
  ],
);

/**
 * "Upload via Telegram" sessions: the user picks a destination folder in the Mini App and then sends
 * files to the bot in a private chat; each incoming file is filed into the target folder.
 */
export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => telegramChats.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** pending (created in Mini App) | active (user opened the bot chat) | done | expired */
    status: text("status").notNull().default("pending"),
    filesCount: integer("files_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("upload_sessions_user_status_idx").on(t.userId, t.status, t.expiresAt)],
);

export const isAdminBotStatus = (s: string) => s === "administrator";
export const isActiveBotStatus = (s: string) => s === "member" || s === "administrator" || s === "restricted";

export type User = typeof users.$inferSelect;
export type TelegramChat = typeof telegramChats.$inferSelect;
export type ChatMember = typeof chatMembers.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type UploadSession = typeof uploadSessions.$inferSelect;
