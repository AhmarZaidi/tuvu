import type { MediaType } from "@shared/media";
import { externalApiEndpoints } from "@shared/constants";
import { classifyMedia } from "@shared/media-classification";
import { providerCredential } from "./provider-credentials";
import { cachedJson } from "./provider-cache-service";
import { providerTtls } from "./provider-ttls";
import { isProviderResult, numberOrString, numberValue, stringValue, tmdbImage, yearFromDate } from "./normalizers";
import { providerAttributions, type ProviderResult } from "./types";

export async function tmdbSearch(env: Env, mode: "movie" | "tv", query: string, limit: number) {
  const key = await providerCredential(env, { provider: "tmdb", key: "TMDB_API_KEY" });
  if (!key) return [];
  const data = await cachedJson<{ results?: unknown[] }>(env, "tmdb", `search:${mode}:${query.toLowerCase()}`, providerTtls.tmdbSearch, () => fetch(tmdbUrl(`search/${mode}`, key, { query, include_adult: "false" })));
  return (data?.results ?? []).slice(0, limit).map((item) => normalizeTmdb(item, mode)).filter(isProviderResult);
}

export async function tmdbList(env: Env, cacheKey: string, path: string, limit: number) {
  const key = await providerCredential(env, { provider: "tmdb", key: "TMDB_API_KEY" });
  if (!key) return [];
  const data = await cachedJson<{ results?: unknown[] }>(env, "tmdb", `list:${cacheKey}`, providerTtls.tmdbList, () => fetch(tmdbUrl(path, key)));
  return (data?.results ?? []).slice(0, limit).map((item) => normalizeTmdb(item, inferTmdbMode(item))).filter(isProviderResult);
}

export async function tmdbFindByExternalId(env: Env, type: MediaType, source: string, externalId: string): Promise<ProviderResult | null> {
  if ((type !== "show" && type !== "anime" && type !== "movie") || (source !== "imdb" && source !== "tvdb")) return null;
  const key = await providerCredential(env, { provider: "tmdb", key: "TMDB_API_KEY" });
  if (!key) return null;
  const externalSource = source === "imdb" ? "imdb_id" : "tvdb_id";
  const data = await cachedJson<{ movie_results?: unknown[]; tv_results?: unknown[] }>(env, "tmdb", `find:${externalSource}:${externalId}`, providerTtls.tmdbExternalFind, () => fetch(tmdbUrl(`find/${encodeURIComponent(externalId)}`, key, { external_source: externalSource })));
  const record = type === "movie" ? data?.movie_results?.[0] : data?.tv_results?.[0];
  return record ? normalizeTmdb(record, type === "movie" ? "movie" : "tv") : null;
}

export async function tmdbFetchMediaDetails(env: Env, path: string) {
  const key = await providerCredential(env, { provider: "tmdb", key: "TMDB_API_KEY" });
  if (!key) throw new Error("TMDB provider is not connected.");
  const response = await fetch(tmdbUrl(path, key));
  if (response.status === 429) throw new Error("TMDB is busy right now. Try again shortly.");
  if (!response.ok) throw new Error(`TMDB detail request failed with status ${response.status}.`);
  return response.json() as Promise<any>;
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
  };
}

function inferTmdbMode(item: unknown): "movie" | "tv" {
  const record = item as Record<string, unknown>;
  return record.media_type === "tv" || record.name ? "tv" : "movie";
}
