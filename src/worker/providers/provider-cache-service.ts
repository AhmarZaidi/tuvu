import { stableKey } from "./normalizers";

export class ProviderRateLimitError extends Error {
  constructor(public readonly provider: string, public readonly retryAfter: string | null) {
    super(`${provider} is rate limited${retryAfter ? `; retry after ${retryAfter}s` : ""}`);
    this.name = "ProviderRateLimitError";
  }
}

type CacheRow = {
  response_json: string;
  status: number;
  expires_at: string;
};

export async function cachedJson<T>(env: Env, provider: string, cacheKey: string, ttlSeconds: number, request: () => Promise<Response>): Promise<T | null> {
  if (env.DB) {
    try {
      const cached = await env.DB.prepare("SELECT response_json, http_status AS status, expires_at FROM provider_cache WHERE provider_code = ? AND cache_key = ?")
        .bind(provider, cacheKey)
        .first<CacheRow>();
      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        return JSON.parse(cached.response_json) as T;
      }
    } catch {
      try {
        const cached = await env.DB.prepare("SELECT response_json, status, expires_at FROM provider_cache WHERE provider = ? AND cache_key = ?")
          .bind(provider, cacheKey)
          .first<CacheRow>();
        if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
          return JSON.parse(cached.response_json) as T;
        }
      } catch {}
    }
  }

  const response = await request();
  const text = await response.text();
  if (response.status === 429) {
    throw new ProviderRateLimitError(provider, response.headers.get("retry-after"));
  }
  if (!response.ok) return null;

  const parsed = JSON.parse(text) as T;
  if (env.DB) {
    try {
      await writeProviderCache(env.DB, provider, cacheKey, parsed, response.status, ttlSeconds);
    } catch {}
  }
  return parsed;
}

export async function writeProviderCache(db: D1Database, provider: string, cacheKey: string, payload: unknown, status: number, ttlSeconds: number) {
  const now = new Date();
  const expires = new Date(now.getTime() + ttlSeconds * 1000);
  try {
    await db.prepare(`INSERT INTO provider_cache (id, provider_code, cache_key, response_json, http_status, fetched_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_code, cache_key) DO UPDATE SET response_json=excluded.response_json, http_status=excluded.http_status, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at`)
      .bind(`pc_${provider}_${stableKey(cacheKey)}`, provider, cacheKey, JSON.stringify(payload), status, now.toISOString(), expires.toISOString())
      .run();
  } catch {
    await db.prepare(`INSERT INTO provider_cache (id, provider, cache_key, response_json, status, fetched_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, cache_key) DO UPDATE SET response_json=excluded.response_json, status=excluded.status, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at`)
      .bind(`pc_${provider}_${stableKey(cacheKey)}`, provider, cacheKey, JSON.stringify(payload), status, now.toISOString(), expires.toISOString())
      .run();
  }
}
