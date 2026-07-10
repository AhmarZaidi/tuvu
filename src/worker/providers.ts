import type { MediaType } from "@shared/media";
import { envString } from "./env";

export type ProviderAttribution = {
  provider: "tmdb" | "rawg" | "openlibrary" | "local";
  label: string;
  url: string;
};

export type ProviderResult = {
  provider: ProviderAttribution["provider"];
  providerId: string;
  type: MediaType;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  year: number | null;
  sourceUrl: string | null;
  rating: number | null;
  popularity: number | null;
  attribution: ProviderAttribution;
  alreadyTracked?: boolean;
  localMediaId?: string | null;
};

export type ExploreRow = {
  id: string;
  title: string;
  subtitle: string;
  results: ProviderResult[];
};

type CacheRow = {
  response_json: string;
  status: number;
  expires_at: string;
};

const tmdbAttribution: ProviderAttribution = { provider: "tmdb", label: "TMDB", url: "https://www.themoviedb.org/" };
const rawgAttribution: ProviderAttribution = { provider: "rawg", label: "RAWG", url: "https://rawg.io/" };
const openLibraryAttribution: ProviderAttribution = { provider: "openlibrary", label: "Open Library", url: "https://openlibrary.org/" };

export async function providerSearch(env: Env, query: string, types: MediaType[], limit = 8): Promise<ProviderResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const calls: Array<Promise<ProviderResult[]>> = [];
  if (types.some((type) => type === "movie" || type === "show" || type === "anime")) {
    if (types.includes("movie")) calls.push(tmdbSearch(env, "movie", trimmed, limit));
    if (types.some((type) => type === "show" || type === "anime")) calls.push(tmdbSearch(env, "tv", trimmed, limit));
  }
  if (types.includes("game")) calls.push(rawgSearch(env, trimmed, limit));
  if (types.includes("book")) calls.push(openLibrarySearch(env, trimmed, limit));
  const settled = await Promise.allSettled(calls);
  return settled.flatMap((item) => item.status === "fulfilled" ? item.value : []);
}

export async function providerFindByExternalId(env: Env, type: MediaType, source: string, externalId: string): Promise<ProviderResult | null> {
  if ((type !== "show" && type !== "anime" && type !== "movie") || (source !== "imdb" && source !== "tvdb")) return null;
  const key = envString(env, "TMDB_API_KEY");
  if (!key) return null;
  const externalSource = source === "imdb" ? "imdb_id" : "tvdb_id";
  const data = await cachedJson<{ movie_results?: unknown[]; tv_results?: unknown[] }>(env, "tmdb", `find:${externalSource}:${externalId}`, 30 * 24 * 60 * 60, () => fetch(tmdbUrl(`find/${encodeURIComponent(externalId)}`, key, { external_source: externalSource })));
  const record = type === "movie" ? data?.movie_results?.[0] : data?.tv_results?.[0];
  return record ? normalizeTmdb(record, type === "movie" ? "movie" : "tv") : null;
}

export async function providerExplore(env: Env): Promise<ExploreRow[]> {
  const [tmdbTrending, tmdbMovies, tmdbShows, games, upcomingGames, books] = await Promise.allSettled([
    tmdbList(env, "trending", "trending/all/week", 10),
    tmdbList(env, "popular-movies", "movie/popular", 10),
    tmdbList(env, "popular-shows", "tv/popular", 10),
    rawgList(env, "popular", "ordering=-rating&page_size=10", 10),
    rawgList(env, "upcoming", `dates=${today()},${nextYear()}&ordering=released&page_size=10`, 10),
    openLibrarySubject(env, "popular-books", "fiction", 10),
  ]);
  return [
    { id: "trending", title: "Trending now", subtitle: "Fresh cross-media signals from TMDB.", results: valueOrEmpty(tmdbTrending) },
    { id: "popular-movies", title: "Popular movies", subtitle: "High-signal picks for your movie list.", results: valueOrEmpty(tmdbMovies) },
    { id: "popular-shows", title: "Popular shows", subtitle: "Series people are watching right now.", results: valueOrEmpty(tmdbShows) },
    { id: "popular-games", title: "Popular games", subtitle: "RAWG-backed game discoveries.", results: valueOrEmpty(games) },
    { id: "upcoming-games", title: "Upcoming games", subtitle: "Future releases to keep an eye on.", results: valueOrEmpty(upcomingGames) },
    { id: "books", title: "Books to explore", subtitle: "Cached Open Library subject picks.", results: valueOrEmpty(books) },
  ].filter((row) => row.results.length > 0);
}

