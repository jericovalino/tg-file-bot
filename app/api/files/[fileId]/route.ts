import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api/errors";
import { requireChatContext } from "@/lib/auth/context";
import { assertCan } from "@/lib/permissions";
import { effectiveLimits } from "@/lib/env";
import { deleteFile, getFileWithCreator, renameFile, requireFileInChat } from "@/lib/services/files";
import { fileNameSchema } from "@/lib/services/naming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/files/[fileId]">;

function assertUuid(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw ApiError.notFound("File");
  return id;
}

export const GET = route<Ctx>(async (req, { params }) => {
  const ctx = await requireChatContext(req);
  assertCan(ctx.principal, "files.view");
  const fileId = assertUuid((await params).fileId);
  const file = await getFileWithCreator(ctx.chat.id, fileId, effectiveLimits().maxDownloadBytes);
  return Response.json({ file });
});

const patchSchema = z.object({ fileName: fileNameSchema });

export const PATCH = route<Ctx>(async (req, { params }) => {
  const ctx = await requireChatContext(req);
  const fileId = assertUuid((await params).fileId);
  const existing = await requireFileInChat(ctx.chat.id, fileId);
  assertCan(ctx.principal, "files.rename", existing);
  const { fileName } = await readJson(req, patchSchema);
  await renameFile(ctx.chat.id, fileId, fileName);
  const file = await getFileWithCreator(ctx.chat.id, fileId, effectiveLimits().maxDownloadBytes);
  return Response.json({ file });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const ctx = await requireChatContext(req);
  const fileId = assertUuid((await params).fileId);
  const existing = await requireFileInChat(ctx.chat.id, fileId);
  assertCan(ctx.principal, "files.delete", existing);
  await deleteFile(ctx.chat.id, fileId);
  return Response.json({ ok: true });
});
