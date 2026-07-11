import type { AnyStatus, MediaType } from "./media";

export const dashboardKinds = ["shows", "anime", "movies", "books", "games"] as const;
export type MediaDashboardKind = typeof dashboardKinds[number];

export type MediaTypeConfig = {
  type: MediaType;
  route: string;
  label: string;
  pluralLabel: string;
  icon: "tv" | "flame" | "film" | "book" | "gamepad";
  dashboardKind: MediaDashboardKind;
  defaultStatus: AnyStatus;
  statuses: readonly AnyStatus[];
  detailTemplate: "series" | "movie" | "book" | "game";
  searchable: boolean;
  trackable: boolean;
};

export const mediaTypeConfigs = [
  {
    type: "show",
    route: "/shows",
    label: "Show",
    pluralLabel: "Shows",
    icon: "tv",
    dashboardKind: "shows",
    defaultStatus: "not_started",
    statuses: ["watch_later", "not_started", "watching", "up_to_date", "completed", "stopped"],
    detailTemplate: "series",
    searchable: true,
    trackable: true,
  },
  {
    type: "anime",
    route: "/anime",
    label: "Anime",
    pluralLabel: "Anime",
    icon: "flame",
    dashboardKind: "anime",
    defaultStatus: "not_started",
    statuses: ["watch_later", "not_started", "watching", "up_to_date", "completed", "stopped"],
    detailTemplate: "series",
    searchable: true,
    trackable: true,
  },
  {
    type: "movie",
    route: "/movies",
    label: "Movie",
    pluralLabel: "Movies",
    icon: "film",
    dashboardKind: "movies",
    defaultStatus: "watch_later",
    statuses: ["watch_later", "watched"],
    detailTemplate: "movie",
    searchable: true,
    trackable: true,
  },
  {
    type: "book",
    route: "/books",
    label: "Book",
    pluralLabel: "Books",
    icon: "book",
    dashboardKind: "books",
    defaultStatus: "want_to_read",
    statuses: ["want_to_read", "reading", "finished", "dropped"],
    detailTemplate: "book",
    searchable: true,
    trackable: true,
  },
  {
    type: "game",
    route: "/games",
    label: "Game",
    pluralLabel: "Games",
    icon: "gamepad",
    dashboardKind: "games",
    defaultStatus: "planned",
    statuses: ["planned", "playing", "completed", "dropped"],
    detailTemplate: "game",
    searchable: true,
    trackable: true,
  },
] as const satisfies readonly MediaTypeConfig[];

export const navPageConfigs = [
  { id: "shows", route: "/shows", label: "Shows", icon: "tv", dashboardKind: "shows", mediaType: "show" },
  { id: "anime", route: "/anime", label: "Anime", icon: "flame", dashboardKind: "anime", mediaType: "anime" },
  { id: "movies", route: "/movies", label: "Movies", icon: "film", dashboardKind: "movies", mediaType: "movie" },
  { id: "explore", route: "/explore", label: "Explore", icon: "compass" },
  { id: "books", route: "/books", label: "Books", icon: "book", dashboardKind: "books", mediaType: "book" },
  { id: "youtube", route: "/youtube", label: "YouTube", icon: "youtube", placeholder: true },
  { id: "games", route: "/games", label: "Games", icon: "gamepad", dashboardKind: "games", mediaType: "game" },
] as const;

export const searchableMediaTypes = mediaTypeConfigs.filter((config) => config.searchable).map((config) => config.type);
export const trackableMediaTypes = mediaTypeConfigs.filter((config) => config.trackable).map((config) => config.type);
export const dashboardMediaConfigs = mediaTypeConfigs.filter((config) => dashboardKinds.includes(config.dashboardKind));
export const allMediaStatuses = Array.from(new Set(mediaTypeConfigs.flatMap((config) => config.statuses)));

export function mediaConfigForType(type: MediaType): MediaTypeConfig {
  return mediaTypeConfigs.find((config) => config.type === type) ?? mediaTypeConfigs[0];
}

export function dashboardConfigForKind(kind: MediaDashboardKind): MediaTypeConfig {
  return mediaTypeConfigs.find((config) => config.dashboardKind === kind) ?? mediaTypeConfigs[0];
}

export function mediaTypesForDashboardKind(kind: MediaDashboardKind): MediaType[] {
  return [dashboardConfigForKind(kind).type];
}

export function statusOptionsForMediaType(type: MediaType): readonly AnyStatus[] {
  return mediaConfigForType(type).statuses;
}

export function formatStatusLabel(status: string): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