async function cachedJson<T>(env: Env, provider: string, cacheKey: string, ttlSeconds: number, request: () => Promise<Response>): Promise<T | null> {
  if (env.DB) {
    const cached = await env.DB.prepare("SELECT response_json, status, expires_at FROM provider_cache WHERE provider = ? AND cache_key = ?").bind(provider, cacheKey).first<CacheRow>();
    if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
      return JSON.parse(cached.response_json) as T;
    }
  }

  const response = await request();
  const text = await response.text();
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    throw new Error(`${provider} rate limited${retryAfter ? `; retry after ${retryAfter}s` : ""}`);
  }
  if (!response.ok) return null;
  const parsed = JSON.parse(text) as T;
  if (env.DB) {
    const now = new Date();
    const expires = new Date(now.getTime() + ttlSeconds * 1000);
    await env.DB.prepare(`INSERT INTO provider_cache (id, provider, cache_key, response_json, status, fetched_at, expires_at, attribution_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, cache_key) DO UPDATE SET response_json=excluded.response_json, status=excluded.status, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at, attribution_json=excluded.attribution_json`)
      .bind(`pc_${provider}_${stableKey(cacheKey)}`, provider, cacheKey, JSON.stringify(parsed), response.status, now.toISOString(), expires.toISOString(), null)
      .run();
  }
  return parsed;
}

async function tmdbSearch(env: Env, mode: "movie" | "tv", query: string, limit: number) {
  const key = envString(env, "TMDB_API_KEY");
  if (!key) return [];
  const data = await cachedJson<{ results?: unknown[] }>(env, "tmdb", `search:${mode}:${query.toLowerCase()}`, 12 * 60 * 60, () => fetch(tmdbUrl(`search/${mode}`, key, { query, include_adult: "false" })));
  return (data?.results ?? []).slice(0, limit).map((item) => normalizeTmdb(item, mode)).filter(isProviderResult);
}

async function tmdbList(env: Env, cacheKey: string, path: string, limit: number) {
  const key = envString(env, "TMDB_API_KEY");
  if (!key) return [];
  const data = await cachedJson<{ results?: unknown[] }>(env, "tmdb", `list:${cacheKey}`, 12 * 60 * 60, () => fetch(tmdbUrl(path, key)));
  return (data?.results ?? []).slice(0, limit).map((item) => normalizeTmdb(item, inferTmdbMode(item))).filter(isProviderResult);
}

async function rawgSearch(env: Env, query: string, limit: number) {
  const key = envString(env, "RAWG_API_KEY");
  if (!key) return [];
  const data = await cachedJson<{ results?: unknown[] }>(env, "rawg", `search:${query.toLowerCase()}`, 12 * 60 * 60, () => fetch(rawgUrl(key, `search=${encodeURIComponent(query)}&page_size=${limit}`)));
  return (data?.results ?? []).slice(0, limit).map(normalizeRawg).filter(isProviderResult);
}

async function rawgList(env: Env, cacheKey: string, query: string, limit: number) {
  const key = envString(env, "RAWG_API_KEY");
  if (!key) return [];
  const data = await cachedJson<{ results?: unknown[] }>(env, "rawg", `list:${cacheKey}`, 12 * 60 * 60, () => fetch(rawgUrl(key, query)));
  return (data?.results ?? []).slice(0, limit).map(normalizeRawg).filter(isProviderResult);
}

