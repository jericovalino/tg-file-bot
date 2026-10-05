import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/lib/db";
import { env, effectiveLimits } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";
import { telegram, TelegramApiError } from "@/lib/telegram/bot-api";
import { extractMedia } from "@/lib/telegram/media";
import type { ExtractedMedia, TgMessage } from "@/lib/telegram/types";
import type { FileDto, TelegramKind } from "@/lib/types";
import { toUserSummary } from "./users";
import { dedupeName, extensionOf, isUniqueViolation, sanitizeFileName } from "./naming";

type FileRow = typeof schema.files.$inferSelect;
type ChatRow = typeof schema.telegramChats.$inferSelect;
type UserRow = typeof schema.users.$inferSelect;
type Creator = { id: string; firstName: string; lastName: string | null; username: string | null } | null;

export function toFileDto(f: FileRow, creator: Creator, maxDownloadBytes: number): FileDto {
  return {
    id: f.id,
    folderId: f.folderId,
    fileName: f.fileName,
    mimeType: f.mimeType,
    fileSize: f.fileSize,
    telegramKind: f.telegramKind as TelegramKind,
    hasThumbnail: !!f.thumbnailFileId || f.telegramKind === "photo",
    width: f.width,
    height: f.height,
    duration: f.duration,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    createdBy: toUserSummary(creator),
    browserDownloadable: isBrowserDownloadable(f.fileSize, maxDownloadBytes),
  };
}

export function isBrowserDownloadable(size: number | null, maxDownloadBytes: number) {
  if (maxDownloadBytes === 0) return true;
  if (size === null) return true; // unknown; let the user try
  return size <= maxDownloadBytes;
}

export async function requireFileInChat(chatId: string, fileId: string): Promise<FileRow> {
  const file = await db.query.files.findFirst({ where: and(eq(schema.files.id, fileId), eq(schema.files.chatId, chatId)) });
  if (!file) throw ApiError.notFound("File");
  return file;
}

export async function getFileWithCreator(chatId: string, fileId: string, maxDownloadBytes: number): Promise<FileDto> {
  const creator = alias(schema.users, "creator");
  const [row] = await db
    .select({ file: schema.files, creator })
    .from(schema.files)
    .leftJoin(creator, eq(schema.files.createdBy, creator.id))
    .where(and(eq(schema.files.id, fileId), eq(schema.files.chatId, chatId)))
    .limit(1);
  if (!row) throw ApiError.notFound("File");
  return toFileDto(row.file, row.creator, maxDownloadBytes);
}

export async function listFilesInFolder(chatId: string, folderId: string | null, maxDownloadBytes: number): Promise<FileDto[]> {
  const creator = alias(schema.users, "creator");
  const rows = await db
    .select({ file: schema.files, creator })
    .from(schema.files)
    .leftJoin(creator, eq(schema.files.createdBy, creator.id))
    .where(and(eq(schema.files.chatId, chatId), folderId ? eq(schema.files.folderId, folderId) : isNull(schema.files.folderId)))
    .orderBy(asc(sql`lower(${schema.files.fileName})`));
  return rows.map((r) => toFileDto(r.file, r.creator, maxDownloadBytes));
}

async function fileNameExists(chatId: string, folderId: string | null, name: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.files.id })
    .from(schema.files)
    .where(
      and(
        eq(schema.files.chatId, chatId),
        folderId ? eq(schema.files.folderId, folderId) : isNull(schema.files.folderId),
        sql`lower(${schema.files.fileName}) = lower(${name})`,
      ),
    )
    .limit(1);
  return !!row;
}

export function assertFileTypeAllowed(fileName: string) {
  const blocked = env().BLOCKED_FILE_EXTENSIONS;
  if (blocked.length === 0) return;
  const ext = extensionOf(fileName);
  if (ext && blocked.includes(ext)) throw new ApiError(415, "FILE_TYPE_BLOCKED", `Files of type .${ext} are not allowed.`);
}

