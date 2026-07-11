import type { MediaType } from "@shared/media";

export type ProviderName = "tmdb" | "rawg" | "igdb" | "openlibrary" | "jikan" | "youtube" | "local";

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
  tmdb: { provider: "tmdb", label: "TMDB", url: "https://www.themoviedb.org/" },
  igdb: { provider: "igdb", label: "IGDB", url: "https://www.igdb.com/" },
  openlibrary: { provider: "openlibrary", label: "Open Library", url: "https://openlibrary.org/" },
  jikan: { provider: "jikan", label: "MyAnimeList (Jikan)", url: "https://myanimelist.net/" },
  rawg: { provider: "rawg", label: "RAWG", url: "https://rawg.io/" },
  youtube: { provider: "youtube", label: "YouTube", url: "https://www.youtube.com/" },
  local: { provider: "local", label: "Tuvu", url: "/" },
} as const satisfies Record<ProviderName, ProviderAttribution>;
