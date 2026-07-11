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

async function registerUser(authRepo: MemoryAuthRepository, mediaRepo: MemoryMediaRepository) {
  const app = makeApp(authRepo, mediaRepo);
  const res = await app.request(
    "/api/auth/password/register",
    {
      method: "POST",
      body: JSON.stringify({ email: "ep_user@example.com", username: "ep_user", displayName: "Ep User", password: "Correct-Horse-42" }),
      headers: { "content-type": "application/json" },
    },
    testEnv(),
  );
  const body = await res.json() as { data: { csrfToken: string } };
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { app, cookie, csrfToken: body.data.csrfToken };
}

/** Seed one show + one season + multiple episodes into the media repo */
async function seedShow(mediaRepo: MemoryMediaRepository) {
  const now = new Date().toISOString();
  const media = {
    id: "med_show1",
    type: "show" as const,
    title: "Test Show",
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

  const season = {
    id: "sea_s1",
    mediaId: "med_show1",
    seasonNumber: 1,
    name: "Season 1",
    overview: null,
    posterPath: null,
    episodeCount: 3,
    airDate: null,
    isSpecial: false,
    createdAt: now,
    updatedAt: now,
  };

  const episodeBase = { mediaId: "med_show1", seasonId: "sea_s1", seasonNumber: 1, overview: null, stillPath: null, airDate: null, runtimeMinutes: null, isSpecial: false, externalId: null, createdAt: now, updatedAt: now };

  const episodes = [
    { id: "epi_e1", episodeNumber: 1, name: "S1E1", ...episodeBase },
    { id: "epi_e2", episodeNumber: 2, name: "S1E2", ...episodeBase },
    { id: "epi_e3", episodeNumber: 3, name: "S1E3", ...episodeBase },
    { id: "epi_sp1", episodeNumber: 1, name: "Special 1", ...episodeBase, seasonNumber: 0, isSpecial: true, seasonId: null },
  ];

  await mediaRepo.createMedia(media);
  await mediaRepo.createSeason(season);
  for (const ep of episodes) await mediaRepo.createEpisode(ep);

  return { mediaId: media.id, episodeIds: { e1: "epi_e1", e2: "epi_e2", e3: "epi_e3", sp1: "epi_sp1" } };
}

describe("episode activity API integration", () => {
  it("marks an episode watched and records watchedAt", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const { episodeIds } = await seedShow(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    const watchedAt = "2024-06-01T20:00:00.000Z";
    const res = await app.request(
      `/api/episodes/${episodeIds.e1}/watched`,
      { method: "POST", body: JSON.stringify({ watchedAt }), headers },
      testEnv(),
    );
    const body = await res.json() as { data: { activity: { watched: boolean; watchedAt: string } } };

    expect(res.status).toBe(200);
    expect(body.data.activity.watched).toBe(true);
    expect(body.data.activity.watchedAt).toBe(watchedAt);
  });

  it("marks an episode unwatched", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const { episodeIds } = await seedShow(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "POST", body: "{}", headers }, testEnv());

    const res = await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "DELETE", headers }, testEnv());
    const body = await res.json() as { data: { activity: { watched: boolean } } };

    expect(res.status).toBe(200);
    expect(body.data.activity.watched).toBe(false);
  });

  it("increments rewatch_count when marking an already-watched episode", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const { episodeIds } = await seedShow(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    // First watch
    await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    // Second watch (rewatch)
    const res = await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    const body = await res.json() as { data: { activity: { rewatchCount: number } } };

    expect(body.data.activity.rewatchCount).toBe(1);
  });

  it("calculates progress correctly as episodes are watched", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const { episodeIds } = await seedShow(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };

    // Watch e1 → 1/3
    const r1 = await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    const b1 = await r1.json() as { data: { progress: { watched: number; total: number; percent: number } } };
    expect(b1.data.progress.watched).toBe(1);
    expect(b1.data.progress.total).toBe(3);
    expect(b1.data.progress.percent).toBe(33);

    // Watch e2 → 2/3
    const r2 = await app.request(`/api/episodes/${episodeIds.e2}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    const b2 = await r2.json() as { data: { progress: { watched: number; percent: number } } };
    expect(b2.data.progress.watched).toBe(2);
    expect(b2.data.progress.percent).toBe(67);

    // Watch e3 → 3/3
    const r3 = await app.request(`/api/episodes/${episodeIds.e3}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    const b3 = await r3.json() as { data: { progress: { percent: number } } };
    expect(b3.data.progress.percent).toBe(100);
  });

  it("watching a special does not change regular progress", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const { episodeIds } = await seedShow(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    const res = await app.request(`/api/episodes/${episodeIds.sp1}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    const body = await res.json() as { data: { progress: { watched: number; total: number; specialsWatched: number } } };

    expect(body.data.progress.watched).toBe(0);       // no regular episodes watched
    expect(body.data.progress.total).toBe(3);          // 3 regular episodes
    expect(body.data.progress.specialsWatched).toBe(1); // special counted separately
  });

  it("updates cached progress_episodes on user_media after episode watch", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const { mediaId, episodeIds } = await seedShow(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    // Add to library first
    await app.request(`/api/library/${mediaId}`, { method: "POST", body: "{}", headers }, testEnv());
    await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "POST", body: "{}", headers }, testEnv());

    // Check via GET /api/media/:id
    const detail = await app.request(`/api/media/${mediaId}`, { headers: { cookie } }, testEnv());
    const detailBody = await detail.json() as { data: { userMedia: { progressEpisodes: number } } };

    expect(detailBody.data.userMedia?.progressEpisodes).toBe(1);
  });

  it("requires CSRF for watched routes", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie } = await registerUser(authRepo, mediaRepo);
    const { episodeIds } = await seedShow(mediaRepo);

    const noCsrf = { cookie, "content-type": "application/json" };
    const r = await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "POST", body: "{}", headers: noCsrf }, testEnv());
    expect(r.status).toBe(403);
  });

  it("returns 404 for unknown episode", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    const r = await app.request(`/api/episodes/epi_nonexistent/watched`, { method: "POST", body: "{}", headers }, testEnv());
    expect(r.status).toBe(404);
  });

  it("unwatch then re-watch restores watched state", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const { episodeIds } = await seedShow(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "DELETE", headers }, testEnv());

    const r = await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    const b = await r.json() as { data: { activity: { watched: boolean; rewatchCount: number } } };
    expect(b.data.activity.watched).toBe(true);
    expect(b.data.activity.rewatchCount).toBe(0);
  });

  it("resets rewatch count when an episode is marked not watched", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const { episodeIds } = await seedShow(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    const unwatched = await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "DELETE", headers }, testEnv());
    const unwatchedBody = await unwatched.json() as { data: { activity: { watched: boolean; rewatchCount: number } } };
    expect(unwatchedBody.data.activity).toMatchObject({ watched: false, rewatchCount: 0 });

    const watchedAgain = await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    const watchedAgainBody = await watchedAgain.json() as { data: { activity: { watched: boolean; rewatchCount: number } } };
    expect(watchedAgainBody.data.activity).toMatchObject({ watched: true, rewatchCount: 0 });
  });

  it("progress decreases when episode is unwatched", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const { episodeIds } = await seedShow(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    await app.request(`/api/episodes/${episodeIds.e2}/watched`, { method: "POST", body: "{}", headers }, testEnv());

    const res = await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "DELETE", headers }, testEnv());
    const body = await res.json() as { data: { progress: { watched: number; percent: number } } };
    expect(body.data.progress.watched).toBe(1);
    expect(body.data.progress.percent).toBe(33);
  });

  it("updates show tracking status from episode progress", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const { mediaId, episodeIds } = await seedShow(mediaRepo);

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${mediaId}`, { method: "POST", body: "{}", headers }, testEnv());
    await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    let detail = await app.request(`/api/media/${mediaId}`, { headers: { cookie } }, testEnv());
    let detailBody = await detail.json() as { data: { userMedia: { status: string } } };
    expect(detailBody.data.userMedia.status).toBe("watching");

    await app.request(`/api/episodes/${episodeIds.e2}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    await app.request(`/api/episodes/${episodeIds.e3}/watched`, { method: "POST", body: "{}", headers }, testEnv());
    detail = await app.request(`/api/media/${mediaId}`, { headers: { cookie } }, testEnv());
    detailBody = await detail.json() as { data: { userMedia: { status: string } } };
    expect(detailBody.data.userMedia.status).toBe("up_to_date");

    await app.request(`/api/episodes/${episodeIds.e1}/watched`, { method: "DELETE", headers }, testEnv());
    detail = await app.request(`/api/media/${mediaId}`, { headers: { cookie } }, testEnv());
    detailBody = await detail.json() as { data: { userMedia: { status: string } } };
    expect(detailBody.data.userMedia.status).toBe("watching");
  });

  it("bulk-updates one season without assuming equal season sizes", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const { mediaId } = await seedShow(mediaRepo);
    const now = new Date().toISOString();
    await mediaRepo.createSeason({ id: "sea_s2", mediaId, seasonNumber: 2, name: "Season 2", overview: null, posterPath: null, episodeCount: 2, airDate: null, isSpecial: false, createdAt: now, updatedAt: now });
    await mediaRepo.createEpisode({ id: "epi_s2e1", mediaId, seasonId: "sea_s2", seasonNumber: 2, episodeNumber: 1, name: "S2E1", overview: null, stillPath: null, airDate: null, runtimeMinutes: null, isSpecial: false, externalId: null, createdAt: now, updatedAt: now });
    await mediaRepo.createEpisode({ id: "epi_s2e2", mediaId, seasonId: "sea_s2", seasonNumber: 2, episodeNumber: 2, name: "S2E2", overview: null, stillPath: null, airDate: null, runtimeMinutes: null, isSpecial: false, externalId: null, createdAt: now, updatedAt: now });
    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${mediaId}`, { method: "POST", body: "{}", headers }, testEnv());
    const response = await app.request(`/api/episodes/media/${mediaId}/seasons/1`, { method: "PATCH", body: JSON.stringify({ watched: true }), headers }, testEnv());
    const body = await response.json() as { data: { progress: { watched: number; total: number } } };
    expect(response.status).toBe(200);
    expect(body.data.progress).toMatchObject({ watched: 3, total: 5 });
  });

  it("bulk season watched skips future and TBA episodes", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const { mediaId } = await seedShow(mediaRepo);
    const now = new Date().toISOString();
    await mediaRepo.createSeason({ id: "sea_s3", mediaId, seasonNumber: 3, name: "Season 3", overview: null, posterPath: null, episodeCount: 3, airDate: null, isSpecial: false, createdAt: now, updatedAt: now });
    await mediaRepo.createEpisode({ id: "epi_s3e1", mediaId, seasonId: "sea_s3", seasonNumber: 3, episodeNumber: 1, name: "Released", overview: null, stillPath: null, airDate: "2024-01-01", runtimeMinutes: null, isSpecial: false, externalId: null, createdAt: now, updatedAt: now });
    await mediaRepo.createEpisode({ id: "epi_s3e2", mediaId, seasonId: "sea_s3", seasonNumber: 3, episodeNumber: 2, name: "Future", overview: null, stillPath: null, airDate: "2099-01-01", runtimeMinutes: null, isSpecial: false, externalId: null, createdAt: now, updatedAt: now });
    await mediaRepo.createEpisode({ id: "epi_s3e3", mediaId, seasonId: "sea_s3", seasonNumber: 3, episodeNumber: 3, name: "TBA", overview: null, stillPath: null, airDate: null, runtimeMinutes: null, isSpecial: false, externalId: null, createdAt: now, updatedAt: now });

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${mediaId}`, { method: "POST", body: "{}", headers }, testEnv());
    const response = await app.request(`/api/episodes/media/${mediaId}/seasons/3`, { method: "PATCH", body: JSON.stringify({ watched: true }), headers }, testEnv());
    const episodes = await app.request(`/api/media/${mediaId}/episodes?season=3`, { headers: { cookie } }, testEnv());
    const body = await episodes.json() as { data: { episodes: Array<{ id: string; activity: { watched: boolean } | null }> } };

    expect(response.status).toBe(200);
    expect(body.data.episodes.find((episode) => episode.id === "epi_s3e1")?.activity?.watched).toBe(true);
    expect(body.data.episodes.find((episode) => episode.id === "epi_s3e2")?.activity?.watched).not.toBe(true);
    expect(body.data.episodes.find((episode) => episode.id === "epi_s3e3")?.activity?.watched).not.toBe(true);
  });

  it("rejects bulk season watched when no released episodes are available", async () => {
    const authRepo = new MemoryAuthRepository();
    const mediaRepo = new MemoryMediaRepository();
    const { app, cookie, csrfToken } = await registerUser(authRepo, mediaRepo);
    const { mediaId } = await seedShow(mediaRepo);
    const now = new Date().toISOString();
    await mediaRepo.createSeason({ id: "sea_s4", mediaId, seasonNumber: 4, name: "Season 4", overview: null, posterPath: null, episodeCount: 2, airDate: null, isSpecial: false, createdAt: now, updatedAt: now });
    await mediaRepo.createEpisode({ id: "epi_s4e1", mediaId, seasonId: "sea_s4", seasonNumber: 4, episodeNumber: 1, name: "Future", overview: null, stillPath: null, airDate: "2099-01-01", runtimeMinutes: null, isSpecial: false, externalId: null, createdAt: now, updatedAt: now });
    await mediaRepo.createEpisode({ id: "epi_s4e2", mediaId, seasonId: "sea_s4", seasonNumber: 4, episodeNumber: 2, name: "TBA", overview: null, stillPath: null, airDate: null, runtimeMinutes: null, isSpecial: false, externalId: null, createdAt: now, updatedAt: now });

    const headers = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    await app.request(`/api/library/${mediaId}`, { method: "POST", body: "{}", headers }, testEnv());
    const response = await app.request(`/api/episodes/media/${mediaId}/seasons/4`, { method: "PATCH", body: JSON.stringify({ watched: true }), headers }, testEnv());
    const body = await response.json() as { error: { message: string } };

    expect(response.status).toBe(409);
    expect(body.error.message).toContain("No released episodes");
  });
});
