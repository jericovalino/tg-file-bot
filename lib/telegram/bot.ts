import "@/lib/server-guard";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";
import { telegram, TelegramApiError } from "./bot-api";
import { buildMiniAppLink, encodeStartParam } from "./links";
import { extractMedia } from "./media";
import type { TgChatMemberUpdated, TgInlineKeyboardMarkup, TgMessage, TgUpdate } from "./types";
import { getChatById, migrateChatId, upsertChat } from "@/lib/services/chats";
import { upsertUser } from "@/lib/services/users";
import { recordSeenMember } from "@/lib/services/members";
import { folderPathString } from "@/lib/services/folders";
import { registerIncomingFile } from "@/lib/services/files";
import { activateUploadSession, finishUploadSessions, getActiveUploadSession, touchUploadSession } from "@/lib/services/upload-sessions";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function miniAppLinkForChat(chatKey: string) {
  const e = env();
  return buildMiniAppLink(e.TELEGRAM_BOT_USERNAME, encodeStartParam({ type: "chat", chatKey }), e.TELEGRAM_MINI_APP_SHORT_NAME);
}

function groupFilesKeyboard(chatKey: string): TgInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "📁 Open Files", url: miniAppLinkForChat(chatKey) }]] };
}

/** In private chats a web_app button can open the Mini App directly (chat picker mode). */
function privateFilesKeyboard(): TgInlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: "📁 Open Files", web_app: { url: env().NEXT_PUBLIC_APP_URL } }]] };
}

function parseCommand(m: TgMessage): { command: string; args: string } | null {
  const text = m.text ?? "";
  const entity = m.entities?.find((e) => e.type === "bot_command" && e.offset === 0);
  if (!entity && !text.startsWith("/")) return null;
  const length = entity?.length ?? text.split(/\s/)[0].length;
  const raw = text.slice(0, length);
  const [cmd, mention] = raw.split("@");
  if (mention && mention.toLowerCase() !== env().TELEGRAM_BOT_USERNAME.toLowerCase()) return null;
  return { command: cmd.toLowerCase(), args: text.slice(length).trim() };
}

/** Entry point for every webhook update. Never throws: errors are logged so Telegram doesn't retry forever. */
export async function handleUpdate(update: TgUpdate): Promise<void> {
  try {
    if (update.my_chat_member) await handleMyChatMember(update.my_chat_member);
    else if (update.message) await handleMessage(update.message);
    else if (update.callback_query) await telegram().answerCallbackQuery(update.callback_query.id).catch(() => undefined);
  } catch (err) {
    console.error("[bot] failed to handle update", update.update_id, err);
  }
}

async function handleMyChatMember(u: TgChatMemberUpdated) {
  if (u.chat.type !== "group" && u.chat.type !== "supergroup") return;
  const status = u.new_chat_member.status;
  const chat = await upsertChat(u.chat, status);
  const wasOut = ["left", "kicked"].includes(u.old_chat_member.status);
  const isIn = ["member", "administrator", "restricted"].includes(status);
  if (wasOut && isIn) {
    const admin = status === "administrator";
    const text =
      `👋 Hi! I keep <b>${esc(chat.title)}</b>'s files organised in folders, like a shared drive.\n\n` +
      `Tap the button below or send /files any time to open the file manager.` +
      (admin ? "" : `\n\n<i>Tip: make me an administrator so I can verify group membership reliably.</i>`);
    await telegram()
      .sendMessage({ chat_id: u.chat.id, text, parse_mode: "HTML", reply_markup: groupFilesKeyboard(chat.chatKey) })
      .catch((err) => console.warn("[bot] welcome message failed", (err as Error).message));
  }
}

async function handleMessage(m: TgMessage) {
  if (m.chat.type === "group" || m.chat.type === "supergroup") return handleGroupMessage(m);
  if (m.chat.type === "private") return handlePrivateMessage(m);
}

async function handleGroupMessage(m: TgMessage) {
  const migrateTo = (m as TgMessage & { migrate_to_chat_id?: number }).migrate_to_chat_id;
  if (migrateTo) {
    await migrateChatId(m.chat.id, migrateTo);
    return;
  }
  const cmd = parseCommand(m);
  if (!cmd) return;
  if (!["/files", "/start", "/help"].includes(cmd.command)) return;

  const chat = await upsertChat(m.chat);
  if (m.from && !m.from.is_bot) {
    const user = await upsertUser(m.from);
    await recordSeenMember(chat.id, user.id);
  }

  const text =
    cmd.command === "/help"
      ? `📁 <b>Group Files</b>\n\nI store this group's files in folders. Open the file manager to browse, upload, search and organise files.\n\n` +
        `• Members can view, download and upload files.\n• Admins can also create folders, move, rename and delete.\n\n` +
        `Send /files to open it.`
      : `📁 <b>${esc(chat.title)} — Files</b>\nTap below to open the file manager.`;

  const api = telegram();
  // Bot API 10.2+: when the command was sent ephemerally, answer ephemerally so the group isn't spammed.
  if (m.ephemeral_message_id && m.from) {
    try {
      await api.sendMessage({
        chat_id: m.chat.id,
        text,
        parse_mode: "HTML",
        reply_markup: groupFilesKeyboard(chat.chatKey),
        ephemeral_message_parameters: { receiver_user_id: m.from.id },
        reply_parameters: { ephemeral_message_id: m.ephemeral_message_id },
      });
      return;
    } catch (err) {
      console.warn("[bot] ephemeral reply failed, falling back", (err as Error).message);
    }
  }
  await api.sendMessage({
    chat_id: m.chat.id,
    text,
    parse_mode: "HTML",
    reply_markup: groupFilesKeyboard(chat.chatKey),
    reply_parameters: { message_id: m.message_id },
    disable_notification: true,
  });
}

