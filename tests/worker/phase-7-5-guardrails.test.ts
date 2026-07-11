import { describe, expect, it } from "vitest";
import { createApp } from "@worker/app";
import { MemoryAuthRepository, testEnv } from "./memory-repository";
import { MemoryMediaRepository } from "./memory-media-repository";
import type { MediaItemRecord, UserMediaRecord } from "@worker/media-repository";

function makeApp(authRepo: MemoryAuthRepository, mediaRepo: MemoryMediaRepository) {
  return createApp({
    createRepository: () => authRepo,
    createMediaRepository: () => mediaRepo,
  });
}

async function register(authRepo: MemoryAuthRepository, mediaRepo: MemoryMediaRepository) {
  const app = makeApp(authRepo, mediaRepo);
  const response = await app.request(
    "/api/auth/password/register",
    {
      method: "POST",
      body: JSON.stringify({
        email: "guardrail@example.com",
        username: "guardrail_user",
        displayName: "Guardrail User",
        password: "Correct-Horse-42",
      }),
      headers: { "content-type": "application/json" },
    },
    testEnv(),
  );
  const body = await response.json() as { data: { csrfToken: string } };
  return {
    app,
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    csrfToken: body.data.csrfToken,
  };
}

function media(overrides: Partial<MediaItemRecord> = {}): MediaItemRecord {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? `med_${Math.random().toString(36).slice(2)}`,
    type: overrides.type ?? "show",
    title: overrides.title ?? "Guardrail Show",
    overview: overrides.overview ?? null,
    posterPath: overrides.posterPath ?? null,
    backdropPath: overrides.backdropPath ?? null,
    airStatus: overrides.airStatus ?? null,
    runtimeMinutes: overrides.runtimeMinutes ?? null,
    releaseDate: overrides.releaseDate ?? null,
    year: overrides.year ?? 2026,
    language: overrides.language ?? null,
    country: overrides.country ?? null,
    source: overrides.source ?? "manual",
    sourceId: overrides.sourceId ?? null,
    totalEpisodes: overrides.totalEpisodes ?? null,
    totalSeasons: overrides.totalSeasons ?? null,
    extendedDataJson: overrides.extendedDataJson ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

function userMedia(userId: string, mediaId: string, overrides: Partial<UserMediaRecord> = {}): UserMediaRecord {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? `ulb_${mediaId}`,
    userId,
    mediaId,
    status: overrides.status ?? "watch_later",
    isFavorite: overrides.isFavorite ?? false,
    rating: overrides.rating ?? null,
    notes: overrides.notes ?? null,
    watchedAt: overrides.watchedAt ?? null,
    rewatchCount: overrides.rewatchCount ?? 0,
    progressEpisodes: overrides.progressEpisodes ?? 0,
    progressValue: overrides.progressValue ?? null,
    progressTotal: overrides.progressTotal ?? null,
    progressUnit: overrides.progressUnit ?? null,
    platform: overrides.platform ?? null,
    startedAt: overrides.startedAt ?? null,
    purchaseLibrary: overrides.purchaseLibrary ?? null,
    visibility: overrides.visibility ?? "private",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

function statsSnapshotDb() {
  return {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("SELECT version FROM user_library_versions")) return { version: 7 } as T;
              if (sql.includes("FROM user_stats_snapshots")) {
                return {
                  total_tracked: 3,
                  status_counts_json: JSON.stringify({ watch_later: 3 }),
                  section_counts_json: JSON.stringify({ "watch-later": 3, all: 3 }),
                  library_version: params.at(-1),
                  recalculated_at: "2026-07-11T00:00:00.000Z",
                } as T;
              }
              return null as T;
            },
            async run() {
              return { success: true };
            },
            async all<T>() {
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

async function seedSeries(mediaRepo: MemoryMediaRepository) {
  const now = new Date().toISOString();
  const show = media({ id: "med_guard_show", type: "show", title: "Guardrail Search Show", totalEpisodes: 3, totalSeasons: 1 });
  await mediaRepo.createMedia(show);
  await mediaRepo.createSeason({
    id: "sea_guard_s1",
    mediaId: show.id,
    seasonNumber: 1,
    name: "Season 1",
    overview: null,
    posterPath: null,
    episodeCount: 3,
    airDate: null,
    isSpecial: false,
    createdAt: now,
    updatedAt: now,
  });
  for (const episodeNumber of [1, 2, 3]) {
    await mediaRepo.createEpisode({
      id: `epi_guard_${episodeNumber}`,
      mediaId: show.id,
      seasonId: "sea_guard_s1",
      seasonNumber: 1,
      episodeNumber,
      name: `Episode ${episodeNumber}`,
      overview: null,
      stillPath: null,
      airDate: null,
      runtimeMinutes: null,
      isSpecial: false,
      externalId: null,
      extendedDataJson: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  return show;
}

describe("phase 7.5.0 refactor guardrails", () => {
  it("keeps auth/session JSON behavior stable across login, /api/me, and logout", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await register(authRepo, mediaRepo);

    const me = await app.request("/api/me", { headers: { cookie } }, testEnv());
    const meBody = await me.json() as { data: { user: { username: string } } };
    expect(me.status).toBe(200);
    expect(meBody.data.user.username).toBe("guardrail_user");

    const logout = await app.request(
      "/api/auth/logout",
      { method: "POST", headers: { cookie, "x-csrf-token": csrfToken } },
      testEnv(),
    );
    expect(logout.status).toBe(200);

    const afterLogout = await app.request("/api/me", { headers: { cookie } }, testEnv());
    expect(afterLogout.status).toBe(401);
  });

  it("keeps dashboard sections, counts, and search filtering stable", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await register(authRepo, mediaRepo);
    const show = await seedSeries(mediaRepo);
    const movie = media({ id: "med_guard_movie", type: "movie", title: "Guardrail Movie" });
    await mediaRepo.createMedia(movie);
    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${show.id}`, { method: "POST", body: JSON.stringify({ status: "watch_later" }), headers }, testEnv());
    await app.request(`/api/library/${movie.id}`, { method: "POST", body: JSON.stringify({ status: "watched" }), headers }, testEnv());

    const shows = await app.request("/api/library/dashboard/shows?limit=50&q=Search", { headers: { cookie } }, testEnv());
    const showsBody = await shows.json() as { data: { totalTracked: number; statusCounts: Record<string, number>; sections: Array<{ id: string; entries: unknown[] }> } };
    expect(shows.status).toBe(200);
    expect(showsBody.data.totalTracked).toBe(1);
    expect(showsBody.data.statusCounts.watch_later).toBe(1);
    expect(showsBody.data.sections.find((section) => section.id === "watch-later")?.entries).toHaveLength(1);

    const movies = await app.request("/api/library/dashboard/movies?limit=50", { headers: { cookie } }, testEnv());
    const moviesBody = await movies.json() as { data: { statusCounts: Record<string, number>; sections: Array<{ id: string; entries: unknown[] }> } };
    expect(moviesBody.data.statusCounts.watched).toBe(1);
    expect(moviesBody.data.sections.find((section) => section.id === "watched")?.entries).toHaveLength(1);
  });

  it("keeps dashboard counts independent from paginated dashboard entries", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie } = await register(authRepo, mediaRepo);
    const user = [...authRepo.users.values()][0];
    expect(user).toBeDefined();
    const userId = user!.id;

    for (const index of [1, 2, 3]) {
      const item = media({ id: `med_snapshot_${index}`, type: "show", title: `Snapshot Show ${index}` });
      await mediaRepo.createMedia(item);
      await mediaRepo.upsertUserMedia(userMedia(userId, item.id, { status: "watch_later", updatedAt: `2026-07-11T00:00:0${index}.000Z` }));
    }

    const response = await app.request(
      "/api/library/dashboard/shows?limit=1&offset=0",
      { headers: { cookie } },
      { ...testEnv(), DB: statsSnapshotDb() },
    );
    const body = await response.json() as { data: { entries: unknown[]; totalTracked: number; statusCounts: Record<string, number>; sectionCounts: Record<string, number>; page: { hasMore: boolean } } };

    expect(response.status).toBe(200);
    expect(body.data.entries).toHaveLength(1);
    expect(body.data.page.hasMore).toBe(true);
    expect(body.data.totalTracked).toBe(3);
    expect(body.data.statusCounts.watch_later).toBe(3);
    expect(body.data.sectionCounts["watch-later"]).toBe(3);
  });

  it("keeps local search and provider add-to-library behavior stable", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await register(authRepo, mediaRepo);
    await mediaRepo.createMedia(media({ id: "med_local_search", title: "Local Guardrail Result", type: "show" }));

    const search = await app.request("/api/explore/search?q=Guardrail&types=show", { headers: { cookie } }, testEnv());
    const searchBody = await search.json() as { data: { results: Array<{ provider: string; title: string }> } };
    expect(search.status).toBe(200);
    expect(searchBody.data.results.some((result) => result.provider === "local" && result.title === "Local Guardrail Result")).toBe(true);

    const addPayload = {
      provider: "tmdb",
      providerId: "987654",
      type: "movie",
      title: "Provider Guardrail Movie",
      overview: "Created from a provider result.",
      posterPath: "https://image.example/poster.jpg",
      backdropPath: null,
      releaseDate: "2026-01-01",
      year: 2026,
      extendedDataJson: JSON.stringify({ genres: [{ name: "Drama" }] }),
    };
    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    const added = await app.request("/api/explore/add", { method: "POST", body: JSON.stringify(addPayload), headers }, testEnv());
    const addedBody = await added.json() as { data: { media: { id: string; title: string }; userMedia: { status: string }; alreadyTracked: boolean } };
    expect(added.status).toBe(201);
    expect(addedBody.data.media.title).toBe("Provider Guardrail Movie");
    expect(addedBody.data.userMedia.status).toBe("watch_later");
    expect(addedBody.data.alreadyTracked).toBe(false);

    const duplicate = await app.request("/api/explore/add", { method: "POST", body: JSON.stringify(addPayload), headers }, testEnv());
    const duplicateBody = await duplicate.json() as { data: { alreadyTracked: boolean } };
    expect(duplicate.status).toBe(200);
    expect(duplicateBody.data.alreadyTracked).toBe(true);
  });

  it("keeps media detail fallback and episode activity hydration-independent", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await register(authRepo, mediaRepo);
    const show = await seedSeries(mediaRepo);

    const bareDetail = await app.request(`/api/media/${show.id}`, { headers: { cookie } }, testEnv());
    const bareBody = await bareDetail.json() as { data: { media: { title: string }; userMedia: null } };
    expect(bareDetail.status).toBe(200);
    expect(bareBody.data.media.title).toBe(show.title);
    expect(bareBody.data.userMedia).toBeNull();

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${show.id}`, { method: "POST", body: "{}", headers }, testEnv());
    await app.request("/api/episodes/epi_guard_1/watched", { method: "POST", body: "{}", headers }, testEnv());

    const detail = await app.request(`/api/media/${show.id}`, { headers: { cookie } }, testEnv());
    const detailBody = await detail.json() as { data: { userMedia: { progressEpisodes: number } } };
    expect(detailBody.data.userMedia.progressEpisodes).toBe(1);

    const episodes = await app.request(`/api/media/${show.id}/episodes`, { headers: { cookie } }, testEnv());
    const episodesBody = await episodes.json() as { data: { episodes: Array<{ id: string; activity: { watched: boolean } | null }> } };
    expect(episodesBody.data.episodes.find((episode) => episode.id === "epi_guard_1")?.activity?.watched).toBe(true);
  });

  it("keeps book/game unit tracking detail routes stable", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await register(authRepo, mediaRepo);
    const book = media({ id: "med_guard_book", type: "book", title: "Guardrail Book" });
    await mediaRepo.createMedia(book);
    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${book.id}`, { method: "POST", body: "{}", headers }, testEnv());

    const created = await app.request(
      `/api/media/${book.id}/units`,
      { method: "POST", body: JSON.stringify({ kind: "chapter", position: 1, title: "Opening" }), headers },
      testEnv(),
    );
    const createdBody = await created.json() as { data: { unit: { id: string } } };
    expect(created.status).toBe(201);

    const updated = await app.request(
      `/api/units/${createdBody.data.unit.id}/activity`,
      { method: "PATCH", body: JSON.stringify({ completed: true, rating: 5, notes: "Done" }), headers },
      testEnv(),
    );
    expect(updated.status).toBe(200);

    const detail = await app.request(`/api/units/${createdBody.data.unit.id}`, { headers: { cookie } }, testEnv());
    const detailBody = await detail.json() as { data: { media: { title: string }; activity: { completed: boolean; rating: number; notes: string } } };
    expect(detailBody.data.media.title).toBe("Guardrail Book");
    expect(detailBody.data.activity).toMatchObject({ completed: true, rating: 5, notes: "Done" });
  });
});
