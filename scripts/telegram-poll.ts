/**
 * Local development without a public webhook URL: long-polls getUpdates and forwards each update to the
 * local Next.js webhook route with the secret header, so the exact same handler code runs.
 *
 * Usage: pnpm telegram:poll   (requires `pnpm dev` running)
 * Note: deletes the webhook (Telegram doesn't allow both). Run `pnpm telegram:setup` again before deploying.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { env } from "@/lib/env";
import { telegram } from "@/lib/telegram/bot-api";
import type { TgUpdate } from "@/lib/telegram/types";

async function main() {
  const e = env();
  const api = telegram();
  const target = process.env.POLL_TARGET_URL ?? "http://localhost:3000/api/telegram/webhook";
  await api.deleteWebhook(false);
  console.log(`Polling getUpdates → ${target}`);
  let offset = 0;
  for (;;) {
    try {
      const updates = await api.call<TgUpdate[]>(
        "getUpdates",
        { offset, timeout: 30, allowed_updates: ["message", "my_chat_member", "callback_query"] },
        undefined,
        45_000,
      );
      for (const u of updates) {
        offset = u.update_id + 1;
        const res = await fetch(target, {
          method: "POST",
          headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": e.TELEGRAM_WEBHOOK_SECRET },
          body: JSON.stringify(u),
        });
        console.log(`update ${u.update_id} → ${res.status}`);
      }
    } catch (err) {
      console.error("poll error:", (err as Error).message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