async function handlePrivateMessage(m: TgMessage) {
  if (!m.from || m.from.is_bot) return;
  const api = telegram();
  const user = await upsertUser(m.from);
  const cmd = parseCommand(m);

  if (cmd) {
    switch (cmd.command) {
      case "/start": {
        if (cmd.args.startsWith("up_")) return activateUpload(m, user.id, cmd.args.slice(3));
        await api.sendMessage({
          chat_id: m.chat.id,
          text:
            `👋 <b>Welcome!</b>\n\nI turn Telegram groups into shared drives with folders and subfolders.\n\n` +
            `1️⃣ Add me to a group (as an admin, ideally).\n2️⃣ Send /files in the group to open its file manager.\n\n` +
            `You can also open the file manager here to pick one of your groups.`,
          parse_mode: "HTML",
          reply_markup: privateFilesKeyboard(),
        });
        return;
      }
      case "/files":
        await api.sendMessage({ chat_id: m.chat.id, text: "📁 Choose a group to browse its files:", reply_markup: privateFilesKeyboard() });
        return;
      case "/help":
        await api.sendMessage({
          chat_id: m.chat.id,
          text:
            `<b>Commands</b>\n/files — open the file manager\n/done — finish an "Upload via Telegram" session\n/help — this message\n\n` +
            `<b>Uploading large files</b>\nIn the app, open a folder → Upload → "Upload via Telegram", then send me the files here. ` +
            `Files you send are stored by Telegram and filed into the folder you picked.`,
          parse_mode: "HTML",
        });
        return;
      case "/done":
      case "/cancel": {
        const finished = await finishUploadSessions(user.id);
        const count = finished.reduce((n, s) => n + s.filesCount, 0);
        await api.sendMessage({
          chat_id: m.chat.id,
          text: finished.length ? `✅ Done. ${count} file${count === 1 ? "" : "s"} saved. Go back to the group and open /files to see them.` : "Nothing to finish.",
        });
        return;
      }
      default:
        return;
    }
  }

  const media = extractMedia(m);
  if (media) return fileIncoming(m, user.id);

  if (m.text) {
    await api.sendMessage({
      chat_id: m.chat.id,
      text: "Send me a file to upload it, or open the file manager to browse your groups.",
      reply_markup: privateFilesKeyboard(),
    });
  }
}

async function activateUpload(m: TgMessage, userId: string, sessionId: string) {
  const api = telegram();
  try {
    const session = await activateUploadSession(sessionId, userId);
    const chat = await getChatById(session.chatId);
    const path = chat ? await folderPathString(chat.id, session.folderId) : "";
    await api.sendMessage({
      chat_id: m.chat.id,
      text:
        `📤 <b>Ready to receive files</b>\n\nDestination: <b>${esc(chat?.title ?? "")}</b> / ${esc(path)}\n\n` +
        `Send me the files (any size Telegram allows) and I'll save them there. Send /done when you're finished.`,
      parse_mode: "HTML",
    });
  } catch (err) {
    const text = err instanceof ApiError ? err.message : "Could not start the upload session. Open the folder in the app and tap Upload again.";
    await api.sendMessage({ chat_id: m.chat.id, text });
  }
}

async function fileIncoming(m: TgMessage, userId: string) {
  const api = telegram();
  const session = await getActiveUploadSession(userId);
  if (!session) {
    await api.sendMessage({
      chat_id: m.chat.id,
      text: `To file this into a group folder: open the file manager, go to the folder, tap <b>Upload → Upload via Telegram</b>, then send the file again.`,
      parse_mode: "HTML",
      reply_markup: privateFilesKeyboard(),
      reply_parameters: { message_id: m.message_id },
    });
    return;
  }
  const chat = await getChatById(session.chatId);
  if (!chat) return;
  try {
    const user = (await upsertUser(m.from!))!;
    const folderPath = await folderPathString(chat.id, session.folderId);
    const row = await registerIncomingFile({ chat, folderId: session.folderId, user, message: m, folderPath });
    await touchUploadSession(session.id);
    await api.sendMessage({
      chat_id: m.chat.id,
      text: `✅ Saved <b>${esc(row.fileName)}</b> → ${esc(chat.title)} / ${esc(folderPath)}`,
      parse_mode: "HTML",
      reply_parameters: { message_id: m.message_id },
      disable_notification: true,
    });
  } catch (err) {
    const text =
      err instanceof ApiError
        ? `❌ ${err.message}`
        : err instanceof TelegramApiError
          ? `❌ Telegram error: ${err.description}`
          : "❌ Could not save the file. Please try again.";
    await api.sendMessage({ chat_id: m.chat.id, text, reply_parameters: { message_id: m.message_id } });
  }
}
