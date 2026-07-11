import { describe, expect, it } from "vitest";
import { buildDashboardSections, type DashboardEntry } from "@shared/dashboard";

const base: DashboardEntry = {
  mediaId: "med_1", type: "show", title: "Example", overview: null, posterPath: null, backdropPath: null,
  airStatus: "continuing", releaseDate: "2020-01-01", year: 2020, status: "watching", isFavorite: false,
  rating: null, progressEpisodes: 2, updatedAt: "2025-01-01T00:00:00.000Z", totalRegularEpisodes: 10,
  progressValue: null, progressTotal: null, progressUnit: null, platform: null, startedAt: null, purchaseLibrary: null,
  nextEpisode: { id: "epi_3", name: "Third", seasonNumber: 1, episodeNumber: 3, airDate: "2025-01-01" },
};

describe("dashboard section classification", () => {
  it("classifies a stale active show without removing it from all shows", () => {
    const sections = buildDashboardSections("shows", [base], new Date("2026-07-10T00:00:00.000Z"));
    expect(sections.find((section) => section.id === "watch-next")?.entries).toHaveLength(1);
    expect(sections.find((section) => section.id === "continue-watching")?.entries).toHaveLength(1);
    expect(sections.find((section) => section.id === "away")?.entries).toHaveLength(1);
    expect(sections.find((section) => section.id === "all")?.entries).toHaveLength(1);
  });

  it("separates movie watchlist, watched, favorites, and upcoming", () => {
    const movies: DashboardEntry[] = [
      { ...base, mediaId: "watch", type: "movie", status: "watch_later", progressEpisodes: 0, totalRegularEpisodes: 0, nextEpisode: null },
      { ...base, mediaId: "done", type: "movie", status: "watched", isFavorite: true, progressEpisodes: 0, totalRegularEpisodes: 0, nextEpisode: null },
      { ...base, mediaId: "future", type: "movie", status: "watch_later", releaseDate: "2027-01-01", progressEpisodes: 0, totalRegularEpisodes: 0, nextEpisode: null },
    ];
    const sections = buildDashboardSections("movies", movies, new Date("2026-07-10T00:00:00.000Z"));
    expect(sections.find((section) => section.id === "watchlist")?.entries.map((entry) => entry.mediaId)).toEqual(["watch"]);
    expect(sections.find((section) => section.id === "watched")?.entries.map((entry) => entry.mediaId)).toEqual(["done"]);
    expect(sections.find((section) => section.id === "favorites")?.entries.map((entry) => entry.mediaId)).toEqual(["done"]);
    expect(sections.find((section) => section.id === "upcoming")?.entries.map((entry) => entry.mediaId)).toEqual(["future"]);
  });

  it("provides complete books and games section sets", () => {
    expect(buildDashboardSections("books", [], new Date()).map((section) => section.id)).toEqual(["reading", "want-to-read", "finished", "upcoming", "favorites", "paused", "all"]);
    expect(buildDashboardSections("games", [], new Date()).map((section) => section.id)).toEqual(["playing", "planned", "completed", "upcoming", "favorites", "paused", "all"]);
  });

  it("includes upcoming books by release date", () => {
    const sections = buildDashboardSections("books", [
      { ...base, mediaId: "future-book", type: "book", status: "want_to_read", releaseDate: "2027-01-01", nextEpisode: null },
    ], new Date("2026-07-10T00:00:00.000Z"));
    expect(sections.find((section) => section.id === "upcoming")?.entries.map((entry) => entry.mediaId)).toEqual(["future-book"]);
  });
});
