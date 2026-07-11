import type { MediaType } from "./media";

const animationGenreIds = new Set([16]);
const animationGenreNames = new Set(["animation", "animated", "anime"]);
const animeLanguageCodes = new Set(["ja", "ja-jp", "zh", "zh-cn", "zh-tw", "ko", "ko-kr"]);
const cartoonLanguageCodes = new Set(["en", "en-us", "en-gb", "en-ca", "en-au"]);

export type MediaClassificationInput = {
  type?: MediaType | "tv" | null;
  genreIds?: readonly number[] | null;
  genres?: readonly (string | { id?: number | null; name?: string | null })[] | null;
  originalLanguage?: string | null;
  primaryLanguage?: string | null;
  language?: string | null;
  category?: string | null;
  anime?: boolean | null;
};

export type MediaClassification = {
  isAnimated: boolean;
  isAnime: boolean;
  isCartoon: boolean;
  suggestedType: MediaType | null;
  tags: string[];
};

export function classifyMedia(input: MediaClassificationInput): MediaClassification {
  const language = normalizeLanguage(input.originalLanguage ?? input.primaryLanguage ?? input.language);
  const explicitAnime = input.anime === true || input.category?.toLowerCase() === "anime";
  const isAnimated = explicitAnime || hasAnimationGenre(input.genreIds, input.genres);
  const isAnime = explicitAnime || (isAnimated && Boolean(language && animeLanguageCodes.has(language)));
  const isCartoon = isAnimated && !isAnime && Boolean(language && cartoonLanguageCodes.has(language));
  const providerType = input.type === "tv" ? "show" : input.type ?? null;
  const suggestedType: MediaType | null = isAnime ? "anime" : providerType;
  const tags = [
    isAnimated ? "animated" : null,
    isAnime ? "anime" : null,
    isCartoon ? "cartoon" : null,
  ].filter((tag): tag is string => Boolean(tag));

  return { isAnimated, isAnime, isCartoon, suggestedType, tags };
}

function hasAnimationGenre(genreIds?: readonly number[] | null, genres?: MediaClassificationInput["genres"]) {
  if (genreIds?.some((id) => animationGenreIds.has(id))) return true;
  return Boolean(genres?.some((genre) => {
    if (typeof genre === "string") return animationGenreNames.has(genre.trim().toLowerCase());
    if (genre.id != null && animationGenreIds.has(genre.id)) return true;
    return Boolean(genre.name && animationGenreNames.has(genre.name.trim().toLowerCase()));
  }));
}

function normalizeLanguage(language?: string | null) {
  return language?.trim().toLowerCase().replace("_", "-") || null;
}
