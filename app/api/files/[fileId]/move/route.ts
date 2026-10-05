import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api/errors";
import { requireChatContext } from "@/lib/auth/context";
import { assertCan } from "@/lib/permissions";
import { effectiveLimits } from "@/lib/env";
import { getFileWithCreator, moveFile, requireFileInChat } from "@/lib/services/files";
import { requireFolderInChat } from "@/lib/services/folders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ folderId: z.string().uuid().nullable() });

export const POST = route<RouteContext<"/api/files/[fileId]/move">>(async (req, { params }) => {
  const ctx = await requireChatContext(req);
  const { fileId } = await params;
  if (!z.string().uuid().safeParse(fileId).success) throw ApiError.notFound("File");
  const existing = await requireFileInChat(ctx.chat.id, fileId);
  assertCan(ctx.principal, "files.move", existing);
  const { folderId } = await readJson(req, bodySchema);
  if (folderId) await requireFolderInChat(ctx.chat.id, folderId);
  await moveFile(ctx.chat.id, fileId, folderId);
  const file = await getFileWithCreator(ctx.chat.id, fileId, effectiveLimits().maxDownloadBytes);
  return Response.json({ file });
});
