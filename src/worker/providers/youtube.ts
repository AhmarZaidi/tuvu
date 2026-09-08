import { externalApiEndpoints } from "@shared/constants";
import { providerCredential } from "./provider-credentials";
import type { ProviderResult } from "./types";

export async function youtubePing(env: Env, userId?: string | null): Promise<{ ok: boolean; message: string }> {
  const key = await providerCredential(env, { userId, provider: "youtube", key: "YOUTUBE_API_KEY" });
  if (!key) {
    return { ok: false, message: "No YouTube API key configured." };
  }
  const url = `${externalApiEndpoints.youtubeApi}/videos?id=Ks-_Mh1QhMc&part=id&key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      return { ok: true, message: "YouTube Data API connected successfully." };
    }
    if (res.status === 400 || res.status === 403) {
      return { ok: false, message: `Invalid YouTube API key (HTTP ${res.status}).` };
    }
    return { ok: false, message: `YouTube returned HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach YouTube API." };
  }
}

export async function youtubeSearch(_env: Env, _query: string, _limit: number, _userId?: string | null): Promise<ProviderResult[]> {
  return [];
}
