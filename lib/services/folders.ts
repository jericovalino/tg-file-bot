import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema, type Tx } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import type { BreadcrumbDto, FolderDto, FolderListingDto, FolderTreeNodeDto } from "@/lib/types";
import { toUserSummary } from "./users";
import { isUniqueViolation } from "./naming";
import { listFilesInFolder } from "./files";
import { buildTree } from "./folder-tree";

export { buildTree, buildPathIndex } from "./folder-tree";

import { ROOT_NAME } from "./folder-tree";

export { ROOT_NAME };
const MAX_DEPTH = 64;

type FolderRow = typeof schema.folders.$inferSelect;

export function toFolderDto(f: FolderRow, creator: { id: string; firstName: string; lastName: string | null; username: string | null } | null): FolderDto {
  return {
    id: f.id,
    parentId: f.parentId,
    name: f.name,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    createdBy: toUserSummary(creator),
  };
}

/** Loads a folder and guarantees it belongs to the given chat (prevents cross-group access by id guessing). */
export async function requireFolderInChat(chatId: string, folderId: string, tx?: Tx): Promise<FolderRow> {
  const folder = await (tx ?? db).query.folders.findFirst({
    where: and(eq(schema.folders.id, folderId), eq(schema.folders.chatId, chatId)),
  });
  if (!folder) throw ApiError.notFound("Folder");
  return folder;
}

/** Root → ... → folder. The root crumb has id null. */
export async function getBreadcrumbs(chatId: string, folderId: string | null): Promise<BreadcrumbDto[]> {
  const crumbs: BreadcrumbDto[] = [{ id: null, name: ROOT_NAME }];
  if (!folderId) return crumbs;
  const rows = await db.execute<{ id: string; name: string; depth: number }>(sql`
    with recursive chain as (
      select id, parent_id, name, 0 as depth from folders where id = ${folderId} and chat_id = ${chatId}
      union all
      select f.id, f.parent_id, f.name, c.depth + 1 from folders f join chain c on f.id = c.parent_id
      where c.depth < ${MAX_DEPTH}
    )
    select id, name, depth from chain order by depth desc
  `);
  for (const r of rows) crumbs.push({ id: r.id, name: r.name });
  return crumbs;
}

export async function folderPathString(chatId: string, folderId: string | null): Promise<string> {
  const crumbs = await getBreadcrumbs(chatId, folderId);
  return crumbs.map((c) => c.name).join(" / ");
}

/** Ids of a folder and all of its descendants. */
export async function getDescendantIds(chatId: string, folderId: string, tx?: Tx): Promise<string[]> {
  const rows = await (tx ?? db).execute<{ id: string }>(sql`
    with recursive sub as (
      select id, 0 as depth from folders where id = ${folderId} and chat_id = ${chatId}
      union all
      select f.id, s.depth + 1 from folders f join sub s on f.parent_id = s.id where s.depth < ${MAX_DEPTH}
    )
    select id from sub
  `);
  return rows.map((r) => r.id);
}

export async function listChildFolders(chatId: string, parentId: string | null) {
  const creator = alias(schema.users, "creator");
  const rows = await db
    .select({ folder: schema.folders, creator })
    .from(schema.folders)
    .leftJoin(creator, eq(schema.folders.createdBy, creator.id))
    .where(and(eq(schema.folders.chatId, chatId), parentId ? eq(schema.folders.parentId, parentId) : isNull(schema.folders.parentId)))
    .orderBy(asc(sql`lower(${schema.folders.name})`));
  return rows.map((r) => toFolderDto(r.folder, r.creator));
}

export async function listFolder(chatId: string, folderId: string | null, maxDownloadBytes: number): Promise<FolderListingDto> {
  let folder: FolderDto | null = null;
  if (folderId) {
    const row = await requireFolderInChat(chatId, folderId);
    const creator = row.createdBy ? await db.query.users.findFirst({ where: eq(schema.users.id, row.createdBy) }) : null;
    folder = toFolderDto(row, creator ?? null);
  }
  const [breadcrumbs, folders, files] = await Promise.all([
    getBreadcrumbs(chatId, folderId),
    listChildFolders(chatId, folderId),
    listFilesInFolder(chatId, folderId, maxDownloadBytes),
  ]);
  return { folder, breadcrumbs, folders, files };
}