/** Where the bot posts uploaded files: per-chat override → global storage channel → the group itself. */
export function storageChatIdFor(chat: ChatRow): number {
  return chat.storageChatId ?? env().TELEGRAM_STORAGE_CHAT_ID ?? chat.telegramChatId;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface InsertArgs {
  chat: ChatRow;
  folderId: string | null;
  user: UserRow;
  media: ExtractedMedia;
  preferredName: string;
  storageChatId: number | null;
  storageMessageId: number | null;
}

async function insertFileRecord(a: InsertArgs): Promise<FileRow> {
  const base = sanitizeFileName(a.preferredName, a.media.fileName);
  const fileName = await dedupeName(base, (candidate) => fileNameExists(a.chat.id, a.folderId, candidate));
  try {
    const [row] = await db
      .insert(schema.files)
      .values({
        chatId: a.chat.id,
        folderId: a.folderId,
        telegramFileId: a.media.fileId,
        telegramFileUniqueId: a.media.fileUniqueId,
        telegramKind: a.media.kind,
        thumbnailFileId: a.media.thumbnailFileId ?? null,
        fileName,
        mimeType: a.media.mimeType ?? null,
        fileSize: a.media.fileSize ?? null,
        width: a.media.width ?? null,
        height: a.media.height ?? null,
        duration: a.media.duration ?? null,
        storageChatId: a.storageChatId,
        storageMessageId: a.storageMessageId,
        createdBy: a.user.id,
      })
      .returning();
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError(409, "CONFLICT", "A file with this name already exists here.");
    throw err;
  }
}

/**
 * Browser → server → Telegram upload. The bytes are forwarded to Telegram with sendDocument and only the
 * resulting file_id/metadata are stored. Limits: 50 MB on the hosted Bot API (configurable lower), 2000 MB on a
 * local Bot API server.
 */
export async function uploadFileToTelegram(args: {
  chat: ChatRow;
  folderId: string | null;
  user: UserRow;
  blob: Blob;
  fileName: string;
  folderPath: string;
}): Promise<FileRow> {
  const { maxUploadBytes } = effectiveLimits();
  const fileName = sanitizeFileName(args.fileName);
  assertFileTypeAllowed(fileName);
  if (args.blob.size === 0) throw ApiError.badRequest("The file is empty.");
  if (args.blob.size > maxUploadBytes) {
    throw new ApiError(
      413,
      "FILE_TOO_LARGE",
      `This file is larger than the ${Math.floor(maxUploadBytes / (1024 * 1024))} MB upload limit. Use "Upload via Telegram" for large files.`,
    );
  }

  const storageChatId = storageChatIdFor(args.chat);
  const uploaderName = [args.user.firstName, args.user.lastName].filter(Boolean).join(" ");
  const caption = `<b>${escapeHtml(fileName)}</b>\n📁 ${escapeHtml(args.chat.title)} / ${escapeHtml(args.folderPath)}\n👤 ${escapeHtml(uploaderName)}`;

  let message: TgMessage;
  try {
    message = await telegram().sendDocument(
      { chat_id: storageChatId, caption: caption.slice(0, 1024), parse_mode: "HTML", disable_notification: true },
      { blob: args.blob, filename: fileName },
    );
  } catch (err) {
    if (err instanceof TelegramApiError) {
      if (err.code === 413 || /too large|too big/i.test(err.description)) {
        throw new ApiError(413, "FILE_TOO_LARGE", "Telegram rejected the file because it is too large.");
      }
      if (err.isBotNotInChat) {
        throw new ApiError(
          502,
          "BOT_NOT_IN_CHAT",
          storageChatId === args.chat.telegramChatId
            ? "The bot cannot post in this group. Make sure it is a member with permission to send media."
            : "The bot cannot post to the configured storage chat. Check TELEGRAM_STORAGE_CHAT_ID and the bot's permissions there.",
        );
      }
      if (err.code === 429) throw new ApiError(429, "RATE_LIMITED", "Telegram is rate limiting uploads. Please retry in a few seconds.");
      throw new ApiError(502, "TELEGRAM_ERROR", `Telegram upload failed: ${err.description}`);
    }
    throw err;
  }

  const media = extractMedia(message);
  if (!media) {
    // Should not happen; clean up the orphan message.
    await telegram().deleteMessage(message.chat.id, message.message_id).catch(() => undefined);
    throw new ApiError(502, "TELEGRAM_ERROR", "Telegram did not return file information.");
  }
  // Prefer the user's original name and MIME type (Telegram may have re-typed the file, e.g. mp4 → video).
  media.fileName = fileName;
  media.mimeType = args.blob.type || media.mimeType;
  media.fileSize = args.blob.size;

  return insertFileRecord({
    chat: args.chat,
    folderId: args.folderId,
    user: args.user,
    media,
    preferredName: fileName,
    storageChatId: message.chat.id,
    storageMessageId: message.message_id,
  });
}

/**
 * "Upload via Telegram": the user sent the file to the bot in a private chat. The file is already on Telegram's
 * servers, so only the file_id is recorded. When a storage chat is configured, the message is copied there so the
 * file has a durable home that doesn't depend on the user's private chat history.
 */
export async function registerIncomingFile(args: {
  chat: ChatRow;
  folderId: string | null;
  user: UserRow;
  message: TgMessage;
  folderPath: string;
}): Promise<FileRow> {
  const media = extractMedia(args.message);
  if (!media) throw ApiError.badRequest("Message has no file.");
  media.fileName = sanitizeFileName(media.fileName);
  assertFileTypeAllowed(media.fileName);

  let storageChatId: number | null = args.message.chat.id;
  let storageMessageId: number | null = args.message.message_id;
  const target = storageChatIdFor(args.chat);
  if (target !== args.message.chat.id) {
    try {
      const copied = await telegram().copyMessage({
        chat_id: target,
        from_chat_id: args.message.chat.id,
        message_id: args.message.message_id,
        disable_notification: true,
        caption: `<b>${escapeHtml(media.fileName)}</b>\n📁 ${escapeHtml(args.chat.title)} / ${escapeHtml(args.folderPath)}`.slice(0, 1024),
      });
      storageChatId = target;
      storageMessageId = copied.message_id;
    } catch (err) {
      // The file_id from the user's message is still valid; keep it and continue.
      console.warn("[files] copyMessage to storage chat failed", (err as Error).message);
    }
  }

  return insertFileRecord({
    chat: args.chat,
    folderId: args.folderId,
    user: args.user,
    media,
    preferredName: media.fileName,
    storageChatId,
    storageMessageId,
  });
}

export async function renameFile(chatId: string, fileId: string, newName: string): Promise<FileRow> {
  const file = await requireFileInChat(chatId, fileId);
  let name = sanitizeFileName(newName, file.fileName);
  // Keep the original extension if the user dropped it, so previews keep working.
  const oldExt = extensionOf(file.fileName);
  if (oldExt && !extensionOf(name)) name = `${name}.${oldExt}`;
  assertFileTypeAllowed(name);
  if (name.toLowerCase() !== file.fileName.toLowerCase() && (await fileNameExists(chatId, file.folderId, name))) {
    throw new ApiError(409, "CONFLICT", `A file named "${name}" already exists here.`);
  }
  const [row] = await db
    .update(schema.files)
    .set({ fileName: name, updatedAt: new Date() })
    .where(and(eq(schema.files.id, fileId), eq(schema.files.chatId, chatId)))
    .returning();
  return row;
}

export async function moveFile(chatId: string, fileId: string, folderId: string | null): Promise<FileRow> {
  const file = await requireFileInChat(chatId, fileId);
  if ((file.folderId ?? null) === (folderId ?? null)) return file;
  const name = await dedupeName(file.fileName, (c) => fileNameExists(chatId, folderId, c));
  const [row] = await db
    .update(schema.files)
    .set({ folderId, fileName: name, updatedAt: new Date() })
    .where(and(eq(schema.files.id, fileId), eq(schema.files.chatId, chatId)))
    .returning();
  return row;
}

export async function deleteFile(chatId: string, fileId: string): Promise<FileRow> {
  const file = await requireFileInChat(chatId, fileId);
  await db.delete(schema.files).where(and(eq(schema.files.id, fileId), eq(schema.files.chatId, chatId)));
  void cleanupStorageMessages([file]);
  return file;
}

/** Best effort: remove the storage messages so the files disappear from the storage channel too. */
export async function cleanupStorageMessages(rows: FileRow[]) {
  for (const f of rows) {
    if (!f.storageChatId || !f.storageMessageId) continue;
    try {
      await telegram().deleteMessage(f.storageChatId, f.storageMessageId);
    } catch (err) {
      // Telegram only allows deleting recent messages (or any message when the bot is admin); ignore.
      if (!(err instanceof TelegramApiError)) console.warn("[files] cleanup failed", err);
    }
  }
}

export interface ResolvedDownload {
  filePath: string;
  size: number | null;
}

/** Fresh download path from Telegram (never stored: file_path is temporary, valid ≥ 1 hour). */
export async function resolveDownload(file: FileRow, variant: "file" | "thumbnail" = "file"): Promise<ResolvedDownload> {
  const fileId = variant === "thumbnail" ? (file.thumbnailFileId ?? file.telegramFileId) : file.telegramFileId;
  const { maxDownloadBytes } = effectiveLimits();
  if (variant === "file" && !isBrowserDownloadable(file.fileSize, maxDownloadBytes)) {
    throw new ApiError(
      413,
      "FILE_TOO_LARGE_FOR_DOWNLOAD",
      `Files over ${Math.floor(maxDownloadBytes / (1024 * 1024))} MB can't be downloaded through the browser. Use "Send to me in Telegram" instead.`,
    );
  }
  try {
    const tgFile = await telegram().getFile(fileId);
    if (!tgFile.file_path) throw new ApiError(502, "TELEGRAM_ERROR", "Telegram did not return a file path.");
    return { filePath: tgFile.file_path, size: tgFile.file_size ?? file.fileSize ?? null };
  } catch (err) {
    if (err instanceof TelegramApiError) {
      if (err.isFileTooBig) {
        throw new ApiError(
          413,
          "FILE_TOO_LARGE_FOR_DOWNLOAD",
          'This file is too large for the Bot API to serve directly. Use "Send to me in Telegram" instead.',
        );
      }
      if (err.isBadFileId) throw new ApiError(410, "FILE_GONE", "This file is no longer available on Telegram.");
      if (err.code === 429) throw new ApiError(429, "RATE_LIMITED", "Telegram is rate limiting downloads. Try again shortly.");
      throw new ApiError(502, "TELEGRAM_ERROR", `Telegram error: ${err.description}`);
    }
    throw err;
  }
}

/**
 * Delivers the file to the user's private chat with the bot by re-sending the stored file_id.
 * Works for any file size (no 20 MB limit) — this is the fallback for large files.
 */
export async function sendFileToUser(file: FileRow, user: UserRow, chatTitle: string, folderPath: string) {
  const api = telegram();
  const caption = `<b>${escapeHtml(file.fileName)}</b>\n📁 ${escapeHtml(chatTitle)} / ${escapeHtml(folderPath)}`.slice(0, 1024);
  try {
    if (file.storageChatId && file.storageMessageId) {
      try {
        await api.copyMessage({ chat_id: user.telegramUserId, from_chat_id: file.storageChatId, message_id: file.storageMessageId, caption });
        return;
      } catch (err) {
        if (!(err instanceof TelegramApiError) || !err.isMessageGone) throw err;
        // Storage message was deleted — fall through to sending by file_id.
      }
    }
    const chat_id = user.telegramUserId;
    const id = file.telegramFileId;
    switch (file.telegramKind) {
      case "photo":
        await api.sendPhotoById({ chat_id, photo: id, caption, parse_mode: "HTML" });
        break;
      case "video":
        await api.sendVideoById({ chat_id, video: id, caption, parse_mode: "HTML" });
        break;
      case "animation":
        await api.sendAnimationById({ chat_id, animation: id, caption, parse_mode: "HTML" });
        break;
      case "audio":
        await api.sendAudioById({ chat_id, audio: id, caption, parse_mode: "HTML" });
        break;
      case "voice":
        await api.sendVoiceById({ chat_id, voice: id, caption, parse_mode: "HTML" });
        break;
      case "video_note":
        await api.sendVideoNoteById({ chat_id, video_note: id });
        break;
      default:
        await api.sendDocumentById({ chat_id, document: id, caption, parse_mode: "HTML" });
    }
  } catch (err) {
    if (err instanceof TelegramApiError) {
      if (err.cantInitiateConversation) {
        throw new ApiError(409, "USER_NOT_REACHABLE", "Start a chat with the bot first, then try again.", {
          startLink: `https://t.me/${env().TELEGRAM_BOT_USERNAME}?start=hello`,
        });
      }
      if (err.isBadFileId) throw new ApiError(410, "FILE_GONE", "This file is no longer available on Telegram.");
      throw new ApiError(502, "TELEGRAM_ERROR", `Telegram error: ${err.description}`);
    }
    throw err;
  }
}
