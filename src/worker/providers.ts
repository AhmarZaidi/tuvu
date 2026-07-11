import type { MediaType } from "@shared/media";
import { igdbFetchDetails, igdbList, igdbSearch, rawgFetchDetails } from "./providers/igdb-rawg";
import { jikanAnimeCharacters, jikanAnimeEpisodes, jikanSearchAnime, jikanSearchProvider } from "./providers/jikan";
import { openLibraryFetchDetails, openLibrarySearch, openLibrarySubject } from "./providers/open-library";
import { tmdbFindByExternalId, tmdbList, tmdbSearch } from "./providers/tmdb";
import { youtubeSearch } from "./providers/youtube";
import { valueOrEmpty } from "./providers/normalizers";
import type { ExploreRow, ProviderResult } from "./providers/types";

export type { ExploreRow, ProviderAttribution, ProviderResult } from "./providers/types";
export { igdbFetchDetails, jikanAnimeCharacters, jikanAnimeEpisodes, jikanSearchAnime, openLibraryFetchDetails, rawgFetchDetails };

export async function providerSearch(env: Env, query: string, types: MediaType[], limit = 8): Promise<ProviderResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const calls: Array<Promise<ProviderResult[]>> = [];
  if (types.some((type) => type === "movie" || type === "show" || type === "anime")) {
    if (types.includes("movie")) calls.push(tmdbSearch(env, "movie", trimmed, limit));
    if (types.some((type) => type === "show" || type === "anime")) calls.push(tmdbSearch(env, "tv", trimmed, limit));
  }
  if (types.includes("anime")) calls.push(jikanSearchProvider(env, trimmed, Math.min(limit, 8)));
  if (types.includes("game")) calls.push(igdbSearch(env, trimmed, limit));
  if (types.includes("book")) calls.push(openLibrarySearch(env, trimmed, limit));
  // Placeholder until YouTube is enabled as a searchable media surface.
  calls.push(youtubeSearch(env, trimmed, 0));
  const settled = await Promise.allSettled(calls);
  return settled.flatMap((item) => item.status === "fulfilled" ? item.value : []);
}

export async function providerFindByExternalId(env: Env, type: MediaType, source: string, externalId: string): Promise<ProviderResult | null> {
  return tmdbFindByExternalId(env, type, source, externalId);
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
    { id: "popular-anime", title: "Popular anime", subtitle: "Trending Japanese animation.", results: valueOrEmpty(tmdbAnime).map((result) => ({ ...result, type: "anime" as const })) },
    { id: "popular-games", title: "Popular games", subtitle: "IGDB-backed game discoveries.", results: valueOrEmpty(games) },
    { id: "upcoming-games", title: "Upcoming games", subtitle: "Future releases to keep an eye on.", results: valueOrEmpty(upcomingGames) },
    { id: "books", title: "Books to explore", subtitle: "Cached Open Library subject picks.", results: valueOrEmpty(books) },
  ].filter((row) => row.results.length > 0);
}

export async function providerTypeExplore(env: Env, type: MediaType): Promise<ProviderResult[]> {
  const limit = 40;
  switch (type) {
    case "movie":
      return tmdbList(env, "explore-movies", "discover/movie?sort_by=popularity.desc", limit);
    case "show":
      return tmdbList(env, "explore-shows", "discover/tv?sort_by=popularity.desc", limit);
    case "anime":
      return (await tmdbList(env, "explore-anime", "discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc", limit)).map((result) => ({ ...result, type: "anime" }));
    case "game":
      return igdbList(env, "explore-games", "sort rating desc; where rating > 80 & rating_count > 100;", limit);
    case "book":
      return openLibrarySubject(env, "fiction", limit);
    default:
      return [];
  }
}
