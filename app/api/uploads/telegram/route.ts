import { z } from "zod";
import { readJson, route } from "@/lib/api/errors";
import { requireChatContext } from "@/lib/auth/context";
import { assertCan } from "@/lib/permissions";
import { env } from "@/lib/env";
import { buildBotStartLink } from "@/lib/telegram/links";
import { folderPathString, requireFolderInChat } from "@/lib/services/folders";
import { createUploadSession } from "@/lib/services/upload-sessions";
import type { TelegramUploadSessionDto } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ folderId: z.string().uuid().nullable() });

/**
 * "Upload via Telegram": creates an upload target and returns a t.me deep link. The user sends files to the bot
 * in a private chat and each file is filed into the chosen folder. No server bandwidth, no 50 MB limit.
 */
export const POST = route(async (req) => {
  const ctx = await requireChatContext(req);
  assertCan(ctx.principal, "files.upload");
  const { folderId } = await readJson(req, bodySchema);
  if (folderId) await requireFolderInChat(ctx.chat.id, folderId);
  const session = await createUploadSession(ctx.chat.id, folderId, ctx.user.id);
  const body: TelegramUploadSessionDto = {
    sessionId: session.id,
    link: buildBotStartLink(env().TELEGRAM_BOT_USERNAME, `up_${session.id}`),
    expiresAt: session.expiresAt.toISOString(),
    folderPath: await folderPathString(ctx.chat.id, folderId),
  };
  return Response.json(body, { status: 201 });
});
