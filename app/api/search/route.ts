import { route } from "@/lib/api/errors";
import { requireChatContext } from "@/lib/auth/context";
import { assertCan } from "@/lib/permissions";
import { effectiveLimits } from "@/lib/env";
import { searchChat } from "@/lib/services/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/search?q=... — scoped to the chat bound to the session token. */
export const GET = route(async (req) => {
  const ctx = await requireChatContext(req);
  assertCan(ctx.principal, "files.view");
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await searchChat(ctx.chat.id, q, effectiveLimits().maxDownloadBytes);
  return Response.json(results, { headers: { "cache-control": "no-store" } });
});
