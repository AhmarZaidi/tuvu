export const appConstants = {
  name: "Tuvu",
  localAttributionUrl: "/",
} as const;

export const externalApiEndpoints = {
  githubAuthorize: "https://github.com/login/oauth/authorize",
  githubToken: "https://github.com/login/oauth/access_token",
  githubUser: "https://api.github.com/user",
  tmdbApi: "https://api.themoviedb.org/3",
  tmdbWeb: "https://www.themoviedb.org",
  tmdbImage: "https://image.tmdb.org/t/p",
  twitchOAuthToken: "https://id.twitch.tv/oauth2/token",
  igdbGames: "https://api.igdb.com/v4/games",
  igdbWeb: "https://www.igdb.com",
  igdbImage: "https://images.igdb.com/igdb/image/upload",
  rawgApi: "https://api.rawg.io/api",
  rawgWeb: "https://rawg.io",
  openLibrary: "https://openlibrary.org",
  openLibraryCovers: "https://covers.openlibrary.org",
  jikanApi: "https://api.jikan.moe/v4",
  myAnimeList: "https://myanimelist.net",
  youtubeWeb: "https://www.youtube.com",
  newsApi: "https://newsapi.org/v2",
} as const;

export const providerNames = {
  tmdb: "TMDB",
  igdb: "IGDB",
  rawg: "RAWG",
  openlibrary: "Open Library",
  jikan: "MyAnimeList (Jikan)",
  youtube: "YouTube",
  newsapi: "NewsAPI",
  local: appConstants.name,
} as const;

export const uiConstants = {
  cacheStoragePrefix: "tuvu-query:",
  themeStorageKey: "tuvu-theme",
  noticeEventName: "tuvu:notice",
  defaultPosterAccent: "linear-gradient(145deg, #30343b, #111318)",
} as const;

export const designTokenNames = {
  colorBg: "--color-bg",
  colorText: "--color-text",
  colorAccent: "--color-accent",
  radiusCard: "--radius-card",
  shellTopbarHeight: "--shell-topbar-height",
  shellBottomNavHeight: "--shell-bottom-nav-height",
} as const;
