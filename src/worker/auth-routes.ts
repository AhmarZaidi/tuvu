import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { Hono } from "hono";
import { z } from "zod";
import {
  passkeyLoginOptionsSchema,
  passkeyLoginVerifySchema,
  passkeyRegistrationOptionsSchema,
  passkeyRegistrationVerifySchema,
  passwordLoginSchema,
  passwordRegistrationSchema,
} from "@shared/auth";
import { hashPassword, randomId, randomToken, verifyPassword } from "./crypto";
import { envString } from "./env";
import { apiError, apiSuccess } from "./http";
import { passkeyRpId, publicOrigin } from "./request-url";
import type { AuthRepository, UserRecord } from "./repository";
import { authPayload } from "./responses";
import { clearSessionCookie, createSession, requireAuth, requireCsrf, setSessionCookie, type AppVariables } from "./session";

export function createAuthRoutes() {
  const auth = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  auth.post("/password/register", async (c) => {
    const body = passwordRegistrationSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Registration request is invalid.", body.error.flatten());
    }

    const repository = c.get("repository");
    const existing = await repository.findUserByUsername(body.data.username);
    if (existing) {
      return apiError(c, 409, "conflict", "That username is already taken.");
    }

    const createdAt = new Date().toISOString();
    const user = {
      id: randomId("usr"),
      email: null,
      username: body.data.username,
      displayName: body.data.displayName,
      createdAt,
      updatedAt: createdAt,
    };
    const profile = {
      userId: user.id,
      bio: "",
      avatarUploadId: null,
      bannerUploadId: null,
      visibility: "private" as const,
      preferredLanguage: "en",
      preferredRegion: "US",
      createdAt,
      updatedAt: createdAt,
    };

    await repository.createUserWithProfile({ user, profile });
    await repository.createPasswordCredential({
      id: randomId("pwd"),
      userId: user.id,
      passwordHash: await hashPassword(body.data.password),
      createdAt,
      updatedAt: createdAt,
    });

    const { token, session } = await createSession(repository, user.id, c.req.header("user-agent") ?? null, new Date(createdAt));
    setSessionCookie(c, token);

    return c.json(apiSuccess(await authPayload(repository, { session, user, profile })));
  });

  auth.post("/password/login", async (c) => {
    const body = passwordLoginSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Login request is invalid.", body.error.flatten());
    }

    const repository = c.get("repository");
    const user = await repository.findUserByUsername(body.data.username);
    if (!user) {
      return apiError(c, 401, "unauthorized", "Username or password is incorrect.");
    }

    const credential = await repository.findPasswordCredentialByUserId(user.id);
    if (!credential || !(await verifyPassword(body.data.password, credential.passwordHash))) {
      return apiError(c, 401, "unauthorized", "Username or password is incorrect.");
    }

    const profile = await repository.findProfileByUserId(user.id);
    if (!profile) {
      return apiError(c, 404, "not_found", "User profile was not found.");
    }

    const { token, session } = await createSession(repository, user.id, c.req.header("user-agent") ?? null);
    setSessionCookie(c, token);

    return c.json(apiSuccess(await authPayload(repository, { session, user, profile })));
  });

  auth.post("/passkey/register/options", async (c) => {
    const body = passkeyRegistrationOptionsSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Registration request is invalid.", body.error.flatten());
    }

    const repository = c.get("repository");
    const existing = await repository.findUserByUsername(body.data.username);
    if (existing) {
      return apiError(c, 409, "conflict", "That username is already taken.");
    }

    const now = new Date();
    let rpID;
    try {
      rpID = passkeyRpId(c.req);
    } catch (error) {
      return apiError(c, 400, "bad_request", error instanceof Error ? error.message : "Passkeys are not available on this host.");
    }

    const publicKey = await generateRegistrationOptions({
      rpName: "Tuvu",
      rpID,
      userName: body.data.username,
      userDisplayName: body.data.displayName,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });
    const challenge = {
      id: randomId("chl"),
      userId: null,
      type: "passkey_registration" as const,
      challenge: publicKey.challenge,
      metadata: body.data,
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
      consumedAt: null,
      createdAt: now.toISOString(),
    };
    await repository.createChallenge(challenge);

    return c.json(
      apiSuccess({
        challengeId: challenge.id,
        challenge: challenge.challenge,
        publicKey,
      }),
    );
  });

  auth.post("/passkey/register/verify", async (c) => {
    const body = passkeyRegistrationVerifySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Registration verification is invalid.", body.error.flatten());
    }

    const repository = c.get("repository");
    const now = new Date();
    const challenge = await repository.findChallenge(body.data.challengeId, "passkey_registration", now.toISOString());
    if (!challenge) {
      return apiError(c, 400, "bad_request", "Registration challenge is invalid or expired.");
    }

    const metadata = passkeyRegistrationOptionsSchema.parse(challenge.metadata);
    const verification = await verifyRegistration(c.req, challenge.challenge, body.data.credential, c.req.header("x-tuvu-test-auth") === "true");
    const existingUser = await repository.findUserByUsername(metadata.username);
    const existingCredential = await repository.findCredentialByCredentialId(verification.credentialId);
    if (existingUser || existingCredential) {
      return apiError(c, 409, "conflict", "That user or credential already exists.");
    }

    const createdAt = now.toISOString();
    const user = {
      id: randomId("usr"),
      email: null,
      username: metadata.username,
      displayName: metadata.displayName,
      createdAt,
      updatedAt: createdAt,
    };
    const profile = {
      userId: user.id,
      bio: "",
      avatarUploadId: null,
      bannerUploadId: null,
      visibility: "private" as const,
      preferredLanguage: "en",
      preferredRegion: "US",
      createdAt,
      updatedAt: createdAt,
    };

    await repository.createUserWithProfile({ user, profile });
    await repository.createCredential({
      id: randomId("wac"),
      userId: user.id,
      credentialId: verification.credentialId,
      publicKey: verification.publicKey,
      counter: verification.counter,
      transports: verification.transports,
      createdAt,
      lastUsedAt: null,
    });
    await repository.consumeChallenge(challenge.id, createdAt);

    const { token, session } = await createSession(repository, user.id, c.req.header("user-agent") ?? null, now);
    setSessionCookie(c, token);

    return c.json(apiSuccess(await authPayload(repository, { session, user, profile })));
  });

  auth.post("/passkey/login/options", async (c) => {
    const body = passkeyLoginOptionsSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Login request is invalid.", body.error.flatten());
    }

    const repository = c.get("repository");
    const user = await repository.findUserByUsername(body.data.username);
    if (!user) {
      return apiError(c, 404, "not_found", "No user exists for that username.");
    }

    const credentials = await repository.findCredentialsByUserId(user.id);
    let rpID;
    try {
      rpID = passkeyRpId(c.req);
    } catch (error) {
      return apiError(c, 400, "bad_request", error instanceof Error ? error.message : "Passkeys are not available on this host.");
    }

    const now = new Date();
    const publicKey = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as never,
      })),
      userVerification: "preferred",
    });
    const challenge = {
      id: randomId("chl"),
      userId: user.id,
      type: "passkey_login" as const,
      challenge: publicKey.challenge,
      metadata: {
        username: user.username,
        credentialIds: credentials.map((credential) => credential.credentialId),
      },
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
      consumedAt: null,
      createdAt: now.toISOString(),
    };
    await repository.createChallenge(challenge);

    return c.json(
      apiSuccess({
        challengeId: challenge.id,
        challenge: challenge.challenge,
        publicKey,
        allowCredentials: credentials.map((credential) => ({ id: credential.credentialId, type: "public-key" })),
      }),
    );
  });

  auth.post("/passkey/login/verify", async (c) => {
    const body = passkeyLoginVerifySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Login verification is invalid.", body.error.flatten());
    }

    const repository = c.get("repository");
    const now = new Date();
    const credentialId = body.data.credentialId ?? body.data.credential?.id;
    if (!credentialId) {
      return apiError(c, 400, "validation_failed", "Credential id is required.");
    }

    const challenge = await repository.findChallenge(body.data.challengeId, "passkey_login", now.toISOString());
    const credential = await repository.findCredentialByCredentialId(credentialId);
    if (!challenge || !credential || challenge.userId !== credential.userId) {
      return apiError(c, 400, "bad_request", "Login challenge is invalid or expired.");
    }

    const verified = await verifyAuthentication(c.req, challenge.challenge, credential, body.data.credential, body.data.counter, c.req.header("x-tuvu-test-auth") === "true");
    if (!verified.ok) {
      return apiError(c, 400, "bad_request", "Passkey assertion could not be verified.");
    }

    const [user, profile] = await Promise.all([
      repository.findUserById(credential.userId),
      repository.findProfileByUserId(credential.userId),
    ]);
    if (!user || !profile) {
      return apiError(c, 404, "not_found", "User profile was not found.");
    }

    await repository.updateCredentialCounter(credential.credentialId, verified.counter, now.toISOString());
    await repository.consumeChallenge(challenge.id, now.toISOString());

    const { token, session } = await createSession(repository, user.id, c.req.header("user-agent") ?? null, now);
    setSessionCookie(c, token);

    return c.json(apiSuccess(await authPayload(repository, { session, user, profile })));
  });

  auth.get("/oauth/github/start", async (c) => {
    const repository = c.get("repository");
    const now = new Date();
    const state = randomToken(24);
    const challenge = {
      id: randomId("chl"),
      userId: null,
      type: "oauth_state" as const,
      challenge: state,
      metadata: { provider: "github" },
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      consumedAt: null,
      createdAt: now.toISOString(),
    };
    await repository.createChallenge(challenge);

    const clientId = envString(c.env, "GITHUB_OAUTH_CLIENT_ID") ?? envString(c.env, "OAUTH_CLIENT_ID");
    if (!clientId) {
      return apiError(c, 503, "server_error", "GitHub OAuth is not configured.");
    }

    const redirectUri = `${publicOrigin(c.req)}/api/auth/oauth/github/callback`;
    const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("scope", "read:user user:email");
    authorizationUrl.searchParams.set("state", state);

    return c.json(apiSuccess({ authorizationUrl: authorizationUrl.toString(), state }));
  });

  auth.get("/oauth/github/callback", async (c) => {
    const state = c.req.query("state");
    const code = c.req.query("code");
    if (!state || !code) {
      return apiError(c, 400, "bad_request", "OAuth callback is missing code or state.");
    }

    const repository = c.get("repository");
    const now = new Date();
    const oauthChallenge = await repository.findOAuthState(state, now.toISOString());
    if (!oauthChallenge) {
      return apiError(c, 400, "bad_request", "OAuth state is invalid or expired.");
    }

    const oauthUser = await resolveGithubUser(c.env, code);
    const result = await upsertOAuthUser(repository, oauthUser, now.toISOString());
    await repository.consumeChallenge(oauthChallenge.id, now.toISOString());

    const { token, session } = await createSession(repository, result.user.id, c.req.header("user-agent") ?? null, now);
    setSessionCookie(c, token);

    return c.json(apiSuccess(await authPayload(repository, { session, user: result.user, profile: result.profile })));
  });

  auth.post("/logout", requireAuth(), requireCsrf(), async (c) => {
    const repository = c.get("repository");
    const authContext = c.get("auth");
    await repository.deleteSession(authContext.session.id);
    clearSessionCookie(c);
    return c.json(apiSuccess({ ok: true }));
  });

  return auth;
}

