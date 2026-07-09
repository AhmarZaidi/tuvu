import { describe, expect, it } from "vitest";
import {
  validateStatus,
  defaultStatus,
  allowedStatuses,
  calculateProgress,
  isSpoilerGated,
  nextEpisodeToWatch,
} from "@worker/media-logic";

// ─────────────────────────────────────────────────────────────
// Status Validation
// ─────────────────────────────────────────────────────────────
describe("validateStatus", () => {
  it("accepts all valid show statuses", () => {
    for (const status of ["watch_later", "not_started", "watching", "up_to_date", "completed", "stopped"]) {
      expect(validateStatus("show", status)).toBe(true);
    }
  });

  it("accepts all valid anime statuses (same as show)", () => {
    for (const status of ["watch_later", "not_started", "watching", "up_to_date", "completed", "stopped"]) {
      expect(validateStatus("anime", status)).toBe(true);
    }
  });

  it("accepts valid movie statuses", () => {
    expect(validateStatus("movie", "watch_later")).toBe(true);
    expect(validateStatus("movie", "watched")).toBe(true);
  });

  it("accepts valid game statuses", () => {
    for (const status of ["planned", "playing", "completed", "paused", "dropped"]) {
      expect(validateStatus("game", status)).toBe(true);
    }
  });

  it("accepts valid book statuses", () => {
    for (const status of ["want_to_read", "reading", "finished", "paused", "dropped"]) {
      expect(validateStatus("book", status)).toBe(true);
    }
  });

  it("rejects a show status on a movie", () => {
    expect(validateStatus("movie", "watching")).toBe(false);
    expect(validateStatus("movie", "up_to_date")).toBe(false);
  });

  it("rejects a movie status on a show", () => {
    expect(validateStatus("show", "watched")).toBe(false);
  });

  it("rejects a book status on a game", () => {
    expect(validateStatus("game", "want_to_read")).toBe(false);
  });

  it("rejects completely unknown status", () => {
    expect(validateStatus("show", "nonsense")).toBe(false);
    expect(validateStatus("movie", "")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Default Status
// ─────────────────────────────────────────────────────────────
describe("defaultStatus", () => {
  it("returns not_started for shows and anime", () => {
    expect(defaultStatus("show")).toBe("not_started");
    expect(defaultStatus("anime")).toBe("not_started");
  });

  it("returns watch_later for movies", () => {
    expect(defaultStatus("movie")).toBe("watch_later");
  });

  it("returns planned for games", () => {
    expect(defaultStatus("game")).toBe("planned");
  });

  it("returns want_to_read for books", () => {
    expect(defaultStatus("book")).toBe("want_to_read");
  });
});

// ─────────────────────────────────────────────────────────────
// Allowed Statuses
// ─────────────────────────────────────────────────────────────
describe("allowedStatuses", () => {
  it("returns 6 statuses for shows", () => {
    expect(allowedStatuses("show")).toHaveLength(6);
  });

  it("returns 2 statuses for movies", () => {
    expect(allowedStatuses("movie")).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────
// Progress Calculation
// ─────────────────────────────────────────────────────────────
describe("calculateProgress", () => {
  const eps = (ids: string[], specialIds: string[] = []) => [
    ...ids.map((id) => ({ id, isSpecial: false })),
    ...specialIds.map((id) => ({ id, isSpecial: true })),
  ];

  const act = (watched: string[], unwatched: string[] = []) => [
    ...watched.map((episodeId) => ({ episodeId, watched: true })),
    ...unwatched.map((episodeId) => ({ episodeId, watched: false })),
  ];

  it("returns zero progress when no episodes", () => {
    const result = calculateProgress([], []);
    expect(result).toEqual({ watched: 0, total: 0, specials: 0, specialsWatched: 0, percent: 0 });
  });

  it("returns zero progress when no activity", () => {
    const result = calculateProgress(eps(["e1", "e2", "e3"]), []);
    expect(result.watched).toBe(0);
    expect(result.total).toBe(3);
    expect(result.percent).toBe(0);
  });

  it("calculates partial progress correctly", () => {
    const result = calculateProgress(eps(["e1", "e2", "e3", "e4"]), act(["e1", "e2"]));
    expect(result.watched).toBe(2);
    expect(result.total).toBe(4);
    expect(result.percent).toBe(50);
  });

  it("calculates 100% progress when all regular episodes watched", () => {
    const result = calculateProgress(eps(["e1", "e2"]), act(["e1", "e2"]));
    expect(result.watched).toBe(2);
    expect(result.total).toBe(2);
    expect(result.percent).toBe(100);
  });

  it("excludes specials from regular progress", () => {
    const result = calculateProgress(
      eps(["e1", "e2"], ["sp1", "sp2"]),
      act(["e1", "sp1", "sp2"]),
    );
    expect(result.watched).toBe(1);  // only e1 counts
    expect(result.total).toBe(2);    // e1 + e2
    expect(result.percent).toBe(50);
    expect(result.specials).toBe(2);
    expect(result.specialsWatched).toBe(2);
  });

  it("counts watched specials separately", () => {
    const result = calculateProgress(eps(["e1"], ["sp1"]), act(["sp1"]));
    expect(result.watched).toBe(0);           // e1 not watched
    expect(result.specialsWatched).toBe(1);   // sp1 watched
    expect(result.percent).toBe(0);
  });

  it("ignores activity with watched=false", () => {
    const result = calculateProgress(eps(["e1", "e2"]), act(["e1"], ["e2"]));
    expect(result.watched).toBe(1);
    expect(result.percent).toBe(50);
  });

  it("caps percent at 100", () => {
    // Edge case: more activity than episodes (shouldn't happen but should be safe)
    const result = calculateProgress(eps(["e1"]), act(["e1", "e2"]));
    expect(result.percent).toBeLessThanOrEqual(100);
  });
});

// ─────────────────────────────────────────────────────────────
// Spoiler Gate
// ─────────────────────────────────────────────────────────────
describe("isSpoilerGated", () => {
  it("returns true when episode is not watched", () => {
    expect(isSpoilerGated("ep1", new Set(["ep2"]))).toBe(true);
  });

  it("returns false when episode is watched", () => {
    expect(isSpoilerGated("ep1", new Set(["ep1", "ep2"]))).toBe(false);
  });

  it("returns true for empty watched set", () => {
    expect(isSpoilerGated("ep1", new Set())).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Next Episode To Watch
// ─────────────────────────────────────────────────────────────
describe("nextEpisodeToWatch", () => {
  const ep = (id: string, s: number, e: number, isSpecial = false) => ({
    id,
    seasonNumber: s,
    episodeNumber: e,
    isSpecial,
  });

  it("returns null when all episodes watched", () => {
    const episodes = [ep("e1", 1, 1), ep("e2", 1, 2)];
    expect(nextEpisodeToWatch(episodes, new Set(["e1", "e2"]))).toBeNull();
  });

  it("returns null for empty episode list", () => {
    expect(nextEpisodeToWatch([], new Set())).toBeNull();
  });

  it("returns first episode when nothing watched", () => {
    const episodes = [ep("e2", 1, 2), ep("e1", 1, 1)]; // out of order
    expect(nextEpisodeToWatch(episodes, new Set())?.id).toBe("e1");
  });

  it("skips watched episodes", () => {
    const episodes = [ep("e1", 1, 1), ep("e2", 1, 2), ep("e3", 1, 3)];
    expect(nextEpisodeToWatch(episodes, new Set(["e1", "e2"]))?.id).toBe("e3");
  });

  it("skips specials", () => {
    const episodes = [ep("sp", 0, 1, true), ep("e1", 1, 1), ep("e2", 1, 2)];
    expect(nextEpisodeToWatch(episodes, new Set())?.id).toBe("e1");
  });

  it("returns cross-season next episode correctly", () => {
    const episodes = [ep("e1", 1, 1), ep("e2", 1, 2), ep("e3", 2, 1)];
    expect(nextEpisodeToWatch(episodes, new Set(["e1", "e2"]))?.id).toBe("e3");
  });

  it("handles rewatch scenarios (all watched)", () => {
    const episodes = [ep("e1", 1, 1)];
    expect(nextEpisodeToWatch(episodes, new Set(["e1"]))).toBeNull();
  });
});
