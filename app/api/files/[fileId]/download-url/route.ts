import { z } from "zod";
import { ApiError, route } from "@/lib/api/errors";
import { requireChatContext } from "@/lib/auth/context";
import { assertCan } from "@/lib/permissions";
import { signToken } from "@/lib/auth/session";
import { env, effectiveLimits } from "@/lib/env";
import { isBrowserDownloadable, requireFileInChat } from "@/lib/services/files";
import type { DownloadUrlDto } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOWNLOAD_TOKEN_TTL = 10 * 60;

/** Issues a short-lived, single-file download URL that can be handed to the browser or to Telegram.WebApp.downloadFile. */
export const POST = route<RouteContext<"/api/files/[fileId]/download-url">>(async (req, { params }) => {
  const ctx = await requireChatContext(req);
  assertCan(ctx.principal, "files.download");
  const { fileId } = await params;
  if (!z.string().uuid().safeParse(fileId).success) throw ApiError.notFound("File");
  const file = await requireFileInChat(ctx.chat.id, fileId);
  const token = await signToken({ kind: "download", sub: ctx.user.id, tg: ctx.user.telegramUserId, chat: ctx.chat.id, file: file.id }, DOWNLOAD_TOKEN_TTL);
  const url = new URL(`/api/files/${file.id}/download`, env().NEXT_PUBLIC_APP_URL);
  url.searchParams.set("t", token);
  const body: DownloadUrlDto = {
    url: url.toString(),
    expiresAt: new Date(Date.now() + DOWNLOAD_TOKEN_TTL * 1000).toISOString(),
    browserDownloadable: isBrowserDownloadable(file.fileSize, effectiveLimits().maxDownloadBytes),
    fileName: file.fileName,
    mimeType: file.mimeType,
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
});
