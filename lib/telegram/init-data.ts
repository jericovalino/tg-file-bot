import { createHmac, timingSafeEqual } from "node:crypto";
import type { TgUser } from "./types";

export interface ParsedInitData {
  user: TgUser;
  authDate: number;
  queryId?: string;
  chatType?: "sender" | "private" | "group" | "supergroup" | "channel";
  chatInstance?: string;
  startParam?: string;
  /** Present only for Mini Apps launched via the attachment menu. */
  chat?: { id: number; type: string; title?: string; username?: string };
  raw: Record<string, string>;
}

export class InitDataError extends Error {
  constructor(
    message: string,
    public readonly code: "MALFORMED" | "BAD_HASH" | "EXPIRED" | "NO_USER",
  ) {
    super(message);
    this.name = "InitDataError";
  }
}

/** Secret key = HMAC_SHA256(key = "WebAppData", data = bot_token) — as specified by Telegram. */
export function initDataSecretKey(botToken: string): Buffer {
  return createHmac("sha256", "WebAppData").update(botToken).digest();
}

/**
 * All received fields except `hash`, sorted, joined with "\n". Note that `signature` (Bot API 8.0+) IS part of the
 * string for bot-side HMAC validation; it is only excluded in the third-party Ed25519 scheme.
 */
export function buildDataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

/**
 * Validates Telegram Mini App `initData` server-side (HMAC-SHA256 with the bot token).
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string, botToken: string, maxAgeSeconds: number, now = Date.now()): ParsedInitData {
  if (!initData || initData.length > 8192) throw new InitDataError("initData is missing or too long", "MALFORMED");
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    throw new InitDataError("initData is not a valid query string", "MALFORMED");
  }
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw new InitDataError("hash is missing", "MALFORMED");

  const dataCheckString = buildDataCheckString(params);
  const expected = createHmac("sha256", initDataSecretKey(botToken)).update(dataCheckString).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new InitDataError("initData signature is invalid. Check that TELEGRAM_BOT_TOKEN belongs to the bot that opened this Mini App.", "BAD_HASH");

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) throw new InitDataError("auth_date is invalid", "MALFORMED");
  const ageSeconds = Math.floor(now / 1000) - authDate;
  if (ageSeconds > maxAgeSeconds || ageSeconds < -300) throw new InitDataError("initData has expired, please reopen the app", "EXPIRED");

  const userRaw = params.get("user");
  if (!userRaw) throw new InitDataError("initData does not contain a user", "NO_USER");
  let user: TgUser;
  try {
    user = JSON.parse(userRaw) as TgUser;
  } catch {
    throw new InitDataError("user field is not valid JSON", "MALFORMED");
  }
  if (typeof user?.id !== "number" || !Number.isSafeInteger(user.id) || typeof user.first_name !== "string") {
    throw new InitDataError("user field is malformed", "MALFORMED");
  }

  let chat: ParsedInitData["chat"];
  const chatRaw = params.get("chat");
  if (chatRaw) {
    try {
      chat = JSON.parse(chatRaw) as ParsedInitData["chat"];
    } catch {
      chat = undefined;
    }
  }

  const chatType = params.get("chat_type") ?? undefined;
  return {
    user,
    authDate,
    queryId: params.get("query_id") ?? undefined,
    chatType: chatType as ParsedInitData["chatType"],
    chatInstance: params.get("chat_instance") ?? undefined,
    startParam: params.get("start_param") ?? undefined,
    chat,
    raw: Object.fromEntries(params.entries()),
  };
}

/** Test helper: produce a signed initData string exactly as Telegram would. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = buildDataCheckString(params);
  const hash = createHmac("sha256", initDataSecretKey(botToken)).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}
