import { z } from "zod";

export const tvTimeExpectedCounts = {
  shows: 647,
  seasons: 2063,
  episodeRows: 32452,
  watchedEpisodes: 11646,
  watchedSpecials: 111,
  rewatchedEpisodeRows: 332,
  movies: 1050,
  watchedMovies: 658,
} as const;

export type TvTimeCountKey = keyof typeof tvTimeExpectedCounts;

export const tvTimeCountsSchema = z.object({
  shows: z.number().int().nonnegative(),
  seasons: z.number().int().nonnegative(),
  episodeRows: z.number().int().nonnegative(),
  watchedEpisodes: z.number().int().nonnegative(),
  watchedSpecials: z.number().int().nonnegative(),
  rewatchedEpisodeRows: z.number().int().nonnegative(),
  movies: z.number().int().nonnegative(),
  watchedMovies: z.number().int().nonnegative(),
});

export type TvTimeCounts = z.infer<typeof tvTimeCountsSchema>;

export const tvTimeWarningSchema = z.object({
  severity: z.enum(["info", "warning", "error"]),
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(500),
  itemKey: z.string().max(160).optional(),
  details: z.unknown().optional(),
});

export type TvTimeWarning = z.infer<typeof tvTimeWarningSchema>;

export const tvTimeEpisodeSchema = z.object({
  tvdbId: z.string().nullable(),
  imdbId: z.string().nullable(),
  seasonNumber: z.number().int().nonnegative(),
  episodeNumber: z.number().int().min(1),
  name: z.string().nullable(),
  isSpecial: z.boolean(),
  isWatched: z.boolean(),
  watchedAt: z.string().nullable(),
  rewatchCount: z.number().int().nonnegative(),
  watchedCount: z.number().int().nonnegative(),
});
export type TvTimeEpisode = z.infer<typeof tvTimeEpisodeSchema>;

export const tvTimeSeasonSchema = z.object({
  number: z.number().int().nonnegative(),
  isSpecial: z.boolean(),
  episodes: z.array(tvTimeEpisodeSchema).max(600),
});

export const tvTimeShowItemSchema = z.object({
  kind: z.literal("show"),
  itemKey: z.string().min(1).max(160),
  sourceUuid: z.string().nullable(),
  tvdbId: z.string().nullable(),
  imdbId: z.string().nullable(),
  title: z.string().min(1).max(300),
  status: z.string().min(1).max(80),
  createdAt: z.string().nullable(),
  isFavorite: z.boolean(),
  seasons: z.array(tvTimeSeasonSchema).max(200),
  rawStatus: z.string().nullable(),
});
export type TvTimeShowItem = z.infer<typeof tvTimeShowItemSchema>;

export const tvTimeMovieItemSchema = z.object({
  kind: z.literal("movie"),
  itemKey: z.string().min(1).max(160),
  sourceUuid: z.string().nullable(),
  tvdbId: z.string().nullable(),
  imdbId: z.string().nullable(),
  title: z.string().min(1).max(300),
  year: z.number().int().nullable(),
  createdAt: z.string().nullable(),
  watchedAt: z.string().nullable(),
  isWatched: z.boolean(),
  isFavorite: z.boolean(),
  rewatchCount: z.number().int().nonnegative(),
});
export type TvTimeMovieItem = z.infer<typeof tvTimeMovieItemSchema>;

export const tvTimeImportItemSchema = z.discriminatedUnion("kind", [tvTimeShowItemSchema, tvTimeMovieItemSchema]);
export type TvTimeImportItem = z.infer<typeof tvTimeImportItemSchema>;

export const createImportJobSchema = z.object({
  fileNames: z.array(z.string().min(1).max(260)).min(1).max(40),
  counts: tvTimeCountsSchema.optional(),
});

export const dryRunImportJobSchema = z.object({
  counts: tvTimeCountsSchema,
  warnings: z.array(tvTimeWarningSchema).max(500),
});

export const uploadImportChunkSchema = z.object({
  chunkIndex: z.number().int().nonnegative(),
  items: z.array(tvTimeImportItemSchema).min(1).max(50),
});

export type TvTimeImportSummary = {
  counts: TvTimeCounts;
  warnings: TvTimeWarning[];
  items: TvTimeImportItem[];
  fileNames: string[];
};

export function emptyTvTimeCounts(): TvTimeCounts {
  return {
    shows: 0,
    seasons: 0,
    episodeRows: 0,
    watchedEpisodes: 0,
    watchedSpecials: 0,
    rewatchedEpisodeRows: 0,
    movies: 0,
    watchedMovies: 0,
  };
}

export function compareTvTimeCounts(counts: TvTimeCounts): TvTimeWarning[] {
  return (Object.keys(tvTimeExpectedCounts) as TvTimeCountKey[])
    .filter((key) => counts[key] !== tvTimeExpectedCounts[key])
    .map((key) => ({
      severity: "warning" as const,
      code: "count_mismatch",
      message: `${key} detected as ${counts[key].toLocaleString()} but expected ${tvTimeExpectedCounts[key].toLocaleString()}.`,
      details: { key, detected: counts[key], expected: tvTimeExpectedCounts[key] },
    }));
}
