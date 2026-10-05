import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/errors";
import type { Role } from "@/lib/permissions/policy";

/**
 * Session tokens are signed JWTs (HS256) carried in the Authorization header. They bind a Telegram user to one
 * chat, so every API call is scoped to that chat without ever accepting a chat id from the client.
 *
 *  - `user`     : authenticated but no chat selected yet (used only to list/select chats)
 *  - `chat`     : authenticated for a single chat (all file/folder APIs)
 *  - `download` : short-lived, single-file read grant placed in download URLs
 *  - `media`    : chat-scoped read grant used for <img> thumbnails/previews
 */
export type TokenKind = "user" | "chat" | "download" | "media";

export interface SessionClaims extends JWTPayload {
  kind: TokenKind;
  /** users.id */
  sub: string;
  /** telegram user id */
  tg: number;
  /** telegram_chats.id */
  chat?: string;
  role?: Role;
  /** files.id (download tokens) */
  file?: string;
}

function secret() {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

export async function signToken(claims: Omit<SessionClaims, "iat" | "exp">, ttlSeconds: number): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .setIssuer("tg-files")
    .sign(secret());
}

export async function verifyToken(token: string, expectedKinds: TokenKind[]): Promise<SessionClaims> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, secret(), { issuer: "tg-files", algorithms: ["HS256"] }));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "ERR_JWT_EXPIRED") throw new ApiError(401, "SESSION_EXPIRED", "Your session expired. Please reopen the app.");
    throw new ApiError(401, "UNAUTHORIZED", "Invalid session.");
  }
  const claims = payload as SessionClaims;
  if (!claims.kind || !expectedKinds.includes(claims.kind) || typeof claims.sub !== "string") {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid session.");
  }
  return claims;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
