import { describe, expect, it } from "vitest";
import { createApp } from "@worker/app";
import { MemoryAuthRepository, testEnv } from "./memory-repository";

function makeApp(repository: MemoryAuthRepository) {
  return createApp({ createRepository: () => repository });
}


function cookieFrom(response: Response) {
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toBeTruthy();
  return cookie?.split(";")[0] ?? "";
}

async function register(repository: MemoryAuthRepository, username = "ahmar") {
  const app = makeApp(repository);
  const optionsResponse = await app.request(
    "/api/auth/passkey/register/options",
    {
      method: "POST",
      body: JSON.stringify({ username, displayName: "Ahmar Zaidi" }),
      headers: { "content-type": "application/json" },
    },
    testEnv(),
  );
  const options = await optionsResponse.json() as { data: { challengeId: string } };
  const verifyResponse = await app.request(
    "/api/auth/passkey/register/verify",
    {
      method: "POST",
      body: JSON.stringify({
        challengeId: options.data.challengeId,
        credential: { id: `cred-${username}`, publicKey: "mock-public-key", counter: 1 },
      }),
      headers: { "content-type": "application/json", "x-tuvu-test-auth": "true" },
    },
    testEnv(),
  );
  const body = await verifyResponse.json() as { data: { csrfToken: string } };
  return { app, cookie: cookieFrom(verifyResponse), csrfToken: body.data.csrfToken };
}