async function openLibrarySearch(env: Env, query: string, limit: number) {
  const email = envString(env, "OPEN_LIBRARY_CONTACT_EMAIL");
  const data = await cachedJson<{ docs?: unknown[] }>(env, "openlibrary", `search:${query.toLowerCase()}`, 24 * 60 * 60, () => fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}`, openLibraryHeaders(email)));
  return (data?.docs ?? []).slice(0, limit).map(normalizeOpenLibrary).filter(isProviderResult);
}

async function openLibrarySubject(env: Env, cacheKey: string, subject: string, limit: number) {
  const email = envString(env, "OPEN_LIBRARY_CONTACT_EMAIL");
  const data = await cachedJson<{ works?: unknown[] }>(env, "openlibrary", `subject:${cacheKey}`, 24 * 60 * 60, () => fetch(`https://openlibrary.org/subjects/${encodeURIComponent(subject)}.json?limit=${limit}`, openLibraryHeaders(email)));
  return (data?.works ?? []).slice(0, limit).map(normalizeOpenLibrary).filter(isProviderResult);
}

function tmdbUrl(path: string, key: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set("api_key", key);
  for (const [param, value] of Object.entries(params)) url.searchParams.set(param, value);
  return url.toString();
}

function rawgUrl(key: string, query: string) {
  return `https://api.rawg.io/api/games?key=${encodeURIComponent(key)}&${query}`;
}

function openLibraryHeaders(email?: string) {
  return { headers: { "User-Agent": `Tuvu (${email || "local-dev@example.invalid"})` } };
}

function normalizeTmdb(item: unknown, mode: "movie" | "tv"): ProviderResult | null {
  const record = item as Record<string, unknown>;
  const id = numberOrString(record.id);
  const title = stringValue(mode === "movie" ? record.title : record.name) ?? stringValue(record.title) ?? stringValue(record.name);
  if (!id || !title) return null;
  const releaseDate = stringValue(mode === "movie" ? record.release_date : record.first_air_date);
  const type: MediaType = mode === "movie" ? "movie" : "show";
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
    sourceUrl: `https://www.themoviedb.org/${mode === "movie" ? "movie" : "tv"}/${id}`,
    rating: numberValue(record.vote_average),
    popularity: numberValue(record.popularity),
    attribution: tmdbAttribution,
  };
}

function normalizeRawg(item: unknown): ProviderResult | null {
  const record = item as Record<string, unknown>;
  const id = numberOrString(record.id);
  const title = stringValue(record.name);
  if (!id || !title) return null;
  const releaseDate = stringValue(record.released);
  return {
    provider: "rawg",
    providerId: id,
    type: "game",
    title,
    overview: null,
    posterPath: stringValue(record.background_image),
    backdropPath: stringValue(record.background_image),
    releaseDate,
    year: yearFromDate(releaseDate),
    sourceUrl: `https://rawg.io/games/${stringValue(record.slug) ?? id}`,
    rating: numberValue(record.rating),
    popularity: numberValue(record.added),
    attribution: rawgAttribution,
  };
}

function normalizeOpenLibrary(item: unknown): ProviderResult | null {
  const record = item as Record<string, unknown>;
  const key = stringValue(record.key);
  const title = stringValue(record.title);
  if (!key || !title) return null;
  const coverId = numberValue(record.cover_i) ?? numberValue(record.cover_id);
  const firstPublishYear = numberValue(record.first_publish_year) ?? yearFromDate(stringValue(record.first_publish_date));
  return {
    provider: "openlibrary",
    providerId: key.replace(/^\/works\//, ""),
    type: "book",
    title,
    overview: Array.isArray(record.author_name) ? `By ${record.author_name.slice(0, 3).join(", ")}` : null,
    posterPath: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
    backdropPath: null,
    releaseDate: firstPublishYear ? `${firstPublishYear}-01-01` : null,
    year: firstPublishYear,
    sourceUrl: `https://openlibrary.org${key}`,
    rating: null,
    popularity: numberValue(record.edition_count),
    attribution: openLibraryAttribution,
  };
}

function inferTmdbMode(item: unknown): "movie" | "tv" {
  const record = item as Record<string, unknown>;
  return record.media_type === "tv" || record.name ? "tv" : "movie";
}

function tmdbImage(path: string | null, size: string) {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function isProviderResult(value: ProviderResult | null): value is ProviderResult {
  return Boolean(value);
}

function valueOrEmpty(result: PromiseSettledResult<ProviderResult[]>) {
  return result.status === "fulfilled" ? result.value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberOrString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return stringValue(value);
}

function yearFromDate(value: string | null) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

function stableKey(value: string) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  return Math.abs(hash).toString(36);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextYear() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}
