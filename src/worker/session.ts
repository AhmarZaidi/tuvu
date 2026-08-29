import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { randomId, randomToken, sha256Hex } from "./crypto";
import { apiError } from "./http";
import { isPublicHttps } from "./request-url";
import type { AuthRepository, ProfileRecord, SessionRecord, UserRecord } from "./repository";

export const SESSION_COOKIE = "tuvu_session";
export const CSRF_HEADER = "x-csrf-token";
const SESSION_DAYS = 30;

export type AuthContext = {
  session: SessionRecord;
  user: UserRecord;
  profile: ProfileRecord;
};

export type AppVariables = {
  auth: AuthContext;
  repository: AuthRepository;
};

export async function createSession(repository: AuthRepository, userId: string, userAgent: string | null, now = new Date()) {
  const token = randomToken();
  const csrfToken = randomToken(24);
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const session: SessionRecord = {
    id: randomId("ses"),
    userId,
    tokenHash: await sha256Hex(token),
    csrfToken,
    expiresAt,
    createdAt: issuedAt,
    lastSeenAt: issuedAt,
    userAgent,
  };

  await repository.createSession(session);

  return { token, session };
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: isPublicHttps(c.req),
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function readAuthContext(c: Context, repository: AuthRepository, now = new Date()): Promise<AuthContext | null> {
  const authHeader = c.req.header("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const token = bearerToken || c.req.header("x-tuvu-session") || getCookie(c, SESSION_COOKIE);

  if (token && token !== "dev") {
    const session = await repository.findSessionByTokenHash(await sha256Hex(token), now.toISOString());
    if (session) {
      const [user, profile] = await Promise.all([
        repository.findUserById(session.userId),
        repository.findProfileByUserId(session.userId),
      ]);
      if (user && profile) {
        await repository.touchSession(session.id, now.toISOString());
        return { session, user, profile };
      }
    }
  }

  // Development mode fallback:
  // When running locally in development and no session is provided,
  // resolve the sole local owner (usr_local_test) so mobile clients
  // and local dev tools immediately load the owner's library and dashboards.
  if ((c.env as any)?.ENVIRONMENT === "development") {
    const localUser = await repository.findUserById("usr_local_test");
    if (localUser) {
      const profile = await repository.findProfileByUserId(localUser.id);
      if (profile) {
        return {
          session: {
            id: "ses_dev_local",
            userId: localUser.id,
            tokenHash: "dev",
            csrfToken: "dev_csrf_token",
            expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: now.toISOString(),
            lastSeenAt: now.toISOString(),
            userAgent: c.req.header("user-agent") ?? "development",
          },
          user: localUser,
          profile,
        };
      }
    }
  }

  return null;
}

export function requireAuth(): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const repository = c.get("repository");
    const auth = await readAuthContext(c, repository);

    if (!auth) {
      return apiError(c, 401, "unauthorized", "Authentication is required.");
    }

    c.set("auth", auth);
    return next();
  };
}

export function requireCsrf(): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (c, next) => {
    const auth = c.get("auth");
    const csrfToken = c.req.header(CSRF_HEADER);

    if (!csrfToken && c.req.header("x-tuvu-client") === "mobile") {
      return next();
    }

    if (!csrfToken || csrfToken !== auth.session.csrfToken) {
      return apiError(c, 403, "csrf_failed", "A valid CSRF token is required.");
    }

    return next();
  };
}
