import { z } from "zod";
import { readJson, route } from "@/lib/api/errors";
import { requireUserContext } from "@/lib/auth/context";
import { createSessionForSelectedChat } from "@/lib/services/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ chatId: z.string().uuid() });

/** Picker flow: turn a user-level session into a chat-scoped session (membership verified via Telegram). */
export const POST = route(async (req) => {
  const ctx = await requireUserContext(req);
  const { chatId } = await readJson(req, bodySchema);
  const session = await createSessionForSelectedChat(ctx.user.id, chatId);
  return Response.json(session, { headers: { "cache-control": "no-store" } });
});
