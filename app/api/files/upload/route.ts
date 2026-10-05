import { z } from "zod";
import { ApiError, route } from "@/lib/api/errors";
import { requireChatContext } from "@/lib/auth/context";
import { assertCan } from "@/lib/permissions";
import { effectiveLimits } from "@/lib/env";
import { folderPathString, requireFolderInChat } from "@/lib/services/folders";
import { toFileDto, uploadFileToTelegram } from "@/lib/services/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Uploads to Telegram can take a while on slow links.
export const maxDuration = 300;

/**
 * multipart/form-data: `file` (one file) and optional `folderId`.
 * The file is streamed to Telegram (sendDocument); only metadata + file_id are stored.
 */
export const POST = route(async (req) => {
  const ctx = await requireChatContext(req);
  assertCan(ctx.principal, "files.upload");
  const { maxUploadBytes, maxDownloadBytes } = effectiveLimits();

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared && declared > maxUploadBytes + 64 * 1024) {
    throw new ApiError(413, "FILE_TOO_LARGE", `This file is larger than the ${Math.floor(maxUploadBytes / 1048576)} MB upload limit.`);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw ApiError.badRequest("Expected multipart/form-data with a `file` field.");
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) throw ApiError.badRequest("Missing `file` field.");
  const rawFolderId = form.get("folderId");
  const folderId = typeof rawFolderId === "string" && rawFolderId && rawFolderId !== "root" ? rawFolderId : null;
  if (folderId) {
    if (!z.string().uuid().safeParse(folderId).success) throw ApiError.notFound("Folder");
    await requireFolderInChat(ctx.chat.id, folderId);
  }
  const fileName = (file as File).name || "file";
  const folderPath = await folderPathString(ctx.chat.id, folderId);

  const row = await uploadFileToTelegram({ chat: ctx.chat, folderId, user: ctx.user, blob: file, fileName, folderPath });
  return Response.json({ file: toFileDto(row, ctx.user, maxDownloadBytes) }, { status: 201 });
});
