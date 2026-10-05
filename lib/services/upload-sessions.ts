import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";

const SESSION_TTL_MS = 30 * 60 * 1000;

export async function createUploadSession(chatId: string, folderId: string | null, userId: string) {
  // Only one pending/active target per user at a time.
  await db
    .update(schema.uploadSessions)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(schema.uploadSessions.userId, userId), sql`${schema.uploadSessions.status} in ('pending','active')`));
  const [row] = await db
    .insert(schema.uploadSessions)
    .values({ chatId, folderId, userId, status: "pending", expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
    .returning();
  return row;
}

/** Called when the user taps the deep link and the bot receives `/start up_<id>`. */
export async function activateUploadSession(sessionId: string, userId: string) {
  const session = await db.query.uploadSessions.findFirst({ where: eq(schema.uploadSessions.id, sessionId) });
  if (!session || session.userId !== userId) throw ApiError.notFound("Upload session");
  if (session.expiresAt.getTime() < Date.now() || session.status === "expired" || session.status === "done") {
    throw new ApiError(410, "FILE_GONE", "This upload link has expired. Open the folder in the app and tap Upload again.");
  }
  await db
    .update(schema.uploadSessions)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(schema.uploadSessions.userId, userId), eq(schema.uploadSessions.status, "active")));
  const [row] = await db
    .update(schema.uploadSessions)
    .set({ status: "active", expiresAt: new Date(Date.now() + SESSION_TTL_MS), updatedAt: new Date() })
    .where(eq(schema.uploadSessions.id, sessionId))
    .returning();
  return row;
}

export async function getActiveUploadSession(userId: string) {
  return db.query.uploadSessions.findFirst({
    where: and(eq(schema.uploadSessions.userId, userId), eq(schema.uploadSessions.status, "active"), gt(schema.uploadSessions.expiresAt, new Date())),
    orderBy: desc(schema.uploadSessions.updatedAt),
  });
}

export async function touchUploadSession(id: string) {
  await db
    .update(schema.uploadSessions)
    .set({ filesCount: sql`${schema.uploadSessions.filesCount} + 1`, expiresAt: new Date(Date.now() + SESSION_TTL_MS), updatedAt: new Date() })
    .where(eq(schema.uploadSessions.id, id));
}

export async function finishUploadSessions(userId: string) {
  const rows = await db
    .update(schema.uploadSessions)
    .set({ status: "done", updatedAt: new Date() })
    .where(and(eq(schema.uploadSessions.userId, userId), sql`${schema.uploadSessions.status} in ('pending','active')`))
    .returning();
  return rows;
}
