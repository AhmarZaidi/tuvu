import type { MediaType } from "@shared/media";
import { envString } from "./env";

export type ProviderAttribution = {
  provider: "tmdb" | "rawg" | "igdb" | "openlibrary" | "jikan" | "local";
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
  extendedDataJson?: string | null;
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
const igdbAttribution: ProviderAttribution = { provider: "igdb", label: "IGDB", url: "https://www.igdb.com/" };
const openLibraryAttribution: ProviderAttribution = { provider: "openlibrary", label: "Open Library", url: "https://openlibrary.org/" };
const jikanAttribution: ProviderAttribution = { provider: "jikan", label: "MyAnimeList (Jikan)", url: "https://myanimelist.net/" };
const rawgAttribution: ProviderAttribution = { provider: "rawg", label: "RAWG", url: "https://rawg.io/" };

export async function providerSearch(env: Env, query: string, types: MediaType[], limit = 8): Promise<ProviderResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const calls: Array<Promise<ProviderResult[]>> = [];
  if (types.some((type) => type === "movie" || type === "show" || type === "anime")) {
    if (types.includes("movie")) calls.push(tmdbSearch(env, "movie", trimmed, limit));
    if (types.some((type) => type === "show" || type === "anime")) calls.push(tmdbSearch(env, "tv", trimmed, limit));
  }
  if (types.includes("game")) calls.push(igdbSearch(env, trimmed, limit));
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
  const [tmdbTrending, tmdbMovies, tmdbShows, tmdbAnime, games, upcomingGames, books] = await Promise.allSettled([
    tmdbList(env, "trending", "trending/all/week", 10),
    tmdbList(env, "popular-movies", "movie/popular", 10),
    tmdbList(env, "popular-shows", "tv/popular", 10),
    tmdbList(env, "popular-anime", "discover/tv?with_genres=16&with_original_language=ja", 10),
    igdbList(env, "popular", "sort rating desc; where rating > 80 & rating_count > 100;", 10),
    igdbList(env, "upcoming", `sort first_release_date asc; where first_release_date > ${Math.floor(Date.now() / 1000)};`, 10),
    openLibrarySubject(env, "fiction", 10),
  ]);
  return [
    { id: "trending", title: "Trending now", subtitle: "Fresh cross-media signals from TMDB.", results: valueOrEmpty(tmdbTrending) },
    { id: "popular-movies", title: "Popular movies", subtitle: "High-signal picks for your movie list.", results: valueOrEmpty(tmdbMovies) },
    { id: "popular-shows", title: "Popular shows", subtitle: "Series people are watching right now.", results: valueOrEmpty(tmdbShows) },
    { id: "popular-anime", title: "Popular anime", subtitle: "Trending Japanese animation.", results: valueOrEmpty(tmdbAnime).map(a => ({...a, type: 'anime' as const})) },
    { id: "popular-games", title: "Popular games", subtitle: "IGDB-backed game discoveries.", results: valueOrEmpty(games) },
    { id: "upcoming-games", title: "Upcoming games", subtitle: "Future releases to keep an eye on.", results: valueOrEmpty(upcomingGames) },
    { id: "books", title: "Books to explore", subtitle: "Cached Open Library subject picks.", results: valueOrEmpty(books) },
  ].filter((row) => row.results.length > 0);
}