describe("auth and profile integration routes", () => {
  it("protects /api/me without a session", async () => {
    const response = await makeApp(new MemoryAuthRepository()).request("/api/me", {}, testEnv());

    expect(response.status).toBe(401);
  });

  it("registers and logs in with a password across sessions", async () => {
    const repository = new MemoryAuthRepository();
    const app = makeApp(repository);
    const registerResponse = await app.request(
      "/api/auth/password/register",
      {
        method: "POST",
        body: JSON.stringify({ username: "portable_user", displayName: "Portable User", password: "correct-horse-42" }),
        headers: { "content-type": "application/json" },
      },
      testEnv(),
    );
    expect(registerResponse.status).toBe(200);
    expect(registerResponse.headers.get("set-cookie")).toContain("tuvu_session=");

    const loginResponse = await app.request(
      "/api/auth/password/login",
      {
        method: "POST",
        body: JSON.stringify({ username: "portable_user", password: "correct-horse-42" }),
        headers: { "content-type": "application/json" },
      },
      testEnv(),
    );
    const body = await loginResponse.json() as { data: { user: { username: string } } };

    expect(loginResponse.status).toBe(200);
    expect(body.data.user.username).toBe("portable_user");
    expect(loginResponse.headers.get("set-cookie")).toContain("tuvu_session=");
  });

  it("rejects incorrect password login without revealing which field failed", async () => {
    const repository = new MemoryAuthRepository();
    const app = makeApp(repository);
    await app.request(
      "/api/auth/password/register",
      {
        method: "POST",
        body: JSON.stringify({ username: "wrong_password_user", displayName: "Wrong Password User", password: "correct-horse-42" }),
        headers: { "content-type": "application/json" },
      },
      testEnv(),
    );

    const response = await app.request(
      "/api/auth/password/login",
      {
        method: "POST",
        body: JSON.stringify({ username: "wrong_password_user", password: "incorrect-password" }),
        headers: { "content-type": "application/json" },
      },
      testEnv(),
    );
    const body = await response.json() as { error: { message: string } };

    expect(response.status).toBe(401);
    expect(body.error.message).toBe("Username or password is incorrect.");
  });

  it("registers with a mocked passkey and keeps the user logged in", async () => {
    const repository = new MemoryAuthRepository();
    const { app, cookie } = await register(repository);

    const me = await app.request("/api/me", { headers: { cookie } }, testEnv());
    const body = await me.json() as { data: { user: { username: string } } };

    expect(me.status).toBe(200);
    expect(body.data.user.username).toBe("ahmar");
  });

  it("returns JSON when passkeys are requested from an IP address", async () => {
    const response = await makeApp(new MemoryAuthRepository()).request(
      "http://127.0.0.1:8787/api/auth/passkey/register/options",
      {
        method: "POST",
        body: JSON.stringify({ username: "ip_user", displayName: "IP User" }),
        headers: { "content-type": "application/json" },
      },
      testEnv(),
    );
    const body = await response.json() as { error: { message: string } };

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.error.message).toContain("Passkeys cannot be used from an IP address");
  });

  it("uses forwarded ngrok host and protocol for passkey options and OAuth redirects", async () => {
    const repository = new MemoryAuthRepository();
    const app = makeApp(repository);
    const headers = {
      "content-type": "application/json",
      "x-forwarded-host": "489b-45-118-158-183.ngrok-free.app",
      "x-forwarded-proto": "https",
    };

    const optionsResponse = await app.request(
      "http://127.0.0.1:8787/api/auth/passkey/register/options",
      {
        method: "POST",
        body: JSON.stringify({ username: "ngrok_user", displayName: "Ngrok User" }),
        headers,
      },
      testEnv(),
    );
    const options = await optionsResponse.json() as { data: { publicKey: { rp: { id: string } } } };

    expect(optionsResponse.status).toBe(200);
    expect(options.data.publicKey.rp.id).toBe("489b-45-118-158-183.ngrok-free.app");

    const oauthStart = await app.request(
      "http://127.0.0.1:8787/api/auth/oauth/github/start",
      { headers },
      { ...testEnv(), GITHUB_OAUTH_CLIENT_ID: "github-client-id" } as Env,
    );
    const oauthBody = await oauthStart.json() as { data: { authorizationUrl: string } };

    expect(new URL(oauthBody.data.authorizationUrl).searchParams.get("redirect_uri")).toBe(
      "https://489b-45-118-158-183.ngrok-free.app/api/auth/oauth/github/callback",
    );
  });

  it("logs in with a mocked passkey credential", async () => {
    const repository = new MemoryAuthRepository();
    const { app } = await register(repository, "login_user");
    const optionsResponse = await app.request(
      "/api/auth/passkey/login/options",
      {
        method: "POST",
        body: JSON.stringify({ username: "login_user" }),
        headers: { "content-type": "application/json" },
      },
      testEnv(),
    );
    const options = await optionsResponse.json() as { data: { challengeId: string } };
    const verifyResponse = await app.request(
      "/api/auth/passkey/login/verify",
      {
        method: "POST",
        body: JSON.stringify({ challengeId: options.data.challengeId, credentialId: "cred-login_user", counter: 2 }),
        headers: { "content-type": "application/json", "x-tuvu-test-auth": "true" },
      },
      testEnv(),
    );

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.headers.get("set-cookie")).toContain("tuvu_session=");
  });

  it("handles mocked GitHub OAuth callback", async () => {
    const repository = new MemoryAuthRepository();
    const app = makeApp(repository);
    const start = await app.request(
      "/api/auth/oauth/github/start",
      {},
      { ...testEnv(), GITHUB_OAUTH_CLIENT_ID: "github-client-id" } as Env,
    );
    const startBody = await start.json() as { data: { state: string } };
    const callback = await app.request(`/api/auth/oauth/github/callback?code=mock:jane_dev&state=${startBody.data.state}`, {}, testEnv());
    const body = await callback.json() as { data: { user: { username: string } } };

    expect(callback.status).toBe(200);
    expect(body.data.user.username).toBe("jane_dev");
  });

  it("requires CSRF for profile updates and validates profile input", async () => {
    const repository = new MemoryAuthRepository();
    const { app, cookie, csrfToken } = await register(repository);

    const forbidden = await app.request(
      "/api/me/profile",
      {
        method: "PATCH",
        body: JSON.stringify({ bio: "No token" }),
        headers: { cookie, "content-type": "application/json" },
      },
      testEnv(),
    );
    expect(forbidden.status).toBe(403);

    const invalid = await app.request(
      "/api/me/profile",
      {
        method: "PATCH",
        body: JSON.stringify({ username: "no spaces allowed" }),
        headers: { cookie, "content-type": "application/json", "x-csrf-token": csrfToken },
      },
      testEnv(),
    );
    expect(invalid.status).toBe(400);

    const updated = await app.request(
      "/api/me/profile",
      {
        method: "PATCH",
        body: JSON.stringify({ bio: "Watching everything.", visibility: "public" }),
        headers: { cookie, "content-type": "application/json", "x-csrf-token": csrfToken },
      },
      testEnv(),
    );
    const body = await updated.json() as { data: { profile: { bio: string; visibility: string } } };

    expect(updated.status).toBe(200);
    expect(body.data.profile).toMatchObject({ bio: "Watching everything.", visibility: "public" });
  });

  it("rejects invalid profile upload file types and oversized images", async () => {
    const repository = new MemoryAuthRepository();
    const { app, cookie, csrfToken } = await register(repository);

    const invalidForm = new FormData();
    invalidForm.set("kind", "avatar");
    invalidForm.set("file", new File(["not image"], "avatar.txt", { type: "text/plain" }));
    const invalid = await app.request(
      "/api/uploads/profile",
      { method: "POST", body: invalidForm, headers: { cookie, "x-csrf-token": csrfToken } },
      testEnv(),
    );
    expect(invalid.status).toBe(400);

    const oversizedForm = new FormData();
    oversizedForm.set("kind", "avatar");
    oversizedForm.set("file", new File([new Uint8Array(2 * 1024 * 1024 + 1)], "avatar.png", { type: "image/png" }));
    const oversized = await app.request(
      "/api/uploads/profile",
      { method: "POST", body: oversizedForm, headers: { cookie, "x-csrf-token": csrfToken } },
      testEnv(),
    );
    expect(oversized.status).toBe(400);
  });

  it("returns avatar URLs after the profile has an attached upload", async () => {
    const repository = new MemoryAuthRepository();
    const app = makeApp(repository);
    const passwordResponse = await app.request(
      "/api/auth/password/register",
      {
        method: "POST",
        body: JSON.stringify({ username: "media_user", displayName: "Media User", password: "correct-horse-42" }),
        headers: { "content-type": "application/json" },
      },
      testEnv(),
    );
    const passwordBody = await passwordResponse.json() as { data: { user: { id: string }; csrfToken: string } };
    const cookie = cookieFrom(passwordResponse);
    await repository.createUpload({
      id: "upl_avatar",
      userId: passwordBody.data.user.id,
      bucket: "tuvu-avatars",
      objectPath: `avatars/${passwordBody.data.user.id}/image.png`,
      publicUrl: `https://cdn.example.test/avatars/${passwordBody.data.user.id}/image.png`,
      contentType: "image/png",
      byteSize: 10,
      kind: "avatar",
      status: "uploaded",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await repository.attachUpload(passwordBody.data.user.id, "upl_avatar", "avatar", new Date().toISOString());

    const me = await app.request("/api/me", { headers: { cookie } }, testEnv());
    const body = await me.json() as { data: { profile: { avatarUrl: string | null } } };

    expect(body.data.profile.avatarUrl).toMatch(/^https:\/\/cdn\.example\.test\/avatars\/usr_/);
  });

});