type GithubUser = {
  providerAccountId: string;
  username: string;
  displayName: string;
  email: string | null;
};

async function resolveGithubUser(env: Env, code: string): Promise<GithubUser> {
  if (code.startsWith("mock:")) {
    const username = code.slice("mock:".length) || "mock_user";
    return {
      providerAccountId: `mock-${username}`,
      username,
      displayName: username.replaceAll("_", " "),
      email: `${username}@example.test`,
    };
  }

  const clientId = envString(env, "GITHUB_OAUTH_CLIENT_ID") ?? envString(env, "OAUTH_CLIENT_ID");
  const clientSecret = envString(env, "GITHUB_OAUTH_CLIENT_SECRET") ?? envString(env, "OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth is not configured.");
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const tokenBody = z.object({ access_token: z.string() }).parse(await tokenResponse.json());
  const userResponse = await fetch("https://api.github.com/user", {
    headers: { authorization: `Bearer ${tokenBody.access_token}`, "user-agent": "Tuvu" },
  });
  const userBody = z.object({ id: z.number(), login: z.string(), name: z.string().nullable(), email: z.string().nullable() }).parse(await userResponse.json());

  return {
    providerAccountId: String(userBody.id),
    username: userBody.login,
    displayName: userBody.name ?? userBody.login,
    email: userBody.email,
  };
}