export async function providerTypeExplore(env: Env, type: MediaType): Promise<ProviderResult[]> {
  const limit = 40;
  switch (type) {
    case "movie":
      return await tmdbList(env, "explore-movies", "discover/movie?sort_by=popularity.desc", limit);
    case "show":
      return await tmdbList(env, "explore-shows", "discover/tv?sort_by=popularity.desc", limit);
    case "anime":
      const anime = await tmdbList(env, "explore-anime", "discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc", limit);
      return anime.map(a => ({...a, type: 'anime'}));
    case "game":
      return await igdbList(env, "explore-games", "sort rating desc; where rating > 80 & rating_count > 100;", limit);
    case "book":
      return await openLibrarySubject(env, "fiction", limit);
    default:
      return [];
  }
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
  if (!response.ok) {
    if (provider === "igdb" && response.status === 401) {
       return null;
    }
    return null;
  }
  const parsed = JSON.parse(text) as T;
  if (env.DB) {
    const now = new Date();
    const expires = new Date(now.getTime() + ttlSeconds * 1000);
    await env.DB.prepare(`INSERT INTO provider_cache (id, provider, cache_key, response_json, status, fetched_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, cache_key) DO UPDATE SET response_json=excluded.response_json, status=excluded.status, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at`)
      .bind(`pc_${provider}_${stableKey(cacheKey)}`, provider, cacheKey, JSON.stringify(parsed), response.status, now.toISOString(), expires.toISOString())
      .run();
  }
  return parsed;
}

// ============================================================================
// TMDB (Movies & Shows)
// ============================================================================
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

function tmdbUrl(path: string, key: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
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
  
  const isAnime = record.original_language === "ja" && Array.isArray(record.genre_ids) && record.genre_ids.includes(16);
  const type: MediaType = isAnime ? "anime" : (mode === "movie" ? "movie" : "show");
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

// ============================================================================
// IGDB (Games)
// ============================================================================
async function getIgdbToken(env: Env, forceRefresh = false): Promise<string | null> {
  const clientId = envString(env, "TWITCH_IGDB_CLIENT_ID");
  const clientSecret = envString(env, "TWITCH_IGDB_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  if (!forceRefresh && env.DB) {
    const cached = await env.DB.prepare("SELECT response_json, expires_at FROM provider_cache WHERE provider = 'igdb' AND cache_key = 'oauth_token'").first<CacheRow>();
    if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
      return cached.response_json; 
    }
  }

  const url = `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) return null;
  const data = await response.json() as { access_token: string, expires_in: number };
  if (!data.access_token) return null;
  
  if (env.DB) {
    const now = new Date();
    const expires = new Date(now.getTime() + (data.expires_in * 0.9) * 1000);
    await env.DB.prepare(`INSERT INTO provider_cache (id, provider, cache_key, response_json, status, fetched_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, cache_key) DO UPDATE SET response_json=excluded.response_json, status=excluded.status, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at`)
      .bind("pc_igdb_token", "igdb", "oauth_token", data.access_token, 200, now.toISOString(), expires.toISOString())
      .run();
  }
  return data.access_token;
}

async function igdbRequest<T>(env: Env, query: string, cacheKey: string): Promise<T | null> {
  const clientId = envString(env, "TWITCH_IGDB_CLIENT_ID");
  if (!clientId) return null;
  let token = await getIgdbToken(env);
  if (!token) return null;

  const makeReq = () => fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    },
    body: query,
  });

  let data = await cachedJson<T>(env, "igdb", cacheKey, 12 * 60 * 60, makeReq);
  
  if (!data) {
     token = await getIgdbToken(env, true);
     if (token) {
        data = await cachedJson<T>(env, "igdb", cacheKey, 12 * 60 * 60, makeReq);
     }
  }

  return data;
}

async function igdbSearch(env: Env, query: string, limit: number) {
  const q = `search "${query}"; fields name,slug,summary,cover.image_id,first_release_date,rating,rating_count,platforms.name,genres.name,involved_companies.company.name; limit ${limit};`;
  const data = await igdbRequest<unknown[]>(env, q, `search:${query.toLowerCase()}`);
  const results = (data ?? []).map(normalizeIgdb).filter(isProviderResult);
  if (results.length === 0) return rawgSearch(env, query, limit);
  return results;
}

async function igdbList(env: Env, cacheKey: string, query: string, limit: number) {
  const q = `fields name,slug,summary,cover.image_id,first_release_date,rating,rating_count,platforms.name,genres.name,involved_companies.company.name; ${query} limit ${limit};`;
  const data = await igdbRequest<unknown[]>(env, q, `list:${cacheKey}`);
  const results = (data ?? []).map(normalizeIgdb).filter(isProviderResult);
  if (results.length === 0) {
    const ordering = cacheKey.includes("upcoming") ? "-added" : "-rating";
    return rawgList(env, cacheKey, ordering, limit);
  }
  return results;
}

function normalizeIgdb(item: unknown): ProviderResult | null {
  const record = item as Record<string, unknown>;
  const id = numberOrString(record.id);
  const title = stringValue(record.name);
  if (!id || !title) return null;

  const firstReleaseDate = numberValue(record.first_release_date);
  const releaseDate = firstReleaseDate ? new Date(firstReleaseDate * 1000).toISOString().slice(0, 10) : null;
  
  const cover = record.cover as { image_id?: string } | undefined;
  const posterPath = cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${cover.image_id}.jpg` : null;

  const studios = Array.isArray(record.involved_companies) 
      ? record.involved_companies.map((ic: any) => ic.company?.name).filter(Boolean) 
      : [];

  return {
    provider: "igdb",
    providerId: id,
    type: "game",
    title,
    overview: stringValue(record.summary),
    posterPath,
    backdropPath: cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_screenshot_huge/${cover.image_id}.jpg` : null,
    releaseDate,
    year: yearFromDate(releaseDate),
    sourceUrl: `https://www.igdb.com/games/${stringValue(record.slug) ?? id}`,
    rating: numberValue(record.rating) ? numberValue(record.rating)! / 10 : null,
    popularity: numberValue(record.rating_count),
    attribution: igdbAttribution,
    extendedDataJson: JSON.stringify({
      game: {
        platforms: arrayNames(record.platforms),
        studios,
        igdbRating: numberValue(record.rating),
      },
      genres: arrayNames(record.genres).map((name) => ({ name })),
    }),
  };
}

