import { z } from "zod";
import type { MediaType } from "./media";
import { dashboardKinds, dashboardConfigForKind } from "./media-config";

export const dashboardKindSchema = z.enum(dashboardKinds);
export type DashboardKind = z.infer<typeof dashboardKindSchema>;

export type DashboardEntry = {
  mediaId: string;
  type: MediaType;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  airStatus: string | null;
  releaseDate: string | null;
  year: number | null;
  status: string;
  isFavorite: boolean;
  rating: number | null;
  progressEpisodes: number;
  progressValue: number | null;
  progressTotal: number | null;
  progressUnit: string | null;
  platform: string | null;
  startedAt: string | null;
  purchaseLibrary: string | null;
  updatedAt: string;
  totalRegularEpisodes: number;
  nextEpisode: {
    id: string;
    name: string | null;
    seasonNumber: number;
    episodeNumber: number;
    airDate: string | null;
  } | null;
};

export type DashboardSection = {
  id: string;
  label: string;
  entries: DashboardEntry[];
};

const future = (date: string | null, now: Date) => Boolean(date && new Date(`${date}T00:00:00Z`) > now);

export function buildDashboardSections(kind: DashboardKind, entries: DashboardEntry[], now = new Date()): DashboardSection[] {
  const all = [...entries];
  if (kind === "shows" || kind === "anime") {
    const config = dashboardConfigForKind(kind);
    return [
      { id: "watch-next", label: "Watch Next", entries: all.filter((entry) => entry.nextEpisode && !future(entry.nextEpisode.airDate, now)) },
      { id: "continue-watching", label: "Continue Watching", entries: all.filter((entry) => entry.progressEpisodes > 0 && entry.nextEpisode) },
      {
        id: "away",
        label: "Haven't Watched For A While",
        entries: all.filter((entry) => entry.status === "watching" && now.getTime() - new Date(entry.updatedAt).getTime() >= 30 * 86_400_000),
      },
      { id: "watch-later", label: "Watch Later", entries: all.filter((entry) => ["watch_later", "not_started"].includes(entry.status)) },
      { id: "upcoming", label: "Upcoming", entries: all.filter((entry) => future(entry.nextEpisode?.airDate ?? entry.releaseDate, now)) },
      { id: "up-to-date", label: "Up To Date", entries: all.filter((entry) => ["up_to_date", "completed"].includes(entry.status)) },
      { id: "stopped", label: "Stopped", entries: all.filter((entry) => entry.status === "stopped") },
      { id: "all", label: `All ${config.pluralLabel}`, entries: all },
    ];
  }

  if (kind === "movies") {
    return [
      { id: "watchlist", label: "Watchlist", entries: all.filter((entry) => entry.status === "watch_later" && !future(entry.releaseDate, now)) },
      { id: "watched", label: "Watched", entries: all.filter((entry) => entry.status === "watched") },
      { id: "favorites", label: "Favorites", entries: all.filter((entry) => entry.isFavorite) },
      { id: "upcoming", label: "Upcoming", entries: all.filter((entry) => future(entry.releaseDate, now)) },
      { id: "all", label: "All Movies", entries: all },
    ];
  }

  if (kind === "books") {
    return [
      { id: "reading", label: "Reading Now", entries: all.filter((entry) => entry.status === "reading") },
      { id: "want-to-read", label: "Want To Read", entries: all.filter((entry) => entry.status === "want_to_read") },
      { id: "finished", label: "Finished", entries: all.filter((entry) => entry.status === "finished") },
      { id: "upcoming", label: "Upcoming", entries: all.filter((entry) => future(entry.releaseDate, now)) },
      { id: "favorites", label: "Favorites", entries: all.filter((entry) => entry.isFavorite) },
      { id: "dropped", label: "Dropped", entries: all.filter((entry) => entry.status === "dropped") },
      { id: "all", label: "All Books", entries: all },
    ];
  }

  return [
    { id: "playing", label: "Playing Now", entries: all.filter((entry) => entry.status === "playing") },
    { id: "planned", label: "Backlog", entries: all.filter((entry) => entry.status === "planned") },
    { id: "completed", label: "Completed", entries: all.filter((entry) => entry.status === "completed") },
    { id: "upcoming", label: "Upcoming", entries: all.filter((entry) => future(entry.releaseDate, now)) },
    { id: "favorites", label: "Favorites", entries: all.filter((entry) => entry.isFavorite) },
    { id: "dropped", label: "Dropped", entries: all.filter((entry) => entry.status === "dropped") },
    { id: "all", label: "All Games", entries: all },
  ];
}
