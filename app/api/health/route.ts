import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Unwraps Drizzle's query error wrapper so the root cause (DNS, auth, network) is visible. */
function rootCause(err: unknown): { message: string; code?: string } {
  let cur: unknown = err;
  for (let i = 0; i < 5; i++) {
    const next = (cur as { cause?: unknown })?.cause;
    if (!next) break;
    cur = next;
  }
  const e = cur as { message?: string; code?: string };
  return { message: e?.message ?? String(cur), code: e?.code };
}

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "up" });
  } catch (err) {
    const cause = rootCause(err);
    const hint =
      /ENETUNREACH|EHOSTUNREACH|ENOTFOUND|ETIMEDOUT|ECONNREFUSED/.test(`${cause.code} ${cause.message}`)
        ? "Database host unreachable. On Vercel/serverless, use Supabase's pooler URI (aws-0-<region>.pooler.supabase.com:6543, user postgres.<ref>) — the db.<ref>.supabase.co host is IPv6-only."
        : /password|authentication/i.test(cause.message)
          ? "Authentication failed. Check the password and URL-encode special characters."
          : undefined;
    return Response.json({ ok: false, db: "down", error: cause.message, code: cause.code, hint }, { status: 503 });
  }
}
