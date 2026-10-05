import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api/errors";
import { requireChatContext } from "@/lib/auth/context";
import { assertCan } from "@/lib/permissions";
import { deleteFolder, listFolder, renameFolder } from "@/lib/services/folders";
import { cleanupStorageMessages } from "@/lib/services/files";
import { folderNameSchema } from "@/lib/services/naming";
import { effectiveLimits } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/folders/[folderId]">;

function parseFolderId(raw: string): string | null {
  if (raw === "root") return null;
  if (!z.string().uuid().safeParse(raw).success) throw ApiError.notFound("Folder");
  return raw;
}

/** Folder listing: the folder itself, breadcrumbs, subfolders and files. Use `root` for the chat root. */
export const GET = route<Ctx>(async (req, { params }) => {
  const ctx = await requireChatContext(req);
  assertCan(ctx.principal, "files.view");
  const folderId = parseFolderId((await params).folderId);
  const listing = await listFolder(ctx.chat.id, folderId, effectiveLimits().maxDownloadBytes);
  return Response.json(listing, { headers: { "cache-control": "no-store" } });
});

const patchSchema = z.object({ name: folderNameSchema });

export const PATCH = route<Ctx>(async (req, { params }) => {
  const ctx = await requireChatContext(req);
  assertCan(ctx.principal, "folders.rename");
  const folderId = parseFolderId((await params).folderId);
  if (!folderId) throw ApiError.badRequest("The root folder cannot be renamed.");
  const { name } = await readJson(req, patchSchema);
  const folder = await renameFolder(ctx.chat.id, folderId, name);
  return Response.json({ folder });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const ctx = await requireChatContext(req);
  assertCan(ctx.principal, "folders.delete");
  const folderId = parseFolderId((await params).folderId);
  if (!folderId) throw ApiError.badRequest("The root folder cannot be deleted.");
  const { removedFiles, removedFolderCount } = await deleteFolder(ctx.chat.id, folderId);
  void cleanupStorageMessages(removedFiles);
  return Response.json({ ok: true, removedFolders: removedFolderCount, removedFiles: removedFiles.length });
});
