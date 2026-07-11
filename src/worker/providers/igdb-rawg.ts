import { externalApiEndpoints } from "@shared/constants";
import { providerCredential } from "./provider-credentials";
import { cachedJson, writeProviderCache } from "./provider-cache-service";
import { providerTtls } from "./provider-ttls";
import { arrayNames, isProviderResult, numberOrString, numberValue, stringValue, yearFromDate } from "./normalizers";
import { providerAttributions, type ProviderResult } from "./types";

export async function igdbSearch(env: Env, query: string, limit: number) {
  const q = `search "${query}"; fields name,slug,summary,cover.image_id,first_release_date,rating,rating_count,platforms.name,genres.name,involved_companies.company.name; limit ${limit};`;
  const data = await igdbRequest<unknown[]>(env, q, `search:${query.toLowerCase()}`);
  const results = (data ?? []).map(normalizeIgdb).filter(isProviderResult);
  return results.length === 0 ? rawgSearch(env, query, limit) : results;
}

export async function igdbList(env: Env, cacheKey: string, query: string, limit: number) {
  const q = `fields name,slug,summary,cover.image_id,first_release_date,rating,rating_count,platforms.name,genres.name,involved_companies.company.name; ${query} limit ${limit};`;
  const data = await igdbRequest<unknown[]>(env, q, `list:${cacheKey}`);
  const results = (data ?? []).map(normalizeIgdb).filter(isProviderResult);
  if (results.length === 0) return rawgList(env, cacheKey, cacheKey.includes("upcoming") ? "-added" : "-rating", limit);
  return results;
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
    profilePath: c.mug_shot?.image_id ? `${externalApiEndpoints.igdbImage}/t_thumb/${c.mug_shot.image_id}.jpg` : null,
  })).filter((c: any) => c.name).slice(0, 16);
  const trailers = (game.videos || []).slice(0, 5).map((v: any) => ({ name: stringValue(v.name) || "Trailer", url: `${externalApiEndpoints.youtubeWeb}/watch?v=${v.video_id}` }));
  return { platforms, characters, trailers, developers, publishers };
}

export async function rawgFetchDetails(env: Env, providerId: string) {
  const [game, trailers] = await Promise.all([
    rawgRequest<any>(env, `games/${providerId}`, `details:${providerId}`),
    rawgRequest<{ results?: any[] }>(env, `games/${providerId}/movies`, `trailers:${providerId}`),
  ]);
  if (!game) return null;
  const mappedTrailers = (trailers?.results ?? []).map((t: any) => ({ name: stringValue(t.name) ?? "Trailer", url: stringValue(t.data?.max) ?? stringValue(t.data?.[480]) })).filter((t: any) => t.url);
  return { platforms: arrayNames(game.platforms, "platform"), developers: arrayNames(game.developers), publishers: arrayNames(game.publishers), trailers: mappedTrailers };
}

