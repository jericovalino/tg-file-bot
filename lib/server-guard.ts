/**
 * Runtime guard for modules that must never reach the browser (bot token, DB credentials).
 * Unlike the `server-only` package this also works in plain Node scripts (tsx).
 */
if (typeof window !== "undefined") {
  throw new Error("This module is server-only and must not be imported from client code.");
}
export {};
