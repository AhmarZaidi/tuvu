import { externalApiEndpoints } from "@shared/constants";
import { cachedJson } from "./provider-cache-service";
import { providerTtls } from "./provider-ttls";
import { isProviderResult, numberOrString, stringValue } from "./normalizers";
import { providerAttributions, type ProviderResult } from "./types";

/**
 * TVmaze — Keyless television schedule and exact cross-reference lookup.
 * License: CC BY-SA
 */
export async function tvmazePing(env: Env): Promise<{ ok: boolean; message: string }> {
  const url = `${externalApiEndpoints.tvmazeApi}/shows/1`;
  const response = await fetch(url, { headers: { "User-Agent": "Tuvu/1.0 (https://tuvu.app)" } });
  if (response.ok) {
    return { ok: true, message: "TVmaze reachable (CC BY-SA)" };
  }
  return { ok: false, message: `TVmaze responded with HTTP ${response.status}` };
}

export async function tvmazeSearch(env: Env, query: string, limit = 8): Promise<ProviderResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const url = `${externalApiEndpoints.tvmazeApi}/search/shows?q=${encodeURIComponent(trimmed)}`;
  const data = await cachedJson<Array<{ show: Record<string, unknown> }>>(
    env,
    "tvmaze",
    `search:${trimmed.toLowerCase()}`,
    providerTtls.tmdbSearch ?? 3600,
    () => fetch(url, { headers: { "User-Agent": "Tuvu/1.0 (https://tuvu.app)" } })
  );

  return (data ?? [])
    .slice(0, limit)
    .map((item) => {
      const show = item.show;
      if (!show) return null;
      const id = numberOrString(show.id);
      const title = stringValue(show.name);
      if (!id || !title) return null;
      const premiered = stringValue(show.premiered);
      const year = premiered ? Number.parseInt(premiered.slice(0, 4), 10) : null;
      const image = show.image as { medium?: string; original?: string } | undefined;
      const posterPath = image?.medium ?? image?.original ?? null;

      const result: ProviderResult = {
        provider: "tvmaze",
        providerId: id,
        type: "show",
        title,
        overview: stringValue(show.summary)?.replace(/<[^>]+>/g, "") ?? null,
        posterPath,
        backdropPath: null,
        releaseDate: premiered,
        year: Number.isFinite(year) ? year : null,
        sourceUrl: stringValue(show.url) ?? `${externalApiEndpoints.tvmazeWeb}/shows/${id}`,
        rating: typeof show.rating === "object" && show.rating !== null && "average" in show.rating && typeof (show.rating as any).average === "number"
          ? (show.rating as any).average
          : null,
        popularity: null,
        attribution: providerAttributions.tvmaze,
      };
      return result;
    })
    .filter(isProviderResult);
}

export async function tvmazeLookup(env: Env, tvdbId: string): Promise<Record<string, unknown> | null> {
  const url = `${externalApiEndpoints.tvmazeApi}/lookup/shows?thetvdb=${encodeURIComponent(tvdbId)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Tuvu/1.0 (https://tuvu.app)" } });
    if (!res.ok) return null;
    return res.json() as Promise<Record<string, unknown>>;
  } catch {
    return null;
  }
}

/**
 * Wikidata — Keyless factual enrichment and cross-identifiers.
 * License: CC0 structured data
 */
export async function wikidataPing(env: Env): Promise<{ ok: boolean; message: string }> {
  const url = `${externalApiEndpoints.wikidataApi}/Q42.json`;
  const response = await fetch(url, { headers: { "User-Agent": "Tuvu/1.0 (https://tuvu.app; contact@tuvu.app)" } });
  if (response.ok) {
    return { ok: true, message: "Wikidata entity service reachable (CC0)" };
  }
  return { ok: false, message: `Wikidata responded with HTTP ${response.status}` };
}

export async function wikidataEntity(env: Env, qid: string): Promise<Record<string, unknown> | null> {
  const url = `${externalApiEndpoints.wikidataApi}/${encodeURIComponent(qid)}.json`;
  return cachedJson<Record<string, unknown>>(
    env,
    "wikidata",
    `entity:${qid}`,
    86400 * 7,
    () => fetch(url, { headers: { "User-Agent": "Tuvu/1.0 (https://tuvu.app; contact@tuvu.app)" } })
  );
}
