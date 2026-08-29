import type { MediaType } from "@shared/media";
import { appConstants, externalApiEndpoints, providerNames } from "@shared/constants";

export type ProviderName =
  | "tmdb"
  | "tvmaze"
  | "wikidata"
  | "thetvdb"
  | "jikan"
  | "anilist"
  | "googlebooks"
  | "openlibrary"
  | "igdb"
  | "rawg"
  | "musicbrainz"
  | "coverartarchive"
  | "listenbrainz"
  | "theaudiodb"
  | "lrclib"
  | "gdelt"
  | "guardian"
  | "newsapi"
  | "opensubtitles"
  | "youtube"
  | "local";

export type ProviderAttribution = {
  provider: ProviderName;
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

export const providerAttributions = {
  tmdb: { provider: "tmdb", label: providerNames.tmdb, url: `${externalApiEndpoints.tmdbWeb}/` },
  tvmaze: { provider: "tvmaze", label: providerNames.tvmaze, url: `${externalApiEndpoints.tvmazeWeb}/` },
  wikidata: { provider: "wikidata", label: providerNames.wikidata, url: "https://www.wikidata.org/" },
  thetvdb: { provider: "thetvdb", label: providerNames.thetvdb, url: `${externalApiEndpoints.theTvDbWeb}/` },
  jikan: { provider: "jikan", label: providerNames.jikan, url: `${externalApiEndpoints.myAnimeList}/` },
  anilist: { provider: "anilist", label: providerNames.anilist, url: "https://anilist.co/" },
  googlebooks: { provider: "googlebooks", label: providerNames.googlebooks, url: "https://books.google.com/" },
  openlibrary: { provider: "openlibrary", label: providerNames.openlibrary, url: `${externalApiEndpoints.openLibrary}/` },
  igdb: { provider: "igdb", label: providerNames.igdb, url: `${externalApiEndpoints.igdbWeb}/` },
  rawg: { provider: "rawg", label: providerNames.rawg, url: `${externalApiEndpoints.rawgWeb}/` },
  musicbrainz: { provider: "musicbrainz", label: providerNames.musicbrainz, url: "https://musicbrainz.org/" },
  coverartarchive: { provider: "coverartarchive", label: providerNames.coverartarchive, url: "https://coverartarchive.org/" },
  listenbrainz: { provider: "listenbrainz", label: providerNames.listenbrainz, url: "https://listenbrainz.org/" },
  theaudiodb: { provider: "theaudiodb", label: providerNames.theaudiodb, url: "https://www.theaudiodb.com/" },
  lrclib: { provider: "lrclib", label: providerNames.lrclib, url: "https://lrclib.net/" },
  gdelt: { provider: "gdelt", label: providerNames.gdelt, url: "https://www.gdeltproject.org/" },
  guardian: { provider: "guardian", label: providerNames.guardian, url: "https://www.theguardian.com/" },
  newsapi: { provider: "newsapi", label: providerNames.newsapi, url: "https://newsapi.org/" },
  opensubtitles: { provider: "opensubtitles", label: providerNames.opensubtitles, url: "https://www.opensubtitles.com/" },
  youtube: { provider: "youtube", label: providerNames.youtube, url: `${externalApiEndpoints.youtubeWeb}/` },
  local: { provider: "local", label: appConstants.name, url: appConstants.localAttributionUrl },
} as const satisfies Record<ProviderName, ProviderAttribution>;
