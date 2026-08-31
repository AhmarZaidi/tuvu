import type { MediaType } from "@shared/media";
import { igdbFetchDetails, igdbList, igdbSearch, rawgFetchDetails, rawgSearch } from "./providers/igdb-rawg";
import { jikanAnimeCharacters, jikanAnimeEpisodes, jikanSearchAnime, jikanSearchProvider } from "./providers/jikan";
import { anilistCharacterDetails, anilistFetchMediaByIdMal, anilistSearchAnime, anilistSearchProvider, anilistTrendingAnime } from "./providers/anilist";
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
  anilistCharacterDetails,
  anilistSearchAnime,
  anilistFetchMediaByIdMal,
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
  if (types.includes("anime")) {
    calls.push(jikanSearchProvider(env, trimmed, Math.min(limit, 8), userId));
    calls.push(anilistSearchProvider(env, trimmed, Math.min(limit, 8), userId));
  }
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

export async function providerTypeExploreRows(env: Env, type: MediaType, userId?: string | null): Promise<ExploreRow[]> {
  const limit = 25;
  switch (type) {
    case "movie": {
      const [popular, trending, topRated, upcoming] = await Promise.allSettled([
        tmdbList(env, "type:movie:popular", "movie/popular", limit, userId),
        tmdbList(env, "type:movie:trending", "trending/movie/week", limit, userId),
        tmdbList(env, "type:movie:top_rated", "movie/top_rated", limit, userId),
        tmdbList(env, "type:movie:upcoming", "movie/upcoming", limit, userId),
      ]);
      return [
        { id: "movies-popular", title: "Popular Movies", subtitle: "Most popular movies right now.", results: valueOrEmpty(popular) },
        { id: "movies-trending", title: "Trending This Week", subtitle: "Buzzworthy and widely watched.", results: valueOrEmpty(trending) },
        { id: "movies-top-rated", title: "Top Rated Movies", subtitle: "All-time critically acclaimed picks.", results: valueOrEmpty(topRated) },
        { id: "movies-upcoming", title: "Upcoming Releases", subtitle: "Films arriving in theaters and streaming soon.", results: valueOrEmpty(upcoming) },
      ].filter((r) => r.results.length > 0);
    }
    case "show": {
      const [popular, trending, topRated, onTheAir] = await Promise.allSettled([
        tmdbList(env, "type:show:popular", "tv/popular", limit, userId),
        tmdbList(env, "type:show:trending", "trending/tv/week", limit, userId),
        tmdbList(env, "type:show:top_rated", "tv/top_rated", limit, userId),
        tmdbList(env, "type:show:on_the_air", "tv/on_the_air", limit, userId),
      ]);
      return [
        { id: "shows-popular", title: "Popular Shows", subtitle: "Series dominating current conversation.", results: valueOrEmpty(popular) },
        { id: "shows-trending", title: "Trending Shows", subtitle: "High-momentum episodes and seasons.", results: valueOrEmpty(trending) },
        { id: "shows-top-rated", title: "Top Rated Series", subtitle: "Acclaimed masterpieces across all genres.", results: valueOrEmpty(topRated) },
        { id: "shows-on-air", title: "Currently Airing", subtitle: "Shows broadcasting new episodes right now.", results: valueOrEmpty(onTheAir) },
      ].filter((r) => r.results.length > 0);
    }
    case "anime": {
      const [popular, topRated, trending, anilistTrending] = await Promise.allSettled([
        tmdbList(env, "type:anime:popular", "discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc", limit, userId),
        tmdbList(env, "type:anime:top_rated", "discover/tv?with_genres=16&with_original_language=ja&sort_by=vote_average.desc&vote_count.gte=100", limit, userId),
        tmdbList(env, "type:anime:recent", "discover/tv?with_genres=16&with_original_language=ja&air_date.gte=2024-01-01&sort_by=popularity.desc", limit, userId),
        anilistTrendingAnime(env, limit, userId),
      ]);
      return [
        { id: "anime-trending-anilist", title: "Trending on AniList", subtitle: "Top trending community anime right now.", results: valueOrEmpty(anilistTrending) },
        { id: "anime-popular", title: "Popular Anime", subtitle: "Most streamed Japanese animation series.", results: valueOrEmpty(popular).map((r) => ({ ...r, type: "anime" as const })) },
        { id: "anime-top-rated", title: "Top Rated Anime", subtitle: "Highest audience-rated anime classics.", results: valueOrEmpty(topRated).map((r) => ({ ...r, type: "anime" as const })) },
        { id: "anime-recent", title: "New & Recent Seasons", subtitle: "Fresh series and sequels from this year.", results: valueOrEmpty(trending).map((r) => ({ ...r, type: "anime" as const })) },
      ].filter((r) => r.results.length > 0);
    }
    case "game": {
      const nowSec = Math.floor(Date.now() / 1000);
      const [popular, upcoming, topRated] = await Promise.allSettled([
        igdbList(env, "type:game:popular", "sort rating desc; where rating > 80 & rating_count > 100;", limit, userId),
        igdbList(env, "type:game:upcoming", `sort first_release_date asc; where first_release_date > ${nowSec};`, limit, userId),
        igdbList(env, "type:game:hyped", "sort hypes desc; where hypes > 5;", limit, userId),
      ]);
      return [
        { id: "games-popular", title: "Popular Games", subtitle: "Community-rated hits across PC and consoles.", results: valueOrEmpty(popular) },
        { id: "games-upcoming", title: "Upcoming Games", subtitle: "Anticipated titles releasing soon.", results: valueOrEmpty(upcoming) },
        { id: "games-hyped", title: "Most Anticipated", subtitle: "Games with massive player interest.", results: valueOrEmpty(topRated) },
      ].filter((r) => r.results.length > 0);
    }
    case "book": {
      const [fiction, fantasy, mystery] = await Promise.allSettled([
        openLibrarySubject(env, "fiction", limit, userId),
        openLibrarySubject(env, "fantasy", limit, userId),
        openLibrarySubject(env, "mystery", limit, userId),
      ]);
      return [
        { id: "books-fiction", title: "Popular Fiction", subtitle: "Top general and contemporary fiction.", results: valueOrEmpty(fiction) },
        { id: "books-fantasy", title: "Fantasy & Sci-Fi", subtitle: "Epic world-building and futuristic reads.", results: valueOrEmpty(fantasy) },
        { id: "books-mystery", title: "Mystery & Thrillers", subtitle: "Gripping whodunits and page-turners.", results: valueOrEmpty(mystery) },
      ].filter((r) => r.results.length > 0);
    }
    default:
      return [];
  }
}

export async function providerTypeExplore(env: Env, type: MediaType, userId?: string | null): Promise<ProviderResult[]> {
  const rows = await providerTypeExploreRows(env, type, userId);
  return rows.flatMap((r) => r.results);
}
