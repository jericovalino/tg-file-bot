import { route } from "@/lib/api/errors";
import { requireChatContext } from "@/lib/auth/context";
import { assertCan } from "@/lib/permissions";
import { getFolderTree } from "@/lib/services/folders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full folder tree of the current chat (used by the Move dialog). */
export const GET = route(async (req) => {
  const ctx = await requireChatContext(req);
  assertCan(ctx.principal, "files.view");
  const tree = await getFolderTree(ctx.chat.id);
  return Response.json({ tree });
});
