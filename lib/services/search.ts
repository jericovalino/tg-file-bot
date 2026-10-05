import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/lib/db";
import type { SearchResultDto } from "@/lib/types";
import { buildPathIndex, toFolderDto } from "./folders";
import { toFileDto } from "./files";

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Case-insensitive substring search over folder and file names, strictly scoped to one chat. */
export async function searchChat(chatId: string, query: string, maxDownloadBytes: number, limit = 50): Promise<SearchResultDto> {
  const q = query.trim().slice(0, 100);
  if (!q) return { folders: [], files: [] };
  const pattern = `%${escapeLike(q)}%`;
  const creator = alias(schema.users, "creator");

  const [folderRows, fileRows, allFolders] = await Promise.all([
    db
      .select({ folder: schema.folders, creator })
      .from(schema.folders)
      .leftJoin(creator, eq(schema.folders.createdBy, creator.id))
      .where(and(eq(schema.folders.chatId, chatId), sql`${schema.folders.name} ilike ${pattern} escape '\\'`))
      .orderBy(asc(sql`lower(${schema.folders.name})`))
      .limit(limit),
    db
      .select({ file: schema.files, creator })
      .from(schema.files)
      .leftJoin(creator, eq(schema.files.createdBy, creator.id))
      .where(and(eq(schema.files.chatId, chatId), sql`${schema.files.fileName} ilike ${pattern} escape '\\'`))
      .orderBy(asc(sql`lower(${schema.files.fileName})`))
      .limit(limit),
    db
      .select({ id: schema.folders.id, name: schema.folders.name, parentId: schema.folders.parentId })
      .from(schema.folders)
      .where(eq(schema.folders.chatId, chatId)),
  ]);

  const pathOf = buildPathIndex(allFolders);
  return {
    folders: folderRows.map((r) => ({ ...toFolderDto(r.folder, r.creator), path: pathOf(r.folder.parentId) })),
    files: fileRows.map((r) => ({ ...toFileDto(r.file, r.creator, maxDownloadBytes), path: pathOf(r.file.folderId) })),
  };
}
