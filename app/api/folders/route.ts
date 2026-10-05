import { z } from "zod";
import { readJson, route } from "@/lib/api/errors";
import { requireChatContext } from "@/lib/auth/context";
import { assertCan } from "@/lib/permissions";
import { createFolder } from "@/lib/services/folders";
import { folderNameSchema } from "@/lib/services/naming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ parentId: z.string().uuid().nullable().optional(), name: folderNameSchema });

export const POST = route(async (req) => {
  const ctx = await requireChatContext(req);
  assertCan(ctx.principal, "folders.create");
  const body = await readJson(req, bodySchema);
  const folder = await createFolder(ctx.chat.id, body.parentId ?? null, body.name, ctx.user.id);
  return Response.json({ folder }, { status: 201 });
});
