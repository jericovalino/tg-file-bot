import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };

declare global {
  var __tgFilesDb: Db | undefined;
}

/**
 * The connection is created on first use, not at import time, so `next build` and Docker image builds work
 * without database credentials. `prepare: false` keeps the driver compatible with Supabase/PgBouncer transaction pooling.
 */
function getDb(): Db {
  if (!globalThis.__tgFilesDb) {
    const client = postgres(env().DATABASE_URL, { prepare: false, max: 10, idle_timeout: 20, connect_timeout: 10 });
    globalThis.__tgFilesDb = drizzle(client, { schema });
  }
  return globalThis.__tgFilesDb;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop) as unknown;
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});
