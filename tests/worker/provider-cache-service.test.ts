import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedJson, ProviderRateLimitError } from "@worker/providers/provider-cache-service";

describe("provider cache service", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a fresh cached response without fetching", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({
            response_json: JSON.stringify({ ok: true }),
            status: 200,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          }),
        }),
      }),
    } as unknown as D1Database;
    const fetcher = vi.fn();

    await expect(cachedJson({ DB: db } as Env, "tmdb", "search:test", 60, fetcher)).resolves.toEqual({ ok: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("turns provider 429 responses into retry-aware errors", async () => {
    await expect(cachedJson({} as Env, "jikan", "search:test", 60, () => Promise.resolve(new Response("{}", { status: 429, headers: { "retry-after": "3" } }))))
      .rejects.toMatchObject({ name: "ProviderRateLimitError", provider: "jikan", retryAfter: "3" } satisfies Partial<ProviderRateLimitError>);
  });
});