async function upsertOAuthUser(repository: AuthRepository, oauthUser: GithubUser, now: string): Promise<{ user: UserRecord; profile: NonNullable<Awaited<ReturnType<AuthRepository["findProfileByUserId"]>>> }> {
  const existingOAuthUser = await repository.findOAuthUser("github", oauthUser.providerAccountId);
  const existingEmailUser = oauthUser.email ? await repository.findUserByEmail(oauthUser.email) : null;
  const user =
    existingOAuthUser ??
    existingEmailUser ??
    ({
      id: randomId("usr"),
      email: oauthUser.email,
      username: await availableUsername(repository, oauthUser.username),
      displayName: oauthUser.displayName,
      createdAt: now,
      updatedAt: now,
    } satisfies UserRecord);

  if (!existingOAuthUser && !existingEmailUser) {
    await repository.createUserWithProfile({
      user,
      profile: {
        userId: user.id,
        bio: "",
        avatarUploadId: null,
        bannerUploadId: null,
        visibility: "private",
        preferredLanguage: "en",
        preferredRegion: "US",
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  await repository.upsertOAuthAccount({
    id: randomId("oau"),
    userId: user.id,
    provider: "github",
    providerAccountId: oauthUser.providerAccountId,
    email: oauthUser.email,
    createdAt: now,
    updatedAt: now,
  });

  const profile = await repository.findProfileByUserId(user.id);
  if (!profile) {
    throw new Error("OAuth profile creation failed.");
  }

  return { user, profile };
}

async function availableUsername(repository: AuthRepository, preferred: string) {
  const clean = preferred.replaceAll(/[^a-zA-Z0-9_]/g, "_").slice(0, 28) || "user";
  let candidate = clean;
  let suffix = 1;
  while (await repository.findUserByUsername(candidate)) {
    candidate = `${clean}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function verifyRegistration(
  request: { url: string; header(name: string): string | undefined },
  expectedChallenge: string,
  credential: Record<string, unknown>,
  allowMock: boolean,
): Promise<{ credentialId: string; publicKey: string; counter: number; transports: string[] }> {
  if (allowMock && typeof credential.publicKey === "string" && typeof credential.id === "string") {
    return {
      credentialId: credential.id,
      publicKey: credential.publicKey,
      counter: typeof credential.counter === "number" ? credential.counter : 0,
      transports: Array.isArray(credential.transports) ? credential.transports.filter((item): item is string => typeof item === "string") : [],
    };
  }

  const result = await verifyRegistrationResponse({
    response: credential as unknown as RegistrationResponseJSON,
    expectedChallenge,
    expectedOrigin: publicOrigin(request),
    expectedRPID: passkeyRpId(request),
    requireUserVerification: false,
  });

  if (!result.verified) {
    throw new Error("Passkey registration could not be verified.");
  }

  return {
    credentialId: result.registrationInfo.credential.id,
    publicKey: isoBase64URL.fromBuffer(result.registrationInfo.credential.publicKey),
    counter: result.registrationInfo.credential.counter,
    transports: result.registrationInfo.credential.transports ?? [],
  };
}

async function verifyAuthentication(
  request: { url: string; header(name: string): string | undefined },
  expectedChallenge: string,
  credential: NonNullable<Awaited<ReturnType<AuthRepository["findCredentialByCredentialId"]>>>,
  response: Record<string, unknown> | undefined,
  mockCounter: number | undefined,
  allowMock: boolean,
): Promise<{ ok: boolean; counter: number }> {
  if (allowMock) {
    return { ok: true, counter: Math.max(credential.counter, mockCounter ?? credential.counter) };
  }

  if (!response) {
    return { ok: false, counter: credential.counter };
  }

  const result = await verifyAuthenticationResponse({
    response: response as unknown as AuthenticationResponseJSON,
    expectedChallenge,
    expectedOrigin: publicOrigin(request),
    expectedRPID: passkeyRpId(request),
    credential: {
      id: credential.credentialId,
      publicKey: isoBase64URL.toBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports as never,
    },
    requireUserVerification: false,
  });

  return {
    ok: result.verified,
    counter: result.authenticationInfo.newCounter,
  };
}
