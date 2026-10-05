import { z } from "zod";
import { readJson, route } from "@/lib/api/errors";
import { createSession } from "@/lib/services/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  initData: z.string().min(1).max(8192),
  chatId: z.string().uuid().optional(),
});

/** Exchange Telegram Mini App initData for a session token. */
export const POST = route(async (req) => {
  const body = await readJson(req, bodySchema);
  const session = await createSession(body.initData, body.chatId);
  return Response.json(session, { headers: { "cache-control": "no-store" } });
});
