import { describe, expect, it } from "vitest";
import { friendlyHydrationError, maybeEnqueueStaleMediaRefresh } from "@worker/hydration";

describe("hydration reliability", () => {
  it("stores friendly messages for provider failures", () => {
    expect(friendlyHydrationError(new Error("TMDB_API_KEY missing"))).toBe("Provider connection is missing. Add or check provider credentials in settings.");
    expect(friendlyHydrationError(new Error("tmdb rate limited; retry after 5s"))).toBe("Provider is temporarily busy. Please try refreshing again later.");
    expect(friendlyHydrationError(new Error("No TMDB ID for media"))).toBe("This item needs a provider match before details can be refreshed.");
  });

  it("queues stale refresh work without blocking media detail responses", async () => {
    const inserts: unknown[][] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          first: async () => {
            if (sql.includes("media_external_ids")) return { external_id: "123" };
            if (sql.includes("media_metadata_freshness")) return null;
            if (sql.includes("metadata_refresh_jobs") && sql.includes("LIMIT 1")) return null;
            return null;
          },
          run: async () => {
            inserts.push(values);
            return { success: true, meta: { changes: 1 } };
          },
        }),
      }),
    } as unknown as D1Database;

    const jobId = await maybeEnqueueStaleMediaRefresh({ DB: db } as Env, { id: "med_stale", source: "tv_time", sourceId: "tvdb_1" });

    expect(jobId).toMatch(/^mrj_/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual(expect.arrayContaining(["med_stale", "tmdb"]));
  });
});
