import { externalApiEndpoints } from "@shared/constants";
import { providerCredential } from "./provider-credentials";
import { cachedJson } from "./provider-cache-service";

/**
 * OpenSubtitles — Subtitle availability metadata (metadata only, no file storage).
 */
export async function openSubtitlesPing(env: Env, userId?: string | null): Promise<{ ok: boolean; message: string }> {
  const key = await providerCredential(env, { userId, provider: "opensubtitles", key: "OPENSUBTITLES_API_KEY" });
  if (!key) {
    return { ok: false, message: "No OpenSubtitles API key configured." };
  }
  const url = `${externalApiEndpoints.openSubtitlesApi}/infos/user`;
  try {
    const res = await fetch(url, {
      headers: {
        "Api-Key": key,
        "User-Agent": "Tuvu/1.0 (https://tuvu.app)",
      },
    });
    if (res.ok) {
      return { ok: true, message: "OpenSubtitles API connected successfully." };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Invalid OpenSubtitles API key (HTTP ${res.status}).` };
    }
    return { ok: false, message: `OpenSubtitles responded with HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach OpenSubtitles." };
  }
}

export async function openSubtitlesSearch(env: Env, query: string, userId?: string | null): Promise<any[]> {
  const key = await providerCredential(env, { userId, provider: "opensubtitles", key: "OPENSUBTITLES_API_KEY" });
  if (!key) return [];
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const url = `${externalApiEndpoints.openSubtitlesApi}/subtitles?query=${encodeURIComponent(trimmed)}`;
  const data = await cachedJson<{ data?: any[] }>(
    env,
    "opensubtitles",
    `search:${trimmed.toLowerCase()}`,
    86400,
    () => fetch(url, {
      headers: {
        "Api-Key": key,
        "User-Agent": "Tuvu/1.0 (https://tuvu.app)",
      },
    })
  );
  return data?.data ?? [];
}
