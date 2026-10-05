import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/api/errors";
import { requireChatContext } from "@/lib/auth/context";
import { assertCan } from "@/lib/permissions";
import { moveFolder } from "@/lib/services/folders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ parentId: z.string().uuid().nullable() });

export const POST = route<RouteContext<"/api/folders/[folderId]/move">>(async (req, { params }) => {
  const ctx = await requireChatContext(req);
  assertCan(ctx.principal, "folders.move");
  const { folderId } = await params;
  if (!z.string().uuid().safeParse(folderId).success) throw ApiError.notFound("Folder");
  const { parentId } = await readJson(req, bodySchema);
  const folder = await moveFolder(ctx.chat.id, folderId, parentId);
  return Response.json({ folder });
});