export async function createFolder(chatId: string, parentId: string | null, name: string, userId: string): Promise<FolderDto> {
  if (parentId) {
    await requireFolderInChat(chatId, parentId);
    const depth = (await getBreadcrumbs(chatId, parentId)).length;
    if (depth > MAX_DEPTH) throw ApiError.badRequest("Folder nesting is too deep.");
  }
  try {
    const [row] = await db.insert(schema.folders).values({ chatId, parentId, name, createdBy: userId }).returning();
    const creator = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    return toFolderDto(row, creator ?? null);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError(409, "CONFLICT", `A folder named "${name}" already exists here.`);
    throw err;
  }
}

export async function renameFolder(chatId: string, folderId: string, name: string): Promise<FolderDto> {
  await requireFolderInChat(chatId, folderId);
  try {
    const [row] = await db
      .update(schema.folders)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(schema.folders.id, folderId), eq(schema.folders.chatId, chatId)))
      .returning();
    if (!row) throw ApiError.notFound("Folder");
    const creator = row.createdBy ? await db.query.users.findFirst({ where: eq(schema.users.id, row.createdBy) }) : null;
    return toFolderDto(row, creator ?? null);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError(409, "CONFLICT", `A folder named "${name}" already exists here.`);
    throw err;
  }
}

/**
 * Moves a folder (with all descendants) under a new parent. Rejects moving into itself or a descendant,
 * which would create a cycle.
 */
export async function moveFolder(chatId: string, folderId: string, newParentId: string | null): Promise<FolderDto> {
  const folder = await requireFolderInChat(chatId, folderId);
  if (newParentId) {
    if (newParentId === folderId) throw new ApiError(400, "INVALID_MOVE", "A folder cannot be moved into itself.");
    await requireFolderInChat(chatId, newParentId);
    const descendants = await getDescendantIds(chatId, folderId);
    if (descendants.includes(newParentId)) throw new ApiError(400, "INVALID_MOVE", "A folder cannot be moved into one of its own subfolders.");
  }
  if ((folder.parentId ?? null) === (newParentId ?? null)) {
    const creator = folder.createdBy ? await db.query.users.findFirst({ where: eq(schema.users.id, folder.createdBy) }) : null;
    return toFolderDto(folder, creator ?? null);
  }
  try {
    const [row] = await db
      .update(schema.folders)
      .set({ parentId: newParentId, updatedAt: new Date() })
      .where(and(eq(schema.folders.id, folderId), eq(schema.folders.chatId, chatId)))
      .returning();
    const creator = row.createdBy ? await db.query.users.findFirst({ where: eq(schema.users.id, row.createdBy) }) : null;
    return toFolderDto(row, creator ?? null);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError(409, "CONFLICT", `A folder named "${folder.name}" already exists in the destination.`);
    throw err;
  }
}

/** Deletes a folder and everything inside it. Returns the file rows that were removed so Telegram messages can be cleaned up. */
export async function deleteFolder(chatId: string, folderId: string) {
  await requireFolderInChat(chatId, folderId);
  return db.transaction(async (tx) => {
    const ids = await getDescendantIds(chatId, folderId, tx);
    const removedFiles = ids.length
      ? await tx
          .select()
          .from(schema.files)
          .where(and(eq(schema.files.chatId, chatId), sql`${schema.files.folderId} in ${ids}`))
      : [];
    await tx.delete(schema.folders).where(and(eq(schema.folders.id, folderId), eq(schema.folders.chatId, chatId)));
    return { removedFiles, removedFolderCount: ids.length };
  });
}

export async function getFolderTree(chatId: string): Promise<FolderTreeNodeDto[]> {
  const rows = await db
    .select({ id: schema.folders.id, name: schema.folders.name, parentId: schema.folders.parentId })
    .from(schema.folders)
    .where(eq(schema.folders.chatId, chatId))
    .orderBy(asc(sql`lower(${schema.folders.name})`));
  return buildTree(rows);
}
