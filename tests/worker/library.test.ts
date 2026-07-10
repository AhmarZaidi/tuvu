import { describe, expect, it } from "vitest";
import { createApp } from "@worker/app";
import { MemoryAuthRepository, testEnv } from "./memory-repository";
import { MemoryMediaRepository } from "./memory-media-repository";

function makeApp(authRepo: MemoryAuthRepository, mediaRepo: MemoryMediaRepository) {
  return createApp({
    createRepository: () => authRepo,
    createMediaRepository: () => mediaRepo,
  });
}

/** Register a user and return session cookie + csrfToken */
async function registerUser(authRepo: MemoryAuthRepository, mediaRepo: MemoryMediaRepository) {
  const app = makeApp(authRepo, mediaRepo);
  const res = await app.request(
    "/api/auth/password/register",
    {
      method: "POST",
      body: JSON.stringify({
        email: "lib_user@example.com",
        username: "lib_user",
        displayName: "Library User",
        password: "Correct-Horse-42",
      }),
      headers: { "content-type": "application/json" },
    },
    testEnv(),
  );
  const body = await res.json() as { data: { csrfToken: string } };
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { app, cookie, csrfToken: body.data.csrfToken };
}

/** Create a placeholder media item directly in the repo */
function createPlaceholderMedia(mediaRepo: MemoryMediaRepository, overrides: Partial<{ type: string; title: string }> = {}) {
  const now = new Date().toISOString();
  const item = {
    id: `med_test_${Math.random().toString(36).slice(2)}`,
    type: (overrides.type ?? "show") as "show" | "movie" | "anime" | "game" | "book",
    title: overrides.title ?? "Test Show",
    overview: null,
    posterPath: null,
    backdropPath: null,
    airStatus: null,
    runtimeMinutes: null,
    releaseDate: null,
    year: 2024,
    language: null,
    country: null,
    source: "manual",
    sourceId: null,
    totalEpisodes: null,
    totalSeasons: null,
    createdAt: now,
    updatedAt: now,
  };
  void mediaRepo.createMedia(item);
  return item;
}

