import { z } from "zod";
import { readJson, route, uuidSchema } from "@/lib/api/errors";
import { requireChatContext } from "@/lib/auth/context";
import { BULK_MAX_ITEMS, bulkSend } from "@/lib/services/bulk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ fileIds: z.array(uuidSchema).min(1).max(BULK_MAX_ITEMS) });

/** Sends each selected file to the user's chat with the bot; reports per-file failures (not transactional). */
export const POST = route(async (req) => {
  const ctx = await requireChatContext(req);
  const { fileIds } = await readJson(req, bodySchema);
  const result = await bulkSend(ctx.chat, ctx.user, ctx.principal, fileIds);
  return Response.json(result);
});
