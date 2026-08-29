import type { MediaType } from "@shared/media";
import { externalApiEndpoints } from "@shared/constants";
import { classifyMedia } from "@shared/media-classification";
import { providerCredential } from "./provider-credentials";
import { cachedJson } from "./provider-cache-service";
import { providerTtls } from "./provider-ttls";
import { isProviderResult, numberOrString, numberValue, stringValue, tmdbImage, yearFromDate } from "./normalizers";
import { providerAttributions, type ProviderResult } from "./types";
import { resilientTmdbFetch } from "./tmdb-anti-censorship";
import { envString } from "../env";

export async function tmdbPing(env: Env, userId?: string | null): Promise<{ ok: boolean; message: string }> {
  const key = await providerCredential(env, { userId, provider: "tmdb", key: "TMDB_API_KEY" });
  if (!key) {
    return { ok: false, message: "No TMDB API key or read token configured." };
  }
  const isBearer = key.length > 50;
  const customBase = (await providerCredential(env, { userId, provider: "tmdb", key: "TMDB_API_ENDPOINT" })) || envString(env, "TMDB_API_BASE_URL");
  const url = new URL(`${externalApiEndpoints.tmdbApi}/authentication`);
  try {
    const headers: Record<string, string> = { "Accept": "application/json" };
    if (isBearer) headers["Authorization"] = `Bearer ${key}`;
    if (!isBearer) url.searchParams.set("api_key", key);
    const res = await resilientTmdbFetch(url, { headers }, customBase);
    if (res.ok) {
      return { ok: true, message: "TMDB credentials verified and active." };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Invalid TMDB API key or read token." };
    }
    return { ok: false, message: `TMDB returned HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach TMDB API." };
  }
}

export async function tmdbSearch(env: Env, mode: "movie" | "tv", query: string, limit: number, userId?: string | null) {
  const key = await providerCredential(env, { userId, provider: "tmdb", key: "TMDB_API_KEY" });
  if (!key) return [];
  const data = await cachedJson<{ results?: unknown[] }>(env, "tmdb", `search:${mode}:${query.toLowerCase()}`, providerTtls.tmdbSearch, () => tmdbFetch(env, `search/${mode}`, key, { query, include_adult: "false" }, userId));
  return (data?.results ?? []).slice(0, limit).map((item) => normalizeTmdb(item, mode)).filter(isProviderResult);
}

export async function tmdbList(env: Env, cacheKey: string, path: string, limit: number, userId?: string | null) {
  const key = await providerCredential(env, { userId, provider: "tmdb", key: "TMDB_API_KEY" });
  if (!key) return [];
  const data = await cachedJson<{ results?: unknown[] }>(env, "tmdb", `list:${cacheKey}`, providerTtls.tmdbList, () => tmdbFetch(env, path, key, {}, userId));
  return (data?.results ?? []).slice(0, limit).map((item) => normalizeTmdb(item, inferTmdbMode(item))).filter(isProviderResult);
}

export async function tmdbFindByExternalId(env: Env, type: MediaType, source: string, externalId: string, userId?: string | null): Promise<ProviderResult | null> {
  if ((type !== "show" && type !== "anime" && type !== "movie") || (source !== "imdb" && source !== "tvdb")) return null;
  const key = await providerCredential(env, { userId, provider: "tmdb", key: "TMDB_API_KEY" });
  if (!key) return null;
  const externalSource = source === "imdb" ? "imdb_id" : "tvdb_id";
  const data = await cachedJson<{ movie_results?: unknown[]; tv_results?: unknown[] }>(env, "tmdb", `find:${externalSource}:${externalId}`, providerTtls.tmdbExternalFind, () => tmdbFetch(env, `find/${encodeURIComponent(externalId)}`, key, { external_source: externalSource }, userId));
  const record = type === "movie" ? data?.movie_results?.[0] : data?.tv_results?.[0];
  return record ? normalizeTmdb(record, type === "movie" ? "movie" : "tv") : null;
}

export async function tmdbFetchMediaDetails(env: Env, path: string, userId?: string | null) {
  const key = await providerCredential(env, { userId, provider: "tmdb", key: "TMDB_API_KEY" });
  if (!key) throw new Error("TMDB provider is not connected.");
  const response = await tmdbFetch(env, path, key, {}, userId);
  if (response.status === 429) throw new Error("TMDB is busy right now. Try again shortly.");
  if (!response.ok) throw new Error(`TMDB detail request failed with status ${response.status}.`);
  return response.json() as Promise<any>;
}

export async function tmdbFetch(env: Env, path: string, key: string, params: Record<string, string> = {}, userId?: string | null): Promise<Response> {
  const isBearer = key.length > 50;
  const customBase = (await providerCredential(env, { userId, provider: "tmdb", key: "TMDB_API_ENDPOINT" })) || envString(env, "TMDB_API_BASE_URL");
  const url = new URL(`${externalApiEndpoints.tmdbApi}/${path}`);
  if (!isBearer) {
    url.searchParams.set("api_key", key);
  }
  for (const [param, value] of Object.entries(params)) {
    url.searchParams.set(param, value);
  }
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (isBearer) {
    headers["Authorization"] = `Bearer ${key}`;
  }
  return resilientTmdbFetch(url, { headers }, customBase);
}

export function tmdbUrl(path: string, key: string, params: Record<string, string> = {}) {
  const url = new URL(`${externalApiEndpoints.tmdbApi}/${path}`);
  url.searchParams.set("api_key", key);
  for (const [param, value] of Object.entries(params)) url.searchParams.set(param, value);
  return url.toString();
}

function normalizeTmdb(item: unknown, mode: "movie" | "tv"): ProviderResult | null {
  const record = item as Record<string, unknown>;
  const id = numberOrString(record.id);
  const title = stringValue(mode === "movie" ? record.title : record.name) ?? stringValue(record.title) ?? stringValue(record.name);
  if (!id || !title) return null;
  const releaseDate = stringValue(mode === "movie" ? record.release_date : record.first_air_date);
  const genreIds = Array.isArray(record.genre_ids) ? record.genre_ids.filter((id): id is number => typeof id === "number") : [];
  const classification = classifyMedia({ type: mode === "movie" ? "movie" : "tv", genreIds, originalLanguage: stringValue(record.original_language) });
  const type: MediaType = classification.suggestedType ?? (mode === "movie" ? "movie" : "show");
  const extendedDataJson = classification.isAnime
    ? JSON.stringify({ category: "anime", anime: { originalLanguage: stringValue(record.original_language) ?? null }, animeFormat: mode === "movie" ? "movie" : "series" })
    : classification.isCartoon
      ? JSON.stringify({ category: "cartoon" })
      : null;
  return {
    provider: "tmdb",
    providerId: id,
    type,
    title,
    overview: stringValue(record.overview),
    posterPath: tmdbImage(stringValue(record.poster_path), "w342"),
    backdropPath: tmdbImage(stringValue(record.backdrop_path), "w780"),
    releaseDate,
    year: yearFromDate(releaseDate),
    sourceUrl: `${externalApiEndpoints.tmdbWeb}/${mode === "movie" ? "movie" : "tv"}/${id}`,
    rating: numberValue(record.vote_average),
    popularity: numberValue(record.popularity),
    attribution: providerAttributions.tmdb,
    extendedDataJson,
  };
}

function inferTmdbMode(item: unknown): "movie" | "tv" {
  const record = item as Record<string, unknown>;
  return record.media_type === "tv" || record.name ? "tv" : "movie";
}