export async function igdbFetchDetails(env: Env, providerId: string) {
  const query = `fields platforms.name,genres.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,game_engines.name,websites.url,websites.category,videos.video_id,videos.name,characters.name,characters.mug_shot.image_id; where id = ${providerId}; limit 1;`;
  const data = await igdbRequest<any[]>(env, query, `details:${providerId}`);
  if (!data || !data[0]) return null;
  const game = data[0];
  
  const platforms = arrayNames(game.platforms);
  const developers = (game.involved_companies || []).filter((c: any) => c.developer).map((c: any) => stringValue(c.company?.name)).filter(Boolean);
  const publishers = (game.involved_companies || []).filter((c: any) => c.publisher).map((c: any) => stringValue(c.company?.name)).filter(Boolean);
  const characters = (game.characters || []).map((c: any) => ({
    name: stringValue(c.name),
    profilePath: c.mug_shot?.image_id ? `https://images.igdb.com/igdb/image/upload/t_thumb/${c.mug_shot.image_id}.jpg` : null,
  })).filter((c: any) => c.name).slice(0, 16);
  const trailers = (game.videos || []).slice(0, 5).map((v: any) => ({ name: stringValue(v.name) || "Trailer", url: `https://www.youtube.com/watch?v=${v.video_id}` }));
  
  return {
    platforms,
    characters,
    trailers,
    developers,
    publishers,
  };
}

// ============================================================================
// RAWG (Games Fallback)
// ============================================================================
async function rawgRequest<T>(env: Env, endpoint: string, cacheKey: string, params: Record<string, string | number> = {}): Promise<T | null> {
  const key = envString(env, "RAWG_API_KEY");
  if (!key) return null;
  const url = new URL(`https://api.rawg.io/api/${endpoint}`);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  
  return cachedJson<T>(env, "rawg", cacheKey, 12 * 60 * 60, () => fetch(url.toString()));
}

async function rawgSearch(env: Env, query: string, limit: number): Promise<ProviderResult[]> {
  const data = await rawgRequest<{ results?: any[] }>(env, "games", `search:${query.toLowerCase()}`, { search: query, page_size: limit });
  return (data?.results ?? []).map(normalizeRawg).filter(isProviderResult);
}

