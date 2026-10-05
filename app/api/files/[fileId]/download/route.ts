import { z } from "zod";
import { ApiError, route } from "@/lib/api/errors";
import { requireReadGrant } from "@/lib/auth/context";
import { assertCan } from "@/lib/permissions";
import { requireFileInChat, resolveDownload } from "@/lib/services/files";
import { streamTelegramFile } from "@/lib/api/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Streams the file from Telegram through the server. Auth: `?t=<download|media token>` or Bearer header.
 * `?disposition=inline` lets images/videos/PDFs render in the preview; other types always download.
 */
export const GET = route<RouteContext<"/api/files/[fileId]/download">>(async (req, { params }) => {
  const { fileId } = await params;
  if (!z.string().uuid().safeParse(fileId).success) throw ApiError.notFound("File");
  const ctx = await requireReadGrant(req, fileId);
  assertCan(ctx.principal, "files.download");
  const file = await requireFileInChat(ctx.chat.id, fileId);
  const disposition = new URL(req.url).searchParams.get("disposition") === "inline" ? "inline" : "attachment";
  const { filePath, size } = await resolveDownload(file, "file");
  return streamTelegramFile(req, filePath, { fileName: file.fileName, mimeType: file.mimeType, disposition, size });
});
