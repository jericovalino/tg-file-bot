import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { assertCan, type Principal } from "@/lib/permissions";
import type { BulkDeleteResultDto, BulkMoveResultDto, BulkSendResultDto } from "@/lib/types";
import { cleanupStorageMessages, sendFileToUser } from "./files";
import { folderPathString, getDescendantIds, requireFolderInChat } from "./folders";
import { dedupeName, isUniqueViolation } from "./naming";

type FileRow = typeof schema.files.$inferSelect;
type FolderRow = typeof schema.folders.$inferSelect;
type ChatRow = typeof schema.telegramChats.$inferSelect;
type UserRow = typeof schema.users.$inferSelect;

/** Upper bound per request; the Mini App only ever selects what is on screen. */
export const BULK_MAX_ITEMS = 200;

function unique(ids: string[]) {
  return [...new Set(ids)];
}

/** Loads every requested file and guarantees all of them belong to the chat (one missing id → 404). */
async function loadFiles(chatId: string, fileIds: string[]): Promise<FileRow[]> {
  if (fileIds.length === 0) return [];
  const rows = await db
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.chatId, chatId), inArray(schema.files.id, fileIds)));
  if (rows.length !== fileIds.length) throw ApiError.notFound("File");
  return rows;
}

async function loadFolders(chatId: string, folderIds: string[]): Promise<FolderRow[]> {
  if (folderIds.length === 0) return [];
  const rows = await db
    .select()
    .from(schema.folders)
    .where(and(eq(schema.folders.chatId, chatId), inArray(schema.folders.id, folderIds)));
  if (rows.length !== folderIds.length) throw ApiError.notFound("Folder");
  return rows;
}

function assertSomething(fileIds: string[], folderIds: string[]) {
  if (fileIds.length + folderIds.length === 0) throw ApiError.badRequest("Select at least one item.");
  if (fileIds.length + folderIds.length > BULK_MAX_ITEMS) throw ApiError.badRequest(`At most ${BULK_MAX_ITEMS} items per request.`);
}

/**
 * Deletes files and folders (with their contents) in one transaction. Permissions are checked for every item
 * before anything is touched, so a single forbidden item rejects the whole request.
 */
export async function bulkDelete(chatId: string, principal: Principal, input: { fileIds: string[]; folderIds: string[] }): Promise<BulkDeleteResultDto> {
  const fileIds = unique(input.fileIds);
  const folderIds = unique(input.folderIds);
  assertSomething(fileIds, folderIds);

  if (folderIds.length) assertCan(principal, "folders.delete");
  const [files, folders] = await Promise.all([loadFiles(chatId, fileIds), loadFolders(chatId, folderIds)]);
  for (const f of files) assertCan(principal, "files.delete", f);

  const result = await db.transaction(async (tx) => {
    const folderIdsToRemove = new Set<string>();
    for (const folder of folders) {
      for (const id of await getDescendantIds(chatId, folder.id, tx)) folderIdsToRemove.add(id);
    }
    const nested = folderIdsToRemove.size
      ? await tx
          .select()
          .from(schema.files)
          .where(and(eq(schema.files.chatId, chatId), inArray(schema.files.folderId, [...folderIdsToRemove])))
      : [];
    const removed = new Map<string, FileRow>();
    for (const f of [...nested, ...files]) removed.set(f.id, f);

    if (folders.length) {
      await tx.delete(schema.folders).where(and(eq(schema.folders.chatId, chatId), inArray(schema.folders.id, folders.map((f) => f.id))));
    }
    if (files.length) {
      await tx.delete(schema.files).where(and(eq(schema.files.chatId, chatId), inArray(schema.files.id, files.map((f) => f.id))));
    }
    return { removedFiles: [...removed.values()], removedFolderCount: folderIdsToRemove.size };
  });

  void cleanupStorageMessages(result.removedFiles);
  return { ok: true, removedFiles: result.removedFiles.length, removedFolders: result.removedFolderCount };
}

