import "@/lib/server-guard";
import { env } from "@/lib/env";
import type {
  TgBotCommand,
  TgBotCommandScope,
  TgChat,
  TgChatMember,
  TgEphemeralMessageParameters,
  TgFile,
  TgInlineKeyboardMarkup,
  TgMenuButton,
  TgMessage,
  TgResponse,
  TgUser,
  TgWebhookInfo,
} from "./types";

export class TelegramApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly code: number,
    public readonly description: string,
    public readonly parameters?: { migrate_to_chat_id?: number; retry_after?: number },
  ) {
    super(`Telegram ${method} failed (${code}): ${description}`);
    this.name = "TelegramApiError";
  }

  get isFileTooBig() {
    return /file is too big/i.test(this.description);
  }
  get isBotNotInChat() {
    return (
      /bot was kicked|bot is not a member|chat not found|bot was blocked|not enough rights|CHAT_WRITE_FORBIDDEN|have no rights/i.test(
        this.description,
      ) || this.code === 403
    );
  }
  get isUserNotFound() {
    return /user not found|PARTICIPANT_ID_INVALID|member not found/i.test(this.description);
  }
  get isBadFileId() {
    return /wrong file_id|file not found|wrong remote file|FILE_REFERENCE|invalid file_id/i.test(this.description);
  }
  get isMessageGone() {
    return /message to delete not found|message to copy not found|message can't be deleted|message not found|MESSAGE_ID_INVALID/i.test(
      this.description,
    );
  }
  get cantInitiateConversation() {
    return /bot can't initiate conversation|bot was blocked by the user|user is deactivated|chat not found/i.test(this.description);
  }
}

export interface UploadFile {
  blob: Blob;
  filename: string;
}

type Params = Record<string, unknown>;

/**
 * Thin, typed wrapper around the Telegram Bot API. This is the only module allowed to touch the bot token.
 * Works with the hosted API (api.telegram.org) and with a self-hosted Bot API server (TELEGRAM_API_ROOT).
 */
export class TelegramBotApi {
  constructor(
    private readonly token: string,
    private readonly apiRoot: string,
    private readonly localMode: boolean,
  ) {}

  private endpoint(method: string) {
    return `${this.apiRoot.replace(/\/$/, "")}/bot${this.token}/${method}`;
  }

  async call<T>(method: string, params: Params = {}, files?: Record<string, UploadFile>, timeoutMs = 30_000): Promise<T> {
    let body: BodyInit;
    const headers: Record<string, string> = {};
    if (files && Object.keys(files).length > 0) {
      const form = new FormData();
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        form.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
      }
      for (const [field, f] of Object.entries(files)) form.append(field, f.blob, f.filename);
      body = form;
    } else {
      body = JSON.stringify(params);
      headers["content-type"] = "application/json";
    }

