/**
 * Configures the Telegram bot for this deployment:
 *   - webhook (with secret token)
 *   - bot commands (private + group scopes)
 *   - menu button "📁 Files" (private chats; groups use the /files button)
 *   - descriptions
 *
 * Usage: pnpm telegram:setup [--drop-pending] [--no-webhook]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { env } from "@/lib/env";
import { telegram } from "@/lib/telegram/bot-api";

async function main() {
  const e = env();
  const api = telegram();
  const args = new Set(process.argv.slice(2));

  const me = await api.getMe();
  console.log(`Bot: @${me.username} (${me.id})`);
  if (me.username?.toLowerCase() !== e.TELEGRAM_BOT_USERNAME.toLowerCase()) {
    console.warn(`⚠️  TELEGRAM_BOT_USERNAME is "${e.TELEGRAM_BOT_USERNAME}" but the token belongs to @${me.username}. Fix .env.local.`);
  }

  if (!args.has("--no-webhook")) {
    const url = new URL("/api/telegram/webhook", e.NEXT_PUBLIC_APP_URL).toString();
    await api.setWebhook({
      url,
      secret_token: e.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "my_chat_member", "callback_query"],
      drop_pending_updates: args.has("--drop-pending"),
    });
    console.log(`Webhook set: ${url}`);
  }

  await api.setMyCommands(
    [
      { command: "files", description: "Open the file manager" },
      { command: "help", description: "How this bot works" },
    ],
    { type: "default" },
  );
  await api.setMyCommands(
    [
      { command: "files", description: "Open the file manager" },
      { command: "done", description: "Finish uploading via Telegram" },
      { command: "help", description: "How this bot works" },
    ],
    { type: "all_private_chats" },
  );
  await api.setMyCommands(
    [
      // Ephemeral (Bot API 10.2+): only the sender sees the command and the bot's reply.
      { command: "files", description: "Open this group's files", is_ephemeral: true },
      { command: "help", description: "How this bot works", is_ephemeral: true },
    ],
    { type: "all_group_chats" },
  );
  console.log("Commands set.");

  // Menu buttons only exist in private chats; this opens the Mini App in chat-picker mode.
  await api.setChatMenuButton({ type: "web_app", text: "📁 Files", web_app: { url: e.NEXT_PUBLIC_APP_URL } });
  console.log("Menu button set.");

  await api.setMyShortDescription("Shared drive for Telegram groups: folders, uploads, search. Files are stored by Telegram.").catch(() => undefined);
  await api
    .setMyDescription("Add me to a group and send /files to open a Google-Drive-like file manager for that group. Files are stored by Telegram itself.")
    .catch(() => undefined);

  const info = await api.getWebhookInfo();
  console.log("Webhook info:", JSON.stringify(info, null, 2));
  console.log(
    `\nNext steps in @BotFather:\n` +
      `  1. Bot Settings → Configure Mini App → Enable Mini App → URL: ${e.NEXT_PUBLIC_APP_URL}\n` +
      `     (or /newapp to create a direct-link app and set TELEGRAM_MINI_APP_SHORT_NAME)\n` +
      `  2. Bot Settings → Group Privacy → keep default (commands are received regardless)\n` +
      `  3. Add the bot to your group as an administrator, then send /files there.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
