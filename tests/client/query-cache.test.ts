import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryCache, queryKeys } from "@client/api/query-cache";

describe("client query cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T00:00:00.000Z"));
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("stores dashboard data by user, version, and dashboard kind", () => {
    const cache = new QueryCache();
    cache.set(queryKeys.dashboard("usr_1", 4, "shows"), { total: 10 }, { ttlMs: 1000, persist: true });

    expect(cache.get<{ total: number }>(queryKeys.dashboard("usr_1", 4, "shows"))?.total).toBe(10);
    expect(cache.get(queryKeys.dashboard("usr_1", 5, "shows"))).toBeNull();
    expect(cache.get(queryKeys.dashboard("usr_2", 4, "shows"))).toBeNull();
  });

  it("hydrates persisted entries and expires stale records", () => {
    const first = new QueryCache();
    first.set(queryKeys.exploreSearch("usr_1", 2, "gullak", ["show"]), { results: ["cached"] }, { ttlMs: 500, persist: true });

    const second = new QueryCache();
    expect(second.get<{ results: string[] }>(queryKeys.exploreSearch("usr_1", 2, "gullak", ["show"]))?.results).toEqual(["cached"]);

    vi.advanceTimersByTime(501);
    expect(second.get(queryKeys.exploreSearch("usr_1", 2, "gullak", ["show"]))).toBeNull();
  });

  it("invalidates all cached data below a prefix", () => {
    const cache = new QueryCache();
    cache.set(queryKeys.mediaDetail("usr_1", 8, "med_a"), { id: "med_a" }, { ttlMs: 1000, persist: true });
    cache.set(queryKeys.mediaDetail("usr_1", 8, "med_b"), { id: "med_b" }, { ttlMs: 1000, persist: true });
    cache.set(queryKeys.mediaDetail("usr_2", 8, "med_c"), { id: "med_c" }, { ttlMs: 1000, persist: true });

    cache.invalidatePrefix(["media-detail", "usr_1"]);

    expect(cache.get(queryKeys.mediaDetail("usr_1", 8, "med_a"))).toBeNull();
    expect(cache.get(queryKeys.mediaDetail("usr_1", 8, "med_b"))).toBeNull();
    expect(cache.get<{ id: string }>(queryKeys.mediaDetail("usr_2", 8, "med_c"))?.id).toBe("med_c");
  });
});
