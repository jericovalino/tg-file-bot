import "@/lib/server-guard";
import { z } from "zod";

const MB = 1024 * 1024;

const boolish = z
  .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0"), z.literal("")])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(20, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_BOT_USERNAME: z
    .string()
    .min(3)
    .transform((v) => v.replace(/^@/, "")),
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .min(16)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/, "Only A-Z, a-z, 0-9, _ and - are allowed"),
  /** Short name of a Direct Link Mini App created with @BotFather (/newapp). Optional: without it the bot's Main Mini App link (t.me/<bot>?startapp=) is used. */
  TELEGRAM_MINI_APP_SHORT_NAME: z.string().optional().transform((v) => (v ? v : undefined)),
  /** Private channel/group where uploaded files are posted. Optional: falls back to posting into the group itself. */
  TELEGRAM_STORAGE_CHAT_ID: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || Number.isSafeInteger(v), "TELEGRAM_STORAGE_CHAT_ID must be an integer"),
  /** Bot API root. Point to a local Bot API server (https://github.com/tdlib/telegram-bot-api) to lift the 50 MB / 20 MB limits. */
  TELEGRAM_API_ROOT: z.string().url().default("https://api.telegram.org"),
  /** Set to true when the local Bot API server runs with --local (getFile returns absolute local paths). */
  TELEGRAM_LOCAL_MODE: boolish,
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(20 * MB),
  /** 0 = unlimited (only valid with a local Bot API server). */
  MAX_DOWNLOAD_BYTES: z.coerce.number().int().min(0).default(20 * MB),
  BLOCKED_FILE_EXTENSIONS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase().replace(/^\./, ""))
        .filter(Boolean),
    ),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional(),

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60),
  INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),
  MEMBERSHIP_CACHE_SECONDS: z.coerce.number().int().min(0).default(5 * 60),

  NEXT_PUBLIC_APP_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Hosted Bot API hard limits (verified against Bot API 10.3 docs, 2026). */
export const TELEGRAM_HOSTED_LIMITS = {
  multipartUploadBytes: 50 * MB,
  photoUploadBytes: 10 * MB,
  getFileDownloadBytes: 20 * MB,
} as const;

export function effectiveLimits() {
  const e = env();
  const isLocalServer = !e.TELEGRAM_API_ROOT.startsWith("https://api.telegram.org");
  const maxUpload = isLocalServer
    ? e.MAX_UPLOAD_BYTES
    : Math.min(e.MAX_UPLOAD_BYTES, TELEGRAM_HOSTED_LIMITS.multipartUploadBytes);
  const maxDownload = isLocalServer
    ? e.MAX_DOWNLOAD_BYTES
    : e.MAX_DOWNLOAD_BYTES === 0
      ? TELEGRAM_HOSTED_LIMITS.getFileDownloadBytes
      : Math.min(e.MAX_DOWNLOAD_BYTES, TELEGRAM_HOSTED_LIMITS.getFileDownloadBytes);
  return { maxUploadBytes: maxUpload, maxDownloadBytes: maxDownload, isLocalServer };
}
