import { z } from "zod";
import { ApiError, route } from "@/lib/api/errors";
import { requireChatContext } from "@/lib/auth/context";
import { assertCan } from "@/lib/permissions";
import { requireFileInChat, sendFileToUser } from "@/lib/services/files";
import { folderPathString } from "@/lib/services/folders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends the file to the user's private chat with the bot (works for any size — no 20 MB limit). */
export const POST = route<RouteContext<"/api/files/[fileId]/send">>(async (req, { params }) => {
  const ctx = await requireChatContext(req);
  assertCan(ctx.principal, "files.download");
  const { fileId } = await params;
  if (!z.string().uuid().safeParse(fileId).success) throw ApiError.notFound("File");
  const file = await requireFileInChat(ctx.chat.id, fileId);
  const path = await folderPathString(ctx.chat.id, file.folderId);
  await sendFileToUser(file, ctx.user, ctx.chat.title, path);
  return Response.json({ ok: true });
});
