import { externalApiEndpoints } from "@shared/constants";
import { providerCredential } from "./provider-credentials";
import { cachedJson } from "./provider-cache-service";
import { providerTtls } from "./provider-ttls";
import { arrayNames, isProviderResult, normalizeDate, numberOrString, numberValue, stringValue, yearFromDate } from "./normalizers";
import { providerAttributions, type ProviderResult } from "./types";

export async function jikanPing(env: Env, userId?: string | null): Promise<{ ok: boolean; message: string }> {
  const endpoint = await jikanEndpoint(env, userId);
  const url = `${endpoint.replace(/\/+$/, "")}/top/anime?limit=1`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      return { ok: true, message: "Jikan (MyAnimeList) API online." };
    }
    return { ok: false, message: `Jikan returned HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach Jikan endpoint." };
  }
}

export async function jikanSearchProvider(env: Env, query: string, limit: number, userId?: string | null): Promise<ProviderResult[]> {
  const results = await jikanSearchAnime(env, query, limit, userId);
  return results.map(normalizeJikanAnime).filter(isProviderResult);
}

export async function jikanSearchAnime(env: Env, query: string, limit: number = 5, userId?: string | null) {
  const endpoint = await jikanEndpoint(env, userId);
  const data = await cachedJson<{ data?: any[] }>(env, "jikan", `search:${query.toLowerCase()}`, providerTtls.jikanSearch, () => fetch(`${endpoint}anime?q=${encodeURIComponent(query)}&limit=${limit}`));
  return data?.data ?? [];
}

export async function jikanAnimeCharacters(env: Env, malId: number, userId?: string | null) {
  const endpoint = await jikanEndpoint(env, userId);
  const data = await cachedJson<{ data?: any[] }>(env, "jikan", `characters:${malId}`, providerTtls.jikanCharacters, () => fetch(`${endpoint}anime/${malId}/characters`));
  return data?.data ?? [];
}

export async function jikanAnimeEpisodes(env: Env, malId: number, userId?: string | null) {
  const endpoint = await jikanEndpoint(env, userId);
  const data = await cachedJson<{ data?: any[] }>(env, "jikan", `episodes:${malId}`, providerTtls.jikanEpisodes, () => fetch(`${endpoint}anime/${malId}/episodes`));
  return data?.data ?? [];
}

async function jikanEndpoint(env: Env, userId?: string | null) {
  const configured = await providerCredential(env, { userId, provider: "jikan", key: "MAL_JIKAN_API_ENDPOINT" });
  return configured || `${externalApiEndpoints.jikanApi}/`;
}

function normalizeJikanAnime(item: unknown): ProviderResult | null {
  const record = item as Record<string, any>;
  const id = numberOrString(record.mal_id);
  const title = stringValue(record.title_english) ?? stringValue(record.title) ?? stringValue(record.title_japanese);
  if (!id || !title) return null;
  const releaseDate = normalizeDate(stringValue(record.aired?.from));
  const image = stringValue(record.images?.jpg?.large_image_url) ?? stringValue(record.images?.jpg?.image_url);
  const genres = [...arrayNames(record.genres), ...arrayNames(record.themes), ...arrayNames(record.demographics)].map((name) => ({ name }));
  return {
    provider: "jikan",
    providerId: id,
    type: "anime",
    title,
    overview: stringValue(record.synopsis),
    posterPath: image,
    backdropPath: image,
    releaseDate,
    year: yearFromDate(releaseDate) ?? numberValue(record.year),
    sourceUrl: stringValue(record.url),
    rating: numberValue(record.score),
    popularity: numberValue(record.popularity),
    attribution: providerAttributions.jikan,
    extendedDataJson: JSON.stringify({ category: "anime", anime: { originalLanguage: "Japanese", studios: arrayNames(record.studios).map((name) => ({ name })), malRating: numberValue(record.score), status: stringValue(record.status) }, genres }),
  };
}
