import { describe, expect, it } from "vitest";
import { addProviderResultToLibrary, resolveMergedMediaId } from "@worker/media-canonical-service";
import { MemoryMediaRepository } from "./memory-media-repository";

function env(overrides: Partial<Env> = {}) {
  return overrides as Env;
}

function providerResult() {
  return {
    provider: "tmdb" as const,
    providerId: "12345",
    type: "movie" as const,
    title: "Canonical Test Movie",
    overview: "A provider result.",
    posterPath: null,
    backdropPath: null,
    releaseDate: "2026-01-01",
    year: 2026,
    extendedDataJson: null,
    localMediaId: null,
  };
}

describe("media canonical service", () => {
  it("dedupes provider adds through the canonical repository boundary", async () => {
    const repo = new MemoryMediaRepository();
    const first = await addProviderResultToLibrary({ env: env(), repo, userId: "usr_1", result: providerResult(), now: "2026-07-11T00:00:00.000Z" });
    const second = await addProviderResultToLibrary({ env: env(), repo, userId: "usr_1", result: providerResult(), now: "2026-07-11T00:01:00.000Z" });

    expect(first.alreadyTracked).toBe(false);
    expect(second.alreadyTracked).toBe(true);
    expect(second.media.id).toBe(first.media.id);

    const library = await repo.findUserLibrary("usr_1", { type: "movie", limit: 10 });
    expect(library).toHaveLength(1);
    expect(library[0]!.media.source).toBe("tmdb");
    expect(library[0]!.media.sourceId).toBe("12345");
  });

  it("resolves merged media aliases before detail lookup", async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: (sourceMediaId: string) => ({
          first: async () => sql.includes("media_merge_aliases") && sourceMediaId === "med_source"
            ? { target_media_id: "med_target" }
            : null,
        }),
      }),
    } as unknown as D1Database;

    await expect(resolveMergedMediaId(db, "med_source")).resolves.toEqual({ mediaId: "med_target", aliasFromMediaId: "med_source" });
    await expect(resolveMergedMediaId(db, "med_other")).resolves.toEqual({ mediaId: "med_other", aliasFromMediaId: null });
  });
});