describe("library API integration", () => {
  it("adds a media item to library with default status", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo, { type: "show" });

    const res = await app.request(
      `/api/library/${media.id}`,
      { method: "POST", body: "{}", headers: { cookie, "content-type": "application/json", "x-csrf-token": csrfToken } },
      testEnv(),
    );
    const body = await res.json() as { data: { userMedia: { status: string } } };

    expect(res.status).toBe(201);
    expect(body.data.userMedia.status).toBe("not_started"); // default for show
  });

  it("accepts explicit status on add", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo, { type: "movie" });

    const res = await app.request(
      `/api/library/${media.id}`,
      {
        method: "POST",
        body: JSON.stringify({ status: "watched" }),
        headers: { cookie, "content-type": "application/json", "x-csrf-token": csrfToken },
      },
      testEnv(),
    );
    const body = await res.json() as { data: { userMedia: { status: string } } };

    expect(res.status).toBe(201);
    expect(body.data.userMedia.status).toBe("watched");
  });

  it("returns 409 when adding an already-tracked item", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${media.id}`, { method: "POST", body: "{}", headers }, testEnv());
    const res2 = await app.request(`/api/library/${media.id}`, { method: "POST", body: "{}", headers }, testEnv());

    expect(res2.status).toBe(409);
  });

  it("returns 400 when adding with invalid status for type", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo, { type: "movie" });

    const res = await app.request(
      `/api/library/${media.id}`,
      {
        method: "POST",
        body: JSON.stringify({ status: "watching" }), // invalid for movie
        headers: { cookie, "content-type": "application/json", "x-csrf-token": csrfToken },
      },
      testEnv(),
    );

    expect(res.status).toBe(400);
  });

  it("removes an item from library", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${media.id}`, { method: "POST", body: "{}", headers }, testEnv());

    const del = await app.request(`/api/library/${media.id}`, { method: "DELETE", headers }, testEnv());
    expect(del.status).toBe(200);

    const delAgain = await app.request(`/api/library/${media.id}`, { method: "DELETE", headers }, testEnv());
    expect(delAgain.status).toBe(404);
  });

  it("returns library listing filtered by type", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);

    const show = createPlaceholderMedia(mediaRepo, { type: "show", title: "My Show" });
    const movie = createPlaceholderMedia(mediaRepo, { type: "movie", title: "My Movie" });

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${show.id}`, { method: "POST", body: "{}", headers }, testEnv());
    await app.request(`/api/library/${movie.id}`, { method: "POST", body: "{}", headers }, testEnv());

    const res = await app.request("/api/library?type=show", { headers: { cookie } }, testEnv());
    const body = await res.json() as { data: { library: { media: { type: string } }[] } };

    expect(res.status).toBe(200);
    expect(body.data.library).toHaveLength(1);
    expect(body.data.library[0]!.media.type).toBe("show");
  });

  it("returns bounded dashboard sections for the requested media kind", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const show = createPlaceholderMedia(mediaRepo, { type: "show", title: "Dashboard Show" });
    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${show.id}`, { method: "POST", body: JSON.stringify({ status: "watch_later" }), headers }, testEnv());

    const response = await app.request("/api/library/dashboard/shows?limit=10", { headers: { cookie } }, testEnv());
    const body = await response.json() as { data: { entries: unknown[]; sections: Array<{ id: string; entries: unknown[] }>; page: { limit: number } } };
    expect(response.status).toBe(200);
    expect(body.data.page.limit).toBe(10);
    expect(body.data.entries).toHaveLength(1);
    expect(body.data.sections.find((section) => section.id === "watch-later")?.entries).toHaveLength(1);
  });

  it("stores book and game progress without requiring a provider record", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const book = createPlaceholderMedia(mediaRepo, { type: "book" });
    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${book.id}`, { method: "POST", body: "{}", headers }, testEnv());
    const response = await app.request(`/api/library/${book.id}/progress`, { method: "PATCH", body: JSON.stringify({ value: 120, total: 300, unit: "page" }), headers }, testEnv());
    const body = await response.json() as { data: { userMedia: { progressValue: number; progressTotal: number; progressUnit: string } } };
    expect(response.status).toBe(200);
    expect(body.data.userMedia).toMatchObject({ progressValue: 120, progressTotal: 300, progressUnit: "page" });
  });

  it("updates game status and stores platform/playtime tracking metadata", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const game = createPlaceholderMedia(mediaRepo, { type: "game", title: "Phase Seven Game" });
    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${game.id}`, { method: "POST", body: "{}", headers }, testEnv());

    const status = await app.request(`/api/library/${game.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "playing" }), headers }, testEnv());
    const progressPrefs = JSON.stringify({ platforms: ["PC", "Steam Deck"], store: "Steam", startedAt: "2026-07-11", playtimeHours: 12.5 });
    const progress = await app.request(
      `/api/library/${game.id}/progress`,
      { method: "PATCH", body: JSON.stringify({ value: 35, total: 100, unit: "percent", platform: progressPrefs }), headers },
      testEnv(),
    );
    const statusBody = await status.json() as { data: { userMedia: { status: string } } };
    const progressBody = await progress.json() as { data: { userMedia: { progressValue: number; progressTotal: number; progressUnit: string; platform: string } } };

    expect(status.status).toBe(200);
    expect(statusBody.data.userMedia.status).toBe("playing");
    expect(progress.status).toBe(200);
    expect(progressBody.data.userMedia).toMatchObject({ progressValue: 35, progressTotal: 100, progressUnit: "percent" });
    expect(JSON.parse(progressBody.data.userMedia.platform)).toMatchObject({ store: "Steam", playtimeHours: 12.5 });
  });

  it("updates book status and supports percent progress", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const book = createPlaceholderMedia(mediaRepo, { type: "book", title: "Phase Seven Book" });
    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${book.id}`, { method: "POST", body: "{}", headers }, testEnv());

    const status = await app.request(`/api/library/${book.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "reading" }), headers }, testEnv());
    const progress = await app.request(
      `/api/library/${book.id}/progress`,
      { method: "PATCH", body: JSON.stringify({ value: 42, total: 100, unit: "percent" }), headers },
      testEnv(),
    );
    const statusBody = await status.json() as { data: { userMedia: { status: string } } };
    const progressBody = await progress.json() as { data: { userMedia: { progressValue: number; progressTotal: number; progressUnit: string } } };

    expect(status.status).toBe(200);
    expect(statusBody.data.userMedia.status).toBe("reading");
    expect(progress.status).toBe(200);
    expect(progressBody.data.userMedia).toMatchObject({ progressValue: 42, progressTotal: 100, progressUnit: "percent" });
  });

  it("creates and tracks an optional book chapter with a dedicated detail response", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const book = createPlaceholderMedia(mediaRepo, { type: "book", title: "Chapter Book" });
    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${book.id}`, { method: "POST", body: "{}", headers }, testEnv());
    const create = await app.request(`/api/media/${book.id}/units`, { method: "POST", body: JSON.stringify({ kind: "chapter", position: 1, title: "Opening" }), headers }, testEnv());
    const created = await create.json() as { data: { unit: { id: string } } };
    expect(create.status).toBe(201);
    const update = await app.request(`/api/units/${created.data.unit.id}/activity`, { method: "PATCH", body: JSON.stringify({ completed: true, rating: 9 }), headers }, testEnv());
    expect(update.status).toBe(200);
    const detail = await app.request(`/api/units/${created.data.unit.id}`, { headers: { cookie } }, testEnv());
    const body = await detail.json() as { data: { activity: { completed: boolean; rating: number } } };
    expect(body.data.activity).toMatchObject({ completed: true, rating: 9 });
  });

  it("updates status within allowed values", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo, { type: "show" });

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${media.id}`, { method: "POST", body: "{}", headers }, testEnv());

    const res = await app.request(
      `/api/library/${media.id}/status`,
      { method: "PATCH", body: JSON.stringify({ status: "watching" }), headers },
      testEnv(),
    );
    const body = await res.json() as { data: { userMedia: { status: string } } };

    expect(res.status).toBe(200);
    expect(body.data.userMedia.status).toBe("watching");
  });

  it("rejects invalid status for media type", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo, { type: "show" });

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${media.id}`, { method: "POST", body: "{}", headers }, testEnv());

    const res = await app.request(
      `/api/library/${media.id}/status`,
      { method: "PATCH", body: JSON.stringify({ status: "watched" }), headers }, // invalid for show
      testEnv(),
    );

    expect(res.status).toBe(400);
  });

  it("toggles favorite on and off", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${media.id}`, { method: "POST", body: "{}", headers }, testEnv());

    const fav = await app.request(
      `/api/library/${media.id}/favorite`,
      { method: "PATCH", body: JSON.stringify({ isFavorite: true }), headers },
      testEnv(),
    );
    const favBody = await fav.json() as { data: { userMedia: { isFavorite: boolean } } };
    expect(fav.status).toBe(200);
    expect(favBody.data.userMedia.isFavorite).toBe(true);

    const unfav = await app.request(
      `/api/library/${media.id}/favorite`,
      { method: "PATCH", body: JSON.stringify({ isFavorite: false }), headers },
      testEnv(),
    );
    const unfavBody = await unfav.json() as { data: { userMedia: { isFavorite: boolean } } };
    expect(unfavBody.data.userMedia.isFavorite).toBe(false);
  });

  it("sets rating between 1 and 10", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${media.id}`, { method: "POST", body: "{}", headers }, testEnv());

    const res = await app.request(
      `/api/library/${media.id}/rating`,
      { method: "PATCH", body: JSON.stringify({ rating: 8 }), headers },
      testEnv(),
    );
    const body = await res.json() as { data: { userMedia: { rating: number } } };
    expect(res.status).toBe(200);
    expect(body.data.userMedia.rating).toBe(8);

    const clear = await app.request(
      `/api/library/${media.id}/rating`,
      { method: "PATCH", body: JSON.stringify({ rating: null }), headers },
      testEnv(),
    );
    const clearBody = await clear.json() as { data: { userMedia: { rating: number | null } } };
    expect(clearBody.data.userMedia.rating).toBeNull();
  });

  it("rejects out-of-range ratings", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${media.id}`, { method: "POST", body: "{}", headers }, testEnv());

    const zero = await app.request(
      `/api/library/${media.id}/rating`,
      { method: "PATCH", body: JSON.stringify({ rating: 0 }), headers },
      testEnv(),
    );
    expect(zero.status).toBe(400);

    const eleven = await app.request(
      `/api/library/${media.id}/rating`,
      { method: "PATCH", body: JSON.stringify({ rating: 11 }), headers },
      testEnv(),
    );
    expect(eleven.status).toBe(400);
  });

  it("stores private notes", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${media.id}`, { method: "POST", body: "{}", headers }, testEnv());

    const res = await app.request(
      `/api/library/${media.id}/notes`,
      { method: "PATCH", body: JSON.stringify({ notes: "Great show, highly recommend!" }), headers },
      testEnv(),
    );
    const body = await res.json() as { data: { userMedia: { notes: string } } };

    expect(res.status).toBe(200);
    expect(body.data.userMedia.notes).toBe("Great show, highly recommend!");
  });

  it("marks movie watched and increments rewatch_count on second watch", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo, { type: "movie" });

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${media.id}`, { method: "POST", body: "{}", headers }, testEnv());

    // First watch
    const w1 = await app.request(
      `/api/library/${media.id}/watched`,
      { method: "PATCH", body: "{}", headers },
      testEnv(),
    );
    const b1 = await w1.json() as { data: { userMedia: { status: string; rewatchCount: number } } };
    expect(w1.status).toBe(200);
    expect(b1.data.userMedia.status).toBe("watched");
    expect(b1.data.userMedia.rewatchCount).toBe(0);

    // Second watch → rewatch
    const w2 = await app.request(
      `/api/library/${media.id}/watched`,
      { method: "PATCH", body: "{}", headers },
      testEnv(),
    );
    const b2 = await w2.json() as { data: { userMedia: { rewatchCount: number } } };
    expect(b2.data.userMedia.rewatchCount).toBe(1);
  });

  it("requires CSRF for all mutating library routes", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo);

    const noCsrf = { cookie, "content-type": "application/json" };

    const add = await app.request(`/api/library/${media.id}`, { method: "POST", body: "{}", headers: noCsrf }, testEnv());
    expect(add.status).toBe(403);

    const del = await app.request(`/api/library/${media.id}`, { method: "DELETE", headers: noCsrf }, testEnv());
    expect(del.status).toBe(403);
  });

  it("creates activity events for library operations", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const media = createPlaceholderMedia(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${media.id}`, { method: "POST", body: "{}", headers }, testEnv());
    await app.request(`/api/library/${media.id}/favorite`, { method: "PATCH", body: JSON.stringify({ isFavorite: true }), headers }, testEnv());

    const events = mediaRepo.getActivityEvents();
    expect(events.some((e) => e.type === "add_library")).toBe(true);
    expect(events.some((e) => e.type === "favorite_toggled")).toBe(true);
  });
});