    let res: Response;
    try {
      res = await fetch(this.endpoint(method), { method: "POST", body, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new TelegramApiError(method, 0, `network error: ${(err as Error).message}`);
    }

    let json: TgResponse<T>;
    try {
      json = (await res.json()) as TgResponse<T>;
    } catch {
      throw new TelegramApiError(method, res.status, `invalid response (${res.status})`);
    }
    if (!json.ok || json.result === undefined) {
      throw new TelegramApiError(method, json.error_code ?? res.status, json.description ?? "unknown error", json.parameters);
    }
    return json.result;
  }

  // ---- Bot setup -----------------------------------------------------------------------------

  getMe() {
    return this.call<TgUser>("getMe");
  }
  setWebhook(p: { url: string; secret_token: string; allowed_updates?: string[]; drop_pending_updates?: boolean; max_connections?: number }) {
    return this.call<true>("setWebhook", p);
  }
  deleteWebhook(drop_pending_updates = false) {
    return this.call<true>("deleteWebhook", { drop_pending_updates });
  }
  getWebhookInfo() {
    return this.call<TgWebhookInfo>("getWebhookInfo");
  }
  setMyCommands(commands: TgBotCommand[], scope?: TgBotCommandScope) {
    return this.call<true>("setMyCommands", { commands, scope });
  }
  setChatMenuButton(menu_button: TgMenuButton, chat_id?: number) {
    return this.call<true>("setChatMenuButton", { menu_button, chat_id });
  }
  setMyShortDescription(short_description: string) {
    return this.call<true>("setMyShortDescription", { short_description });
  }
  setMyDescription(description: string) {
    return this.call<true>("setMyDescription", { description });
  }

  // ---- Chats & members -----------------------------------------------------------------------

  getChat(chat_id: number) {
    return this.call<TgChat>("getChat", { chat_id });
  }
  getChatMember(chat_id: number, user_id: number) {
    return this.call<TgChatMember>("getChatMember", { chat_id, user_id });
  }

  // ---- Messages ------------------------------------------------------------------------------

  sendMessage(p: {
    chat_id: number;
    text: string;
    parse_mode?: "HTML" | "MarkdownV2";
    reply_markup?: TgInlineKeyboardMarkup;
    disable_notification?: boolean;
    link_preview_options?: { is_disabled?: boolean };
    reply_parameters?: { message_id?: number; ephemeral_message_id?: number };
    ephemeral_message_parameters?: TgEphemeralMessageParameters;
    message_thread_id?: number;
  }) {
    return this.call<TgMessage>("sendMessage", p);
  }
  editMessageText(p: { chat_id: number; message_id: number; text: string; parse_mode?: "HTML"; reply_markup?: TgInlineKeyboardMarkup }) {
    return this.call<TgMessage | true>("editMessageText", p);
  }
  deleteMessage(chat_id: number, message_id: number) {
    return this.call<true>("deleteMessage", { chat_id, message_id });
  }
  copyMessage(p: { chat_id: number; from_chat_id: number; message_id: number; disable_notification?: boolean; caption?: string }) {
    return this.call<{ message_id: number }>("copyMessage", p);
  }
  answerCallbackQuery(callback_query_id: string, text?: string) {
    return this.call<true>("answerCallbackQuery", { callback_query_id, text });
  }

  // ---- Files ---------------------------------------------------------------------------------

  /** Upload a new file as a document. 50 MB limit on the hosted API, 2000 MB on a local Bot API server. */
  sendDocument(p: { chat_id: number; caption?: string; disable_notification?: boolean; parse_mode?: "HTML" }, file: UploadFile) {
    return this.call<TgMessage>("sendDocument", p, { document: file }, 10 * 60_000);
  }
  /** Re-send an existing Telegram file by file_id (no size limit). */
  sendDocumentById(p: { chat_id: number; document: string; caption?: string; parse_mode?: "HTML"; disable_notification?: boolean }) {
    return this.call<TgMessage>("sendDocument", p);
  }
  sendPhotoById(p: { chat_id: number; photo: string; caption?: string; parse_mode?: "HTML" }) {
    return this.call<TgMessage>("sendPhoto", p);
  }
  sendVideoById(p: { chat_id: number; video: string; caption?: string; parse_mode?: "HTML" }) {
    return this.call<TgMessage>("sendVideo", p);
  }
  sendAnimationById(p: { chat_id: number; animation: string; caption?: string; parse_mode?: "HTML" }) {
    return this.call<TgMessage>("sendAnimation", p);
  }
  sendAudioById(p: { chat_id: number; audio: string; caption?: string; parse_mode?: "HTML" }) {
    return this.call<TgMessage>("sendAudio", p);
  }
  sendVoiceById(p: { chat_id: number; voice: string; caption?: string; parse_mode?: "HTML" }) {
    return this.call<TgMessage>("sendVoice", p);
  }
  sendVideoNoteById(p: { chat_id: number; video_note: string }) {
    return this.call<TgMessage>("sendVideoNote", p);
  }

  /** Resolve a temporary file_path. Hosted API: only files up to 20 MB; the link is valid for at least 1 hour. */
  getFile(file_id: string) {
    return this.call<TgFile>("getFile", { file_id });
  }

  /**
   * Stream a file's bytes from Telegram. Never expose the resulting URL to clients: it contains the bot token.
   * In local mode (`telegram-bot-api --local`) `file_path` is an absolute path on the local disk.
   */
  async fetchFile(filePath: string, range?: string): Promise<Response> {
    if (this.localMode || filePath.startsWith("/")) {
      const { createReadStream, promises: fs } = await import("node:fs");
      const { Readable } = await import("node:stream");
      const stat = await fs.stat(filePath);
      const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
      return new Response(stream, { status: 200, headers: { "content-length": String(stat.size) } });
    }
    const url = `${this.apiRoot.replace(/\/$/, "")}/file/bot${this.token}/${filePath}`;
    const headers: Record<string, string> = {};
    if (range) headers.range = range;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10 * 60_000) });
    if (!res.ok || !res.body) {
      throw new TelegramApiError("downloadFile", res.status, res.status === 404 ? "file not found" : `download failed (${res.status})`);
    }
    return res;
  }
}

let instance: TelegramBotApi | undefined;

export function telegram(): TelegramBotApi {
  if (!instance) {
    const e = env();
    instance = new TelegramBotApi(e.TELEGRAM_BOT_TOKEN, e.TELEGRAM_API_ROOT, e.TELEGRAM_LOCAL_MODE);
  }
  return instance;
}
