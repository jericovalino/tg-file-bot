import { z } from "zod";
import { readJson, route, uuidSchema } from "@/lib/api/errors";
import { requireChatContext } from "@/lib/auth/context";
import { BULK_MAX_ITEMS, bulkMove } from "@/lib/services/bulk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fileIds: z.array(uuidSchema).max(BULK_MAX_ITEMS).default([]),
  folderIds: z.array(uuidSchema).max(BULK_MAX_ITEMS).default([]),
  /** Destination folder; null = the chat root. */
  destinationId: uuidSchema.nullable(),
});

/** Moves a selection of files and folders into one destination atomically (`INVALID_MOVE` on cycles). */
export const POST = route(async (req) => {
  const ctx = await requireChatContext(req);
  const body = await readJson(req, bodySchema);
  const result = await bulkMove(ctx.chat.id, ctx.principal, body);
  return Response.json(result);
});
