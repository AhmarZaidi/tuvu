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
  year: z.number().int().min(1888).max(2100).optional(),
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "releaseDate must be YYYY-MM-DD.").optional(),
  runtimeMinutes: z.number().int().positive().optional(),
  language: z.string().max(10).optional(),
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

// ─────────────────────────────────────────────────────────────
// TypeScript types
// ─────────────────────────────────────────────────────────────
export type CreateMediaInput = z.infer<typeof createMediaSchema>;
export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;
export type CreateEpisodeInput = z.infer<typeof createEpisodeSchema>;
