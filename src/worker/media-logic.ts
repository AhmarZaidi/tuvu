import type { MediaType, AnyStatus } from "@shared/media";

// ─────────────────────────────────────────────────────────────
// Status Validation
// ─────────────────────────────────────────────────────────────
const STATUS_MAP: Record<MediaType, readonly AnyStatus[]> = {
  show:  ["watch_later", "not_started", "watching", "up_to_date", "completed", "stopped"],
  anime: ["watch_later", "not_started", "watching", "up_to_date", "completed", "stopped"],
  movie: ["watch_later", "watched"],
  game:  ["planned", "playing", "completed", "paused", "dropped"],
  book:  ["want_to_read", "reading", "finished", "paused", "dropped"],
};

const DEFAULT_STATUS: Record<MediaType, AnyStatus> = {
  show:  "not_started",
  anime: "not_started",
  movie: "watch_later",
  game:  "planned",
  book:  "want_to_read",
};

export function validateStatus(type: MediaType, status: string): status is AnyStatus {
  return (STATUS_MAP[type] as string[]).includes(status);
}

export function defaultStatus(type: MediaType): AnyStatus {
  return DEFAULT_STATUS[type];
}

export function allowedStatuses(type: MediaType): readonly AnyStatus[] {
  return STATUS_MAP[type];
}

// ─────────────────────────────────────────────────────────────
// Progress Calculation
// Regular episodes (non-special) define progress; specials counted separately
// ─────────────────────────────────────────────────────────────
export type EpisodeSummary = {
  id: string;
  isSpecial: boolean;
};

export type ActivitySummary = {
  episodeId: string;
  watched: boolean;
};

export type ProgressResult = {
  watched: number;
  total: number;
  specials: number;
  specialsWatched: number;
  percent: number;
};

export function calculateProgress(
  episodes: EpisodeSummary[],
  activity: ActivitySummary[],
): ProgressResult {
  const watchedSet = new Set(activity.filter((a) => a.watched).map((a) => a.episodeId));
  const regular = episodes.filter((e) => !e.isSpecial);
  const specials = episodes.filter((e) => e.isSpecial);
  const watchedRegular = regular.filter((e) => watchedSet.has(e.id)).length;
  const watchedSpecials = specials.filter((e) => watchedSet.has(e.id)).length;
  const total = regular.length;
  const percent = total === 0 ? 0 : Math.min(100, Math.round((watchedRegular / total) * 100));

  return {
    watched: watchedRegular,
    total,
    specials: specials.length,
    specialsWatched: watchedSpecials,
    percent,
  };
}

// ─────────────────────────────────────────────────────────────
// Spoiler Gate
// A comment/reaction is spoiler-gated if the user hasn't watched the episode
// ─────────────────────────────────────────────────────────────
export function isSpoilerGated(episodeId: string, watchedEpisodeIds: Set<string>): boolean {
  return !watchedEpisodeIds.has(episodeId);
}

// ─────────────────────────────────────────────────────────────
// Next Episode
// First unwatched non-special episode in order
// ─────────────────────────────────────────────────────────────
export type EpisodeWithOrder = {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  isSpecial: boolean;
};

export function nextEpisodeToWatch(
  episodes: EpisodeWithOrder[],
  watchedEpisodeIds: Set<string>,
): EpisodeWithOrder | null {
  const regular = episodes
    .filter((e) => !e.isSpecial)
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);

  return regular.find((e) => !watchedEpisodeIds.has(e.id)) ?? null;
}
