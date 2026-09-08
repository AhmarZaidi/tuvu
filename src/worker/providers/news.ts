import { externalApiEndpoints } from "@shared/constants";
import { providerCredential } from "./provider-credentials";
import { cachedJson } from "./provider-cache-service";

/**
 * GDELT — Global events and cross-lingual news article discovery (keyless).
 */
export async function gdeltPing(env: Env): Promise<{ ok: boolean; message: string }> {
  const url = `${externalApiEndpoints.gdeltApi}?query=test&mode=ArtList&format=json&maxrecords=1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Tuvu/1.0 (https://tuvu.app)" } });
    if (res.ok) {
      return { ok: true, message: "GDELT Project API reachable (keyless news discovery)." };
    }
    return { ok: false, message: `GDELT responded with HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach GDELT." };
  }
}

export async function gdeltSearch(env: Env, query: string, limit = 10): Promise<any[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const url = `${externalApiEndpoints.gdeltApi}?query=${encodeURIComponent(trimmed)}&mode=ArtList&format=json&maxrecords=${limit}&sort=HybridRel`;
  const data = await cachedJson<{ articles?: any[] }>(
    env,
    "gdelt",
    `search:${trimmed.toLowerCase()}`,
    3600 * 2,
    () => fetch(url, { headers: { "User-Agent": "Tuvu/1.0 (https://tuvu.app)" } })
  );
  return data?.articles ?? [];
}

/**
 * The Guardian Open Platform — Editorial news search.
 */
export async function guardianPing(env: Env, userId?: string | null): Promise<{ ok: boolean; message: string }> {
  const key = await providerCredential(env, { userId, provider: "guardian", key: "GUARDIAN_API_KEY" });
  if (!key) {
    return { ok: false, message: "No Guardian API key configured." };
  }
  const url = `${externalApiEndpoints.guardianApi}/search?page-size=1&api-key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      return { ok: true, message: "The Guardian Open Platform API connected." };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Invalid Guardian API key (HTTP ${res.status}).` };
    }
    return { ok: false, message: `Guardian responded with HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach Guardian API." };
  }
}

export async function guardianSearch(env: Env, query: string, limit = 10, userId?: string | null): Promise<any[]> {
  const key = await providerCredential(env, { userId, provider: "guardian", key: "GUARDIAN_API_KEY" });
  if (!key) return [];
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const url = `${externalApiEndpoints.guardianApi}/search?q=${encodeURIComponent(trimmed)}&page-size=${limit}&api-key=${encodeURIComponent(key)}`;
  const data = await cachedJson<{ response?: { results?: any[] } }>(
    env,
    "guardian",
    `search:${trimmed.toLowerCase()}`,
    3600 * 2,
    () => fetch(url)
  );
  return data?.response?.results ?? [];
}

/**
 * NewsAPI — Top headlines and global news sources.
 */
export async function newsApiPing(env: Env, userId?: string | null): Promise<{ ok: boolean; message: string }> {
  const key = await providerCredential(env, { userId, provider: "newsapi", key: "NEWSAPI_KEY" });
  if (!key) {
    return { ok: false, message: "No NewsAPI key configured." };
  }
  const url = `${externalApiEndpoints.newsApi}/top-headlines?country=us&pageSize=1&apiKey=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      return { ok: true, message: "NewsAPI connected successfully." };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Invalid NewsAPI key (HTTP ${res.status}).` };
    }
    return { ok: false, message: `NewsAPI responded with HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach NewsAPI." };
  }
}

export async function newsApiSearch(env: Env, query: string, limit = 10, userId?: string | null): Promise<any[]> {
  const key = await providerCredential(env, { userId, provider: "newsapi", key: "NEWSAPI_KEY" });
  if (!key) return [];
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const url = `${externalApiEndpoints.newsApi}/everything?q=${encodeURIComponent(trimmed)}&pageSize=${limit}&apiKey=${encodeURIComponent(key)}`;
  const data = await cachedJson<{ articles?: any[] }>(
    env,
    "newsapi",
    `search:${trimmed.toLowerCase()}`,
    3600 * 2,
    () => fetch(url)
  );
  return data?.articles ?? [];
}
