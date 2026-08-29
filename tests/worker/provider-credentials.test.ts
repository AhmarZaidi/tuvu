import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredProviderCredentialKeys, hasAppFallback, hasRequiredProviderCredentials, providerConfigurationSource, recordProviderValidation } from "@worker/providers/provider-credentials";
import { pingProvider } from "@worker/providers/ping";

describe("provider credential configuration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports a configured app fallback and selects it when no personal key is active", () => {
    const env = { TMDB_API_KEY: "worker-fallback-key" } as Env;
    const fallback = hasAppFallback(env, "tmdb");

    expect(fallback).toMatchObject({ configured: true, message: "Set in server environment" });
    expect(providerConfigurationSource({ keyless: false, personalStatus: "not_configured", appFallbackConfigured: fallback.configured })).toBe("app");
  });

  it("never labels an unconfigured keyed provider as configured", () => {
    expect(providerConfigurationSource({ keyless: false, personalStatus: "not_configured", appFallbackConfigured: false })).toBe("none");
  });

  it("does not treat an incomplete multi-part personal credential as configured", () => {
    const secrets = JSON.stringify({ TWITCH_IGDB_CLIENT_ID: "client-id" });

    expect(hasRequiredProviderCredentials("igdb", secrets)).toBe(false);
    expect(providerConfigurationSource({
      keyless: false,
      personalStatus: "active",
      personalCredentialsConfigured: false,
      appFallbackConfigured: false,
    })).toBe("none");
  });

  it("only exposes the names of configured credential fields", () => {
    expect(configuredProviderCredentialKeys(JSON.stringify({ TMDB_API_KEY: "saved-key", UNUSED: "" }))).toEqual(["TMDB_API_KEY"]);
  });

  it("records a failed personal-credential probe without disabling the credential", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });

    await recordProviderValidation({ DB: { prepare } } as unknown as Env, "user_1", "tmdb", "invalid", false);

    expect(prepare).toHaveBeenCalledWith(expect.stringContaining("last_test_status"));
    expect(bind).toHaveBeenCalledWith(expect.any(String), "invalid", 0, expect.any(String), expect.any(String), "user_1", "tmdb");
    expect(run).toHaveBeenCalledOnce();
  });

  it("uses TheTVDB's key-login request instead of treating the project key as a bearer token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { token: "session-token" } }), { status: 200 }));

    const result = await pingProvider({ THETVDB_API_KEY: "project-key", THETVDB_USER_PIN: "subscriber-pin" } as unknown as Env, "thetvdb", null);

    expect(result).toMatchObject({ ok: true, status: "healthy" });
    expect(fetchMock).toHaveBeenCalledWith("https://api4.thetvdb.com/v4/login", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ apikey: "project-key", pin: "subscriber-pin" }),
    }));
  });
});
