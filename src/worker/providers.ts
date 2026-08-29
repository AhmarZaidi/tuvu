import type { MediaType } from "@shared/media";
import { igdbFetchDetails, igdbList, igdbSearch, rawgFetchDetails, rawgSearch } from "./providers/igdb-rawg";
import { jikanAnimeCharacters, jikanAnimeEpisodes, jikanSearchAnime, jikanSearchProvider } from "./providers/jikan";
import { openLibraryFetchDetails, openLibrarySearch, openLibrarySubject } from "./providers/open-library";
import { googleBooksSearch } from "./providers/google-books";
import { tvmazeLookup, tvmazeSearch, wikidataEntity } from "./providers/tvmaze-wikidata";
import { coverArtArchiveRelease, lrclibGetLyrics, musicBrainzSearch, theAudioDbSearch } from "./providers/music";
import { gdeltSearch, guardianSearch, newsApiSearch } from "./providers/news";
import { openSubtitlesSearch } from "./providers/subtitles";
import { tmdbFindByExternalId, tmdbList, tmdbSearch } from "./providers/tmdb";
import { youtubeSearch } from "./providers/youtube";
import { valueOrEmpty } from "./providers/normalizers";
import type { ExploreRow, ProviderResult } from "./providers/types";
import { pingProvider, type PingResult } from "./providers/ping";

export type { ExploreRow, ProviderAttribution, ProviderResult } from "./providers/types";
export type { PingResult } from "./providers/ping";
export {
  pingProvider,
  igdbFetchDetails,
  jikanAnimeCharacters,
  jikanAnimeEpisodes,
  jikanSearchAnime,
  openLibraryFetchDetails,
  rawgFetchDetails,
  googleBooksSearch,
  tvmazeSearch,
  tvmazeLookup,
  wikidataEntity,
  musicBrainzSearch,
  coverArtArchiveRelease,
  theAudioDbSearch,
  lrclibGetLyrics,
  gdeltSearch,
  guardianSearch,
  newsApiSearch,
  openSubtitlesSearch,
};

export async function providerSearch(env: Env, query: string, types: MediaType[], limit = 8, userId?: string | null): Promise<ProviderResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const calls: Array<Promise<ProviderResult[]>> = [];
  if (types.some((type) => type === "movie" || type === "show" || type === "anime")) {
    if (types.includes("movie")) calls.push(tmdbSearch(env, "movie", trimmed, limit, userId));
    if (types.some((type) => type === "show" || type === "anime")) calls.push(tmdbSearch(env, "tv", trimmed, limit, userId));
    if (types.includes("show")) calls.push(tvmazeSearch(env, trimmed, limit));
  }
  if (types.includes("anime")) calls.push(jikanSearchProvider(env, trimmed, Math.min(limit, 8), userId));
  if (types.includes("game")) calls.push(igdbSearch(env, trimmed, limit, userId));
  if (types.includes("book")) {
    calls.push(openLibrarySearch(env, trimmed, limit, userId));
    calls.push(googleBooksSearch(env, trimmed, limit, userId));
  }
  // Placeholder until YouTube is enabled as a searchable media surface.
  calls.push(youtubeSearch(env, trimmed, 0, userId));
  const settled = await Promise.allSettled(calls);
  return settled.flatMap((item) => item.status === "fulfilled" ? item.value : []);
}

export async function providerFindByExternalId(env: Env, type: MediaType, source: string, externalId: string, userId?: string | null): Promise<ProviderResult | null> {
  return tmdbFindByExternalId(env, type, source, externalId, userId);
}

export async function providerExplore(env: Env, userId?: string | null): Promise<ExploreRow[]> {
  const [tmdbTrending, tmdbMovies, tmdbShows, tmdbAnime, games, upcomingGames, books] = await Promise.allSettled([
    tmdbList(env, "trending", "trending/all/week", 10, userId),
    tmdbList(env, "popular-movies", "movie/popular", 10, userId),
    tmdbList(env, "popular-shows", "tv/popular", 10, userId),
    tmdbList(env, "popular-anime", "discover/tv?with_genres=16&with_original_language=ja", 10, userId),
    igdbList(env, "popular", "sort rating desc; where rating > 80 & rating_count > 100;", 10, userId),
    igdbList(env, "upcoming", `sort first_release_date asc; where first_release_date > ${Math.floor(Date.now() / 1000)};`, 10, userId),
    openLibrarySubject(env, "fiction", 10, userId),
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

export async function providerTypeExplore(env: Env, type: MediaType, userId?: string | null): Promise<ProviderResult[]> {
  const limit = 40;
  switch (type) {
    case "movie":
      return tmdbList(env, "explore-movies", "discover/movie?sort_by=popularity.desc", limit, userId);
    case "show":
      return tmdbList(env, "explore-shows", "discover/tv?sort_by=popularity.desc", limit, userId);
    case "anime":
      return (await tmdbList(env, "explore-anime", "discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc", limit, userId)).map((result) => ({ ...result, type: "anime" }));
    case "game":
      return igdbList(env, "explore-games", "sort rating desc; where rating > 80 & rating_count > 100;", limit, userId);
    case "book":
      return openLibrarySubject(env, "fiction", limit, userId);
    default:
      return [];
  }
}