async function rawgList(env: Env, cacheKey: string, ordering: string, limit: number): Promise<ProviderResult[]> {
  const data = await rawgRequest<{ results?: any[] }>(env, "games", `list:${cacheKey}`, { ordering, page_size: limit });
  return (data?.results ?? []).map(normalizeRawg).filter(isProviderResult);
}

export async function rawgFetchDetails(env: Env, providerId: string) {
  const [game, trailers] = await Promise.all([
    rawgRequest<any>(env, `games/${providerId}`, `details:${providerId}`),
    rawgRequest<{ results?: any[] }>(env, `games/${providerId}/movies`, `trailers:${providerId}`),
  ]);

  if (!game) return null;
  const platforms = arrayNames(game.platforms, "platform");
  const developers = arrayNames(game.developers);
  const publishers = arrayNames(game.publishers);
  
  const mappedTrailers = (trailers?.results ?? []).map((t: any) => ({
    name: stringValue(t.name) ?? "Trailer",
    url: stringValue(t.data?.max) ?? stringValue(t.data?.[480]),
  })).filter((t: any) => t.url);

  return {
    platforms,
    developers,
    publishers,
    trailers: mappedTrailers,
  };
}

function normalizeRawg(record: any): ProviderResult | null {
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
    backdropPath: null,
    releaseDate,
    year: yearFromDate(releaseDate),
    sourceUrl: `https://rawg.io/games/${record.slug || id}`,
    rating: numberValue(record.rating) ? record.rating * 20 : null, // RAWG is 0-5, convert to 0-100
    popularity: numberValue(record.added),
    attribution: rawgAttribution,
  };
}

// ============================================================================
// OpenLibrary (Books)
// ============================================================================
async function openLibrarySearch(env: Env, query: string, limit: number) {
  const email = envString(env, "OPEN_LIBRARY_CONTACT_EMAIL");
  const data = await cachedJson<{ docs?: unknown[] }>(env, "openlibrary", `search:${query.toLowerCase()}`, 24 * 60 * 60, () => fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${limit}`, openLibraryHeaders(email)));
  return (data?.docs ?? []).slice(0, limit).map(normalizeOpenLibrary).filter(isProviderResult);
}

async function openLibrarySubject(env: Env, subject: string, limit: number) {
  const email = envString(env, "OPEN_LIBRARY_CONTACT_EMAIL");
  const data = await cachedJson<{ works?: unknown[] }>(env, "openlibrary", `subject:${subject.toLowerCase()}`, 24 * 60 * 60, () => fetch(`https://openlibrary.org/subjects/${encodeURIComponent(subject)}.json?limit=${limit}`, openLibraryHeaders(email)));
  return (data?.works ?? []).slice(0, limit).map(normalizeOpenLibrarySubject).filter(isProviderResult);
}

function openLibraryHeaders(email?: string) {
  return { headers: { "User-Agent": `Tuvu (${email || "local-dev@example.invalid"})` } };
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
    extendedDataJson: JSON.stringify({
      book: {
        isbn10: firstString(record.isbn)?.length === 10 ? firstString(record.isbn) : undefined,
        isbn13: firstString(record.isbn)?.length === 13 ? firstString(record.isbn) : undefined,
        authors: Array.isArray(record.author_name) ? record.author_name.slice(0, 6).map((name) => ({ name: String(name), job: "Author" })) : [],
        languages: Array.isArray(record.language) ? record.language.slice(0, 8).map(String) : [],
        publisher: firstString(record.publisher),
        pageCount: numberValue(record.number_of_pages_median),
        editionCount: numberValue(record.edition_count),
        rating: numberValue(record.ratings_average),
      },
    }),
  };
}