async function getIgdbToken(env: Env, forceRefresh = false): Promise<string | null> {
  const clientId = await providerCredential(env, { provider: "igdb", key: "TWITCH_IGDB_CLIENT_ID" });
  const clientSecret = await providerCredential(env, { provider: "igdb", key: "TWITCH_IGDB_CLIENT_SECRET" });
  if (!clientId || !clientSecret) return null;
  if (!forceRefresh && env.DB) {
    const cached = await env.DB.prepare("SELECT response_json, expires_at FROM provider_cache WHERE provider = 'igdb' AND cache_key = 'oauth_token'").first<{ response_json: string; expires_at: string }>();
    if (cached && new Date(cached.expires_at).getTime() > Date.now()) return cached.response_json;
  }
  const response = await fetch(`${externalApiEndpoints.twitchOAuthToken}?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, { method: "POST" });
  if (!response.ok) return null;
  const data = await response.json() as { access_token: string; expires_in: number };
  if (!data.access_token) return null;
  if (env.DB) await writeProviderCache(env.DB, "igdb", "oauth_token", data.access_token, 200, Math.floor(data.expires_in * 0.9));
  return data.access_token;
}

async function igdbRequest<T>(env: Env, query: string, cacheKey: string): Promise<T | null> {
  const clientId = await providerCredential(env, { provider: "igdb", key: "TWITCH_IGDB_CLIENT_ID" });
  if (!clientId) return null;
  let token = await getIgdbToken(env);
  if (!token) return null;
  const makeReq = () => fetch(externalApiEndpoints.igdbGames, { method: "POST", headers: { "Client-ID": clientId, "Authorization": `Bearer ${token}`, "Accept": "application/json" }, body: query });
  let data = await cachedJson<T>(env, "igdb", cacheKey, providerTtls.igdbSearch, makeReq);
  if (!data) {
    token = await getIgdbToken(env, true);
    if (token) data = await cachedJson<T>(env, "igdb", cacheKey, providerTtls.igdbSearch, makeReq);
  }
  return data;
}

async function rawgRequest<T>(env: Env, endpoint: string, cacheKey: string, params: Record<string, string | number> = {}): Promise<T | null> {
  const key = await providerCredential(env, { provider: "rawg", key: "RAWG_API_KEY" });
  if (!key) return null;
  const url = new URL(`${externalApiEndpoints.rawgApi}/${endpoint}`);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return cachedJson<T>(env, "rawg", cacheKey, providerTtls.rawgSearch, () => fetch(url.toString()));
}

async function rawgSearch(env: Env, query: string, limit: number): Promise<ProviderResult[]> {
  const data = await rawgRequest<{ results?: any[] }>(env, "games", `search:${query.toLowerCase()}`, { search: query, page_size: limit });
  return (data?.results ?? []).map(normalizeRawg).filter(isProviderResult);
}

async function rawgList(env: Env, cacheKey: string, ordering: string, limit: number): Promise<ProviderResult[]> {
  const data = await rawgRequest<{ results?: any[] }>(env, "games", `list:${cacheKey}`, { ordering, page_size: limit });
  return (data?.results ?? []).map(normalizeRawg).filter(isProviderResult);
}

function normalizeIgdb(item: unknown): ProviderResult | null {
  const record = item as Record<string, unknown>;
  const id = numberOrString(record.id);
  const title = stringValue(record.name);
  if (!id || !title) return null;
  const firstReleaseDate = numberValue(record.first_release_date);
  const releaseDate = firstReleaseDate ? new Date(firstReleaseDate * 1000).toISOString().slice(0, 10) : null;
  const cover = record.cover as { image_id?: string } | undefined;
  const posterPath = cover?.image_id ? `${externalApiEndpoints.igdbImage}/t_cover_big/${cover.image_id}.jpg` : null;
  const studios = Array.isArray(record.involved_companies) ? record.involved_companies.map((ic: any) => ic.company?.name).filter(Boolean) : [];
  return {
    provider: "igdb",
    providerId: id,
    type: "game",
    title,
    overview: stringValue(record.summary),
    posterPath,
    backdropPath: cover?.image_id ? `${externalApiEndpoints.igdbImage}/t_screenshot_huge/${cover.image_id}.jpg` : null,
    releaseDate,
    year: yearFromDate(releaseDate),
    sourceUrl: `${externalApiEndpoints.igdbWeb}/games/${stringValue(record.slug) ?? id}`,
    rating: numberValue(record.rating) ? numberValue(record.rating)! / 10 : null,
    popularity: numberValue(record.rating_count),
    attribution: providerAttributions.igdb,
    extendedDataJson: JSON.stringify({ game: { platforms: arrayNames(record.platforms), studios, igdbRating: numberValue(record.rating) }, genres: arrayNames(record.genres).map((name) => ({ name })) }),
  };
}

function normalizeRawg(record: any): ProviderResult | null {
  const id = numberOrString(record.id);
  const title = stringValue(record.name);
  if (!id || !title) return null;
  const releaseDate = stringValue(record.released);
  return { provider: "rawg", providerId: id, type: "game", title, overview: null, posterPath: stringValue(record.background_image), backdropPath: null, releaseDate, year: yearFromDate(releaseDate), sourceUrl: `${externalApiEndpoints.rawgWeb}/games/${record.slug || id}`, rating: numberValue(record.rating) ? record.rating * 20 : null, popularity: numberValue(record.added), attribution: providerAttributions.rawg };
}
