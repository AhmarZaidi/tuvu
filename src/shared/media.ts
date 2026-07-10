import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Media Types
// ─────────────────────────────────────────────────────────────
export const mediaTypeSchema = z.enum(["show", "movie", "anime", "game", "book"]);
export type MediaType = z.infer<typeof mediaTypeSchema>;

// ─────────────────────────────────────────────────────────────
// Status Schemas (per media type)
// ─────────────────────────────────────────────────────────────
export const showStatusSchema = z.enum(["watch_later", "not_started", "watching", "up_to_date", "completed", "stopped"]);
export const movieStatusSchema = z.enum(["watch_later", "watched"]);
export const gameStatusSchema = z.enum(["planned", "playing", "completed", "paused", "dropped"]);
export const bookStatusSchema = z.enum(["want_to_read", "reading", "finished", "paused", "dropped"]);

export type ShowStatus = z.infer<typeof showStatusSchema>;
export type MovieStatus = z.infer<typeof movieStatusSchema>;
export type GameStatus = z.infer<typeof gameStatusSchema>;
export type BookStatus = z.infer<typeof bookStatusSchema>;

export const anyStatusSchema = z.union([showStatusSchema, movieStatusSchema, gameStatusSchema, bookStatusSchema]);
export type AnyStatus = z.infer<typeof anyStatusSchema>;

// ─────────────────────────────────────────────────────────────
// Media Item Schemas
// ─────────────────────────────────────────────────────────────
export const createMediaSchema = z.object({
  type: mediaTypeSchema,
  title: z.string().trim().min(1, "Title is required.").max(500),
  overview: z.string().max(2000).optional(),
  posterPath: z.string().max(500).optional(),
  backdropPath: z.string().max(500).optional(),
  airStatus: z.enum(["ended", "continuing", "upcoming", "released", "cancelled"]).optional(),
  year: z.number().int().min(1888).max(2100).optional(),
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "releaseDate must be YYYY-MM-DD.").optional(),
  runtimeMinutes: z.number().int().positive().optional(),
  language: z.string().max(10).optional(),
  country: z.string().max(10).optional(),
  source: z.enum(["manual", "tmdb", "rawg", "openlibrary", "tvdb"]).default("manual"),
  sourceId: z.string().max(200).optional(),
});

export const createSeasonSchema = z.object({
  seasonNumber: z.number().int().min(0),
  name: z.string().max(300).optional(),
  overview: z.string().max(2000).optional(),
  episodeCount: z.number().int().nonnegative().optional(),
  airDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isSpecial: z.boolean().default(false),
});

export const createEpisodeSchema = z.object({
  seasonNumber: z.number().int().min(0),
  episodeNumber: z.number().int().min(1),
  name: z.string().max(300).optional(),
  overview: z.string().max(2000).optional(),
  airDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  runtimeMinutes: z.number().int().positive().optional(),
  isSpecial: z.boolean().default(false),
  externalId: z.string().max(200).optional(),
});

// ─────────────────────────────────────────────────────────────
// Library Schemas
// ─────────────────────────────────────────────────────────────
export const addToLibrarySchema = z.object({
  status: anyStatusSchema.optional(),
});

export const updateStatusSchema = z.object({
  status: anyStatusSchema,
});

export const updateRatingSchema = z.object({
  rating: z.number().int().min(1).max(10).nullable(),
});

export const updateNotesSchema = z.object({
  notes: z.string().max(5000).nullable(),
});

export const mediaUnitKindSchema = z.enum(["part", "chapter", "act", "mission", "quest"]);
export const createMediaUnitSchema = z.object({
  parentId: z.string().max(100).nullable().optional(),
  kind: mediaUnitKindSchema,
  position: z.number().int().min(1),
  title: z.string().trim().max(300).optional(),
  overview: z.string().max(2000).optional(),
  imagePath: z.string().max(500).optional(),
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  externalId: z.string().max(200).optional(),
});

export const updateUnitActivitySchema = z.object({
  completed: z.boolean().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  rating: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const updateMediaProgressSchema = z.object({
  value: z.number().nonnegative().nullable(),
  total: z.number().positive().nullable().optional(),
  unit: z.enum(["page", "percent", "hour", "chapter", "mission"]).nullable().optional(),
  platform: z.string().trim().max(100).nullable().optional(),
}).refine((data) => data.value === null || data.total == null || data.value <= data.total, { message: "Progress cannot exceed the total." });

export const updateFavoriteSchema = z.object({
  isFavorite: z.boolean(),
});

export const markMovieWatchedSchema = z.object({
  watchedAt: z.string().datetime({ message: "watchedAt must be an ISO date-time string." }).optional(),
});

// ─────────────────────────────────────────────────────────────
// Episode Schemas
// ─────────────────────────────────────────────────────────────
export const markEpisodeWatchedSchema = z.object({
  watchedAt: z.string().datetime().optional(),
});

export const bulkSeasonWatchedSchema = z.object({
  watched: z.boolean(),
  watchedAt: z.string().datetime().optional(),
  mode: z.enum(["not_watched", "watched_once", "rewatched"]).optional(),
});

export const updateEpisodeActivitySchema = z.object({
  watched: z.boolean().optional(),
  watchedAt: z.string().datetime().nullable().optional(),
  rewatchCount: z.number().int().nonnegative().optional(),
  rating: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

// ─────────────────────────────────────────────────────────────
// TypeScript types
// ─────────────────────────────────────────────────────────────
export type CreateMediaInput = z.infer<typeof createMediaSchema>;
export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;
export type CreateEpisodeInput = z.infer<typeof createEpisodeSchema>;
