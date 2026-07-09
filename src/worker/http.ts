import type { Context } from "hono";

export type ApiErrorCode =
  | "bad_request"
  | "conflict"
  | "csrf_failed"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "server_error"
  | "unauthorized"
  | "validation_failed";

export function apiSuccess<T>(data: T) {
  return { data };
}

export function apiError(c: Context, status: number, code: ApiErrorCode, message: string, details?: unknown) {
  return c.json(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    status as never,
  );
}