function normalizeOpenLibrarySubject(item: unknown): ProviderResult | null {
  const record = item as Record<string, unknown>;
  const key = stringValue(record.key);
  const title = stringValue(record.title);
  if (!key || !title) return null;
  const coverId = numberValue(record.cover_id);
  const firstPublishYear = numberValue(record.first_publish_year);
  return {
    provider: "openlibrary",
    providerId: key.replace(/^\/works\//, ""),
    type: "book",
    title,
    overview: Array.isArray(record.authors) ? `By ${record.authors.slice(0, 3).map((a: any) => a.name).join(", ")}` : null,
    posterPath: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
    backdropPath: null,
    releaseDate: firstPublishYear ? `${firstPublishYear}-01-01` : null,
    year: firstPublishYear,
    sourceUrl: `https://openlibrary.org${key}`,
    rating: null,
    popularity: numberValue(record.edition_count),
    attribution: openLibraryAttribution,
    extendedDataJson: null,
  };
}

export async function openLibraryFetchDetails(env: Env, providerId: string) {
  const email = envString(env, "OPEN_LIBRARY_CONTACT_EMAIL");
  const headers = openLibraryHeaders(email);
  
  const [workData, editionsData] = await Promise.all([
    cachedJson<any>(env, "openlibrary", `work:${providerId}`, 24 * 60 * 60, () => fetch(`https://openlibrary.org/works/${providerId}.json`, headers)),
    cachedJson<any>(env, "openlibrary", `editions:${providerId}`, 24 * 60 * 60, () => fetch(`https://openlibrary.org/works/${providerId}/editions.json`, headers)),
  ]);

  if (!workData) return null;

  const description = typeof workData.description === "string" ? workData.description : (workData.description?.value ?? null);
  const subjects = arrayNames(workData.subjects?.map((s: string) => ({ name: s })));
  
  let pageCount = null;
  let isbn10 = null;
  let isbn13 = null;
  
  if (editionsData && Array.isArray(editionsData.entries)) {
    // Find first edition with a page count and ISBN
    const best = editionsData.entries.find((e: any) => e.number_of_pages || e.isbn_10 || e.isbn_13);
    if (best) {
      pageCount = numberValue(best.number_of_pages);
      isbn10 = firstString(best.isbn_10);
      isbn13 = firstString(best.isbn_13);
    }
  }

  return {
    description,
    subjects,
    pageCount,
    isbn10,
    isbn13,
  };
}

// ============================================================================
// Helpers
// ============================================================================
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

function firstString(value: unknown) {
  if (Array.isArray(value)) return (value.find((item) => typeof item === "string" && item.trim()) as string | undefined) ?? null;
  return stringValue(value);
}

function arrayNames(value: unknown, nestedKey?: string) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = item as Record<string, unknown>;
    const target = nestedKey && record[nestedKey] && typeof record[nestedKey] === "object" ? record[nestedKey] as Record<string, unknown> : record;
    return stringValue(target.name);
  }).filter((item): item is string => Boolean(item));
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

// ============================================================================
// Jikan (MyAnimeList) - For Hydration
// ============================================================================
export async function jikanSearchAnime(env: Env, query: string, limit: number = 5) {
  const endpoint = envString(env, "MAL_JIKAN_API_ENDPOINT") || "https://api.jikan.moe/v4/";
  // Jikan has strict rate limits, cache for a long time
  const data = await cachedJson<{ data?: any[] }>(env, "jikan", `search:${query.toLowerCase()}`, 7 * 24 * 60 * 60, () => fetch(`${endpoint}anime?q=${encodeURIComponent(query)}&limit=${limit}`));
  return data?.data ?? [];
}

export async function jikanAnimeCharacters(env: Env, malId: number) {
  const endpoint = envString(env, "MAL_JIKAN_API_ENDPOINT") || "https://api.jikan.moe/v4/";
  const data = await cachedJson<{ data?: any[] }>(env, "jikan", `characters:${malId}`, 30 * 24 * 60 * 60, () => fetch(`${endpoint}anime/${malId}/characters`));
  return data?.data ?? [];
}

export async function jikanAnimeEpisodes(env: Env, malId: number) {
  const endpoint = envString(env, "MAL_JIKAN_API_ENDPOINT") || "https://api.jikan.moe/v4/";
  const data = await cachedJson<{ data?: any[] }>(env, "jikan", `episodes:${malId}`, 7 * 24 * 60 * 60, () => fetch(`${endpoint}anime/${malId}/episodes`));
  return data?.data ?? [];
}
