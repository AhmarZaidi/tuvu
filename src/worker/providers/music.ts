import { externalApiEndpoints } from "@shared/constants";
import { providerCredential } from "./provider-credentials";
import { cachedJson } from "./provider-cache-service";

const MUSICBRAINZ_HEADERS = {
  "User-Agent": "Tuvu/1.0 (https://tuvu.app; contact@tuvu.app)",
  "Accept": "application/json",
};

/**
 * MusicBrainz — Open music encyclopedia (Artists, Release Groups, Releases, Recordings).
 */
export async function musicBrainzPing(env: Env): Promise<{ ok: boolean; message: string }> {
  const url = `${externalApiEndpoints.musicBrainzApi}/artist/5b11f4ce-a62d-471e-81fc-a69a8278c7da?fmt=json`;
  try {
    const res = await fetch(url, { headers: MUSICBRAINZ_HEADERS });
    if (res.ok) {
      return { ok: true, message: "MusicBrainz API reachable (CC0 open database)." };
    }
    return { ok: false, message: `MusicBrainz responded with HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach MusicBrainz." };
  }
}

export async function musicBrainzSearch(env: Env, query: string, limit = 8): Promise<any[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const url = `${externalApiEndpoints.musicBrainzApi}/release-group?query=${encodeURIComponent(trimmed)}&limit=${limit}&fmt=json`;
  const data = await cachedJson<{ "release-groups"?: any[] }>(
    env,
    "musicbrainz",
    `search:${trimmed.toLowerCase()}`,
    86400,
    () => fetch(url, { headers: MUSICBRAINZ_HEADERS })
  );
  return data?.["release-groups"] ?? [];
}

/**
 * Cover Art Archive — Artwork for MusicBrainz release groups and releases.
 */
export async function coverArtArchivePing(env: Env): Promise<{ ok: boolean; message: string }> {
  const url = `${externalApiEndpoints.coverArtArchiveApi}/release/76df3287-6cda-33eb-8e9a-044b5e15ffdd`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Tuvu/1.0 (https://tuvu.app)" } });
    if (res.ok || res.status === 307 || res.status === 302) {
      return { ok: true, message: "Cover Art Archive service reachable." };
    }
    return { ok: false, message: `Cover Art Archive responded with HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach Cover Art Archive." };
  }
}

export async function coverArtArchiveRelease(env: Env, mbid: string): Promise<any | null> {
  const url = `${externalApiEndpoints.coverArtArchiveApi}/release/${encodeURIComponent(mbid)}`;
  return cachedJson<any>(
    env,
    "coverartarchive",
    `release:${mbid}`,
    86400 * 7,
    () => fetch(url, { headers: { "User-Agent": "Tuvu/1.0 (https://tuvu.app)" } })
  );
}

/**
 * ListenBrainz — Scrobbles and listening history.
 */
export async function listenBrainzPing(env: Env, userId?: string | null): Promise<{ ok: boolean; message: string }> {
  const token = await providerCredential(env, { userId, provider: "listenbrainz", key: "LISTENBRAINZ_TOKEN" });
  const url = `${externalApiEndpoints.listenBrainzApi}/core/services/version`;
  try {
    const headers: Record<string, string> = { "User-Agent": "Tuvu/1.0 (https://tuvu.app)" };
    if (token) headers["Authorization"] = `Token ${token}`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      return { ok: true, message: `ListenBrainz service online.${token ? " User token attached." : ""}` };
    }
    return { ok: false, message: `ListenBrainz responded with HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach ListenBrainz." };
  }
}

/**
 * TheAudioDB — Community music biographies, album reviews, discography.
 */
export async function theAudioDbPing(env: Env, userId?: string | null): Promise<{ ok: boolean; message: string }> {
  const key = (await providerCredential(env, { userId, provider: "theaudiodb", key: "THEAUDIODB_API_KEY" })) || "2";
  const url = `${externalApiEndpoints.theAudioDbApi}/${encodeURIComponent(key)}/search.php?s=coldplay`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      return { ok: true, message: `TheAudioDB reachable.${key === "2" ? " Using public test key." : " Personal API key active."}` };
    }
    return { ok: false, message: `TheAudioDB responded with HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach TheAudioDB." };
  }
}

export async function theAudioDbSearch(env: Env, artist: string, userId?: string | null): Promise<any | null> {
  const key = (await providerCredential(env, { userId, provider: "theaudiodb", key: "THEAUDIODB_API_KEY" })) || "2";
  const url = `${externalApiEndpoints.theAudioDbApi}/${encodeURIComponent(key)}/search.php?s=${encodeURIComponent(artist.trim())}`;
  return cachedJson<any>(
    env,
    "theaudiodb",
    `artist:${artist.toLowerCase().trim()}`,
    86400,
    () => fetch(url)
  );
}

/**
 * LRCLIB — Keyless synchronized lyrics on-demand (client-cached, not stored).
 */
export async function lrclibPing(env: Env): Promise<{ ok: boolean; message: string }> {
  const url = `${externalApiEndpoints.lrclibApi}/get?track_name=Yellow&artist_name=Coldplay&duration=269`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Tuvu/1.0 (https://tuvu.app)" } });
    if (res.ok) {
      return { ok: true, message: "LRCLIB lyrics service online (keyless)." };
    }
    return { ok: false, message: `LRCLIB responded with HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach LRCLIB." };
  }
}

export async function lrclibGetLyrics(
  env: Env,
  trackName: string,
  artistName: string,
  albumName?: string,
  duration?: number
): Promise<{ plainLyrics?: string; syncedLyrics?: string } | null> {
  const params = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName,
  });
  if (albumName) params.set("album_name", albumName);
  if (duration) params.set("duration", String(duration));
  const url = `${externalApiEndpoints.lrclibApi}/get?${params.toString()}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Tuvu/1.0 (https://tuvu.app)" } });
    if (!res.ok) return null;
    return res.json() as Promise<{ plainLyrics?: string; syncedLyrics?: string }>;
  } catch {
    return null;
  }
}
