import { z } from "zod";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "INVALID_INIT_DATA"
  | "FORBIDDEN"
  | "NOT_A_MEMBER"
  | "BOT_NOT_IN_CHAT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FILE_TOO_LARGE"
  | "FILE_TOO_LARGE_FOR_DOWNLOAD"
  | "FILE_TYPE_BLOCKED"
  | "FILE_GONE"
  | "INVALID_MOVE"
  | "TELEGRAM_ERROR"
  | "CHAT_NOT_SELECTED"
  | "USER_NOT_REACHABLE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static notFound(what = "Resource") {
    return new ApiError(404, "NOT_FOUND", `${what} not found.`);
  }
  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  toResponse(): Response {
    return Response.json(
      { error: { code: this.code, message: this.message, details: this.details ?? undefined } },
      { status: this.status },
    );
  }
}

export function errorToResponse(err: unknown): Response {
  if (err instanceof ApiError) return err.toResponse();
  if (err instanceof z.ZodError) {
    return new ApiError(400, "VALIDATION_ERROR", "Invalid request.", err.issues.map((i) => ({ path: i.path, message: i.message }))).toResponse();
  }
  console.error("[api] unhandled error", err);
  const message = process.env.NODE_ENV === "production" ? "Something went wrong." : ((err as Error)?.message ?? "Unknown error");
  return new ApiError(500, "INTERNAL_ERROR", message).toResponse();
}

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response>;

/** Wraps a route handler so thrown errors become consistent JSON responses. */
export function route<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return errorToResponse(err);
    }
  };
}

export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw ApiError.badRequest("Request body must be JSON.");
  }
  return schema.parse(body);
}

export const uuidSchema = z.string().uuid();
