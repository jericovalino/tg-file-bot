import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { handleUpdate } from "@/lib/telegram/bot";
import type { TgUpdate } from "@/lib/telegram/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function secretMatches(header: string | null): boolean {
  const expected = env().TELEGRAM_WEBHOOK_SECRET;
  if (!header || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/** Telegram webhook. Authenticated with the secret token Telegram echoes back in a header. */
export async function POST(req: Request) {
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("forbidden", { status: 403 });
  }
  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (typeof update?.update_id !== "number") return new Response("bad request", { status: 400 });
  await handleUpdate(update);
  // Always 200: a non-2xx makes Telegram retry the same update.
  return Response.json({ ok: true });
}
