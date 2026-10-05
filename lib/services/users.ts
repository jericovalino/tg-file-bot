import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { TgUser } from "@/lib/telegram/types";
import type { UserDto, UserSummary } from "@/lib/types";

export async function upsertUser(tg: TgUser) {
  const [row] = await db
    .insert(schema.users)
    .values({
      telegramUserId: tg.id,
      firstName: tg.first_name,
      lastName: tg.last_name ?? null,
      username: tg.username ?? null,
      languageCode: tg.language_code ?? null,
      photoUrl: tg.photo_url ?? null,
    })
    .onConflictDoUpdate({
      target: schema.users.telegramUserId,
      set: {
        firstName: sql`excluded.first_name`,
        lastName: sql`excluded.last_name`,
        username: sql`excluded.username`,
        languageCode: sql`coalesce(excluded.language_code, ${schema.users.languageCode})`,
        photoUrl: sql`coalesce(excluded.photo_url, ${schema.users.photoUrl})`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return row;
}

export async function getUserById(id: string) {
  return db.query.users.findFirst({ where: eq(schema.users.id, id) });
}

export async function getUserByTelegramId(telegramUserId: number) {
  return db.query.users.findFirst({ where: eq(schema.users.telegramUserId, telegramUserId) });
}

export function toUserDto(u: typeof schema.users.$inferSelect): UserDto {
  return {
    id: u.id,
    telegramUserId: u.telegramUserId,
    firstName: u.firstName,
    lastName: u.lastName,
    username: u.username,
    photoUrl: u.photoUrl,
  };
}

export function toUserSummary(u: { id: string; firstName: string; lastName: string | null; username: string | null } | null): UserSummary | null {
  if (!u) return null;
  return { id: u.id, firstName: u.firstName, lastName: u.lastName, username: u.username };
}
