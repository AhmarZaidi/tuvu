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
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    return null;
  }

  const session = await repository.findSessionByTokenHash(await sha256Hex(token), now.toISOString());
  if (!session) {
    return null;
  }

  const [user, profile] = await Promise.all([
    repository.findUserById(session.userId),
    repository.findProfileByUserId(session.userId),
  ]);

  if (!user || !profile) {
    return null;
  }

  await repository.touchSession(session.id, now.toISOString());

  return { session, user, profile };
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

    if (!csrfToken || csrfToken !== auth.session.csrfToken) {
      return apiError(c, 403, "csrf_failed", "A valid CSRF token is required.");
    }

    return next();
  };
}