async function fileNameExistsTx(tx: Tx, chatId: string, folderId: string | null, name: string): Promise<boolean> {
  const [row] = await tx
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

/**
 * Moves files and folders into `destinationId` (null = root) in one transaction. Rejects a destination that is
 * one of the selected folders or lives inside one of them, since that would create a cycle.
 */
export async function bulkMove(
  chatId: string,
  principal: Principal,
  input: { fileIds: string[]; folderIds: string[]; destinationId: string | null },
): Promise<BulkMoveResultDto> {
  const fileIds = unique(input.fileIds);
  const folderIds = unique(input.folderIds);
  const destinationId = input.destinationId ?? null;
  assertSomething(fileIds, folderIds);

  if (fileIds.length) assertCan(principal, "files.move");
  if (folderIds.length) assertCan(principal, "folders.move");
  const [files, folders] = await Promise.all([loadFiles(chatId, fileIds), loadFolders(chatId, folderIds)]);
  if (destinationId) await requireFolderInChat(chatId, destinationId);

  if (destinationId) {
    for (const folder of folders) {
      if (folder.id === destinationId) throw new ApiError(400, "INVALID_MOVE", "A folder cannot be moved into itself.");
      const descendants = await getDescendantIds(chatId, folder.id);
      if (descendants.includes(destinationId)) throw new ApiError(400, "INVALID_MOVE", "A folder cannot be moved into one of its own subfolders.");
    }
  }

  try {
    return await db.transaction(async (tx) => {
      let movedFolders = 0;
      for (const folder of folders) {
        if ((folder.parentId ?? null) === destinationId) continue;
        await tx
          .update(schema.folders)
          .set({ parentId: destinationId, updatedAt: new Date() })
          .where(and(eq(schema.folders.id, folder.id), eq(schema.folders.chatId, chatId)));
        movedFolders++;
      }
      let movedFiles = 0;
      for (const file of files) {
        if ((file.folderId ?? null) === destinationId) continue;
        // Sequential so each dedupe sees the files moved just before it.
        const name = await dedupeName(file.fileName, (c) => fileNameExistsTx(tx, chatId, destinationId, c));
        await tx
          .update(schema.files)
          .set({ folderId: destinationId, fileName: name, updatedAt: new Date() })
          .where(and(eq(schema.files.id, file.id), eq(schema.files.chatId, chatId)));
        movedFiles++;
      }
      return { ok: true as const, movedFiles, movedFolders };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError(409, "CONFLICT", "A folder with the same name already exists in the destination.");
    throw err;
  }
}

/**
 * Sends each file to the user's private chat with the bot. Not transactional: Telegram calls happen one by one
 * and per-file failures are reported. If the user has never started the bot, nothing can be delivered, so that
 * error aborts the whole request with the same shape as the single-file endpoint.
 */
export async function bulkSend(chat: ChatRow, user: UserRow, principal: Principal, fileIds: string[]): Promise<BulkSendResultDto> {
  const ids = unique(fileIds);
  assertSomething(ids, []);
  assertCan(principal, "files.download");
  const files = await loadFiles(chat.id, ids);
  // Preserve the order the client sent so messages arrive in the order the user sees them.
  const byId = new Map(files.map((f) => [f.id, f]));
  const pathCache = new Map<string | null, string>();

  let sent = 0;
  const failed: BulkSendResultDto["failed"] = [];
  for (const id of ids) {
    const file = byId.get(id)!;
    try {
      let path = pathCache.get(file.folderId);
      if (path === undefined) {
        path = await folderPathString(chat.id, file.folderId);
        pathCache.set(file.folderId, path);
      }
      await sendFileToUser(file, user, chat.title, path);
      sent++;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "USER_NOT_REACHABLE" && sent === 0) throw err;
        failed.push({ fileId: file.id, fileName: file.fileName, code: err.code, message: err.message });
      } else {
        throw err;
      }
    }
  }
  return { ok: true, sent, failed };
}
