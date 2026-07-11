import type { MediaType } from "@shared/media";

export type ProviderName = "tmdb" | "rawg" | "igdb" | "openlibrary" | "jikan" | "youtube" | "newsapi" | "local";

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
  igdb: { provider: "igdb", label: providerNames.igdb, url: `${externalApiEndpoints.igdbWeb}/` },
  openlibrary: { provider: "openlibrary", label: providerNames.openlibrary, url: `${externalApiEndpoints.openLibrary}/` },
  jikan: { provider: "jikan", label: providerNames.jikan, url: `${externalApiEndpoints.myAnimeList}/` },
  rawg: { provider: "rawg", label: providerNames.rawg, url: `${externalApiEndpoints.rawgWeb}/` },
  youtube: { provider: "youtube", label: providerNames.youtube, url: `${externalApiEndpoints.youtubeWeb}/` },
  newsapi: { provider: "newsapi", label: providerNames.newsapi, url: `${externalApiEndpoints.newsApi}/` },
  local: { provider: "local", label: appConstants.name, url: appConstants.localAttributionUrl },
} as const satisfies Record<ProviderName, ProviderAttribution>;
import { appConstants, externalApiEndpoints, providerNames } from "@shared/constants";
