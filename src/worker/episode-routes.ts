import { Hono } from "hono";
import { bulkSeasonWatchedSchema, markEpisodeWatchedSchema, updateEpisodeActivitySchema } from "@shared/media";
import { randomId } from "./crypto";
import { apiError, apiSuccess } from "./http";
import { calculateProgress } from "./media-logic";
import type { MediaRepository } from "./media-repository";
import { requireAuth, requireCsrf, type AppVariables } from "./session";

export function createEpisodeRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: AppVariables & { mediaRepository: MediaRepository } }>();

  router.get("/:episodeId", requireAuth(), async (c) => {
    const mediaRepo = c.get("mediaRepository");
    const episode = await mediaRepo.findEpisodeById(c.req.param("episodeId"));
    if (!episode) return apiError(c, 404, "not_found", "Episode not found.");
    const [media, activity] = await Promise.all([
      mediaRepo.findMediaById(episode.mediaId),
      mediaRepo.findEpisodeActivity(c.get("auth").user.id, episode.id),
    ]);
    return c.json(apiSuccess({ episode, media, activity }));
  });

  router.patch("/:episodeId/activity", requireAuth(), requireCsrf(), async (c) => {
    const body = updateEpisodeActivitySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Episode activity is invalid.", body.error.flatten());
    const mediaRepo = c.get("mediaRepository");
    const auth = c.get("auth");
    const episode = await mediaRepo.findEpisodeById(c.req.param("episodeId"));
    if (!episode) return apiError(c, 404, "not_found", "Episode not found.");
    const existing = await mediaRepo.findEpisodeActivity(auth.user.id, episode.id);
    const now = new Date().toISOString();
    const watched = body.data.watched ?? existing?.watched ?? false;
    const watchedAt = body.data.watchedAt !== undefined ? body.data.watchedAt : existing?.watchedAt;
    const activity = await mediaRepo.upsertEpisodeActivity({
      id: existing?.id ?? randomId("epa"), userId: auth.user.id, episodeId: episode.id, mediaId: episode.mediaId,
      watched, watchedAt: watched ? (watchedAt ?? now) : null,
      rewatchCount: body.data.rewatchCount !== undefined ? body.data.rewatchCount : existing?.rewatchCount ?? 0,
      rating: body.data.rating !== undefined ? body.data.rating : existing?.rating ?? null,
      notes: body.data.notes !== undefined ? body.data.notes : existing?.notes ?? null,
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    });
    let progress = null;
    if (body.data.watched !== undefined && body.data.watched !== existing?.watched) {
      const [episodes, activities] = await Promise.all([
        mediaRepo.findEpisodesByMediaId(episode.mediaId),
        mediaRepo.findEpisodeActivitiesForMedia(auth.user.id, episode.mediaId),
      ]);
      progress = calculateProgress(
        episodes.map((item) => ({ id: item.id, isSpecial: item.isSpecial })),
        activities.map((item) => ({ episodeId: item.episodeId, watched: item.watched })),
      );
      await mediaRepo.updateUserMediaProgress(auth.user.id, episode.mediaId, progress.watched, now);
    }
    return c.json(apiSuccess({ activity, progress }));
  });

  router.patch("/media/:mediaId/seasons/:seasonNumber", requireAuth(), requireCsrf(), async (c) => {
    const body = bulkSeasonWatchedSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Season update is invalid.", body.error.flatten());
    const seasonNumber = Number(c.req.param("seasonNumber"));
    if (!Number.isInteger(seasonNumber) || seasonNumber < 0) return apiError(c, 400, "validation_failed", "Season number is invalid.");

    const mediaRepo = c.get("mediaRepository");
    const auth = c.get("auth");
    const mediaId = c.req.param("mediaId");
    const episodes = await mediaRepo.findEpisodesByMediaId(mediaId, seasonNumber);
    if (episodes.length === 0) return apiError(c, 404, "not_found", "Season has no episodes.");
    const existing = await mediaRepo.findEpisodeActivitiesForMedia(auth.user.id, mediaId);
    const existingMap = new Map(existing.map((activity) => [activity.episodeId, activity]));
    const now = new Date().toISOString();
    const watchedAt = body.data.watchedAt ?? now;
    const mode = body.data.mode ?? (body.data.watched ? "watched_once" : "not_watched");
    await mediaRepo.upsertEpisodeActivities(episodes.map((episode) => {
      const previous = existingMap.get(episode.id);
      const wasWatched = previous?.watched === true;
      const rewatchCount = mode === "rewatched"
        ? (wasWatched ? previous?.rewatchCount ?? 0 : 0) + 1
        : mode === "watched_once"
          ? 0
          : previous?.rewatchCount ?? 0;
      return {
        id: previous?.id ?? randomId("epa"), userId: auth.user.id, episodeId: episode.id, mediaId,
        watched: body.data.watched, watchedAt: body.data.watched ? watchedAt : null,
        rewatchCount, createdAt: previous?.createdAt ?? now, updatedAt: now,
        rating: previous?.rating ?? null, notes: previous?.notes ?? null,
      };
    }));
    const allEpisodes = await mediaRepo.findEpisodesByMediaId(mediaId);
    const refreshed = await mediaRepo.findEpisodeActivitiesForMedia(auth.user.id, mediaId);
    const progress = calculateProgress(
      allEpisodes.map((episode) => ({ id: episode.id, isSpecial: episode.isSpecial })),
      refreshed.map((activity) => ({ episodeId: activity.episodeId, watched: activity.watched })),
    );
    await mediaRepo.updateUserMediaProgress(auth.user.id, mediaId, progress.watched, now);
    await mediaRepo.createActivityEvent({ id: randomId("act"), userId: auth.user.id, type: body.data.watched ? "season_watched" : "season_unwatched", mediaId, episodeId: null, dataJson: JSON.stringify({ seasonNumber }), createdAt: now });
    return c.json(apiSuccess({ progress, seasonNumber, watched: body.data.watched }));
  });

  // POST /api/episodes/:episodeId/watched — mark episode watched
  router.post("/:episodeId/watched", requireAuth(), requireCsrf(), async (c) => {
    const body = markEpisodeWatchedSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Watched request is invalid.", body.error.flatten());
    }

    const mediaRepo = c.get("mediaRepository");
    const auth = c.get("auth");
    const episodeId = c.req.param("episodeId");

    const episode = await mediaRepo.findEpisodeById(episodeId);
    if (!episode) {
      return apiError(c, 404, "not_found", "Episode not found.");
    }

    const now = new Date().toISOString();
    const watchedAt = body.data.watchedAt ?? now;

    // Get or build existing activity record
    const existing = await mediaRepo.findEpisodeActivity(auth.user.id, episodeId);
    const wasAlreadyWatched = existing?.watched === true;

    const activity = await mediaRepo.upsertEpisodeActivity({
      id: existing?.id ?? randomId("epa"),
      userId: auth.user.id,
      episodeId,
      mediaId: episode.mediaId,
      watched: true,
      watchedAt,
      rewatchCount: wasAlreadyWatched ? (existing?.rewatchCount ?? 0) + 1 : (existing?.rewatchCount ?? 0),
      rating: existing?.rating ?? null,
      notes: existing?.notes ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    // Recalculate and cache progress on user_media (only regular episodes count)
    const [allEpisodes, allActivities] = await Promise.all([
      mediaRepo.findEpisodesByMediaId(episode.mediaId),
      mediaRepo.findEpisodeActivitiesForMedia(auth.user.id, episode.mediaId),
    ]);

    const progress = calculateProgress(
      allEpisodes.map((e) => ({ id: e.id, isSpecial: e.isSpecial })),
      allActivities.map((a) => ({ episodeId: a.episodeId, watched: a.watched })),
    );

    // Update progress on library record if it exists
    const userMedia = await mediaRepo.findUserMedia(auth.user.id, episode.mediaId);
    if (userMedia) {
      await mediaRepo.updateUserMediaProgress(auth.user.id, episode.mediaId, progress.watched, now);
    }

    await mediaRepo.createActivityEvent({
      id: randomId("act"),
      userId: auth.user.id,
      type: "episode_watched",
      mediaId: episode.mediaId,
      episodeId,
      dataJson: JSON.stringify({ watchedAt, rewatch: wasAlreadyWatched }),
      createdAt: now,
    });

    return c.json(apiSuccess({ activity, progress }));
  });

  // DELETE /api/episodes/:episodeId/watched — mark episode unwatched
  router.delete("/:episodeId/watched", requireAuth(), requireCsrf(), async (c) => {
    const mediaRepo = c.get("mediaRepository");
    const auth = c.get("auth");
    const episodeId = c.req.param("episodeId");

    const episode = await mediaRepo.findEpisodeById(episodeId);
    if (!episode) {
      return apiError(c, 404, "not_found", "Episode not found.");
    }

    const existing = await mediaRepo.findEpisodeActivity(auth.user.id, episodeId);
    const now = new Date().toISOString();

    const activity = await mediaRepo.upsertEpisodeActivity({
      id: existing?.id ?? randomId("epa"),
      userId: auth.user.id,
      episodeId,
      mediaId: episode.mediaId,
      watched: false,
      watchedAt: null,
      rewatchCount: existing?.rewatchCount ?? 0,
      rating: existing?.rating ?? null,
      notes: existing?.notes ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    // Recalculate progress
    const [allEpisodes, allActivities] = await Promise.all([
      mediaRepo.findEpisodesByMediaId(episode.mediaId),
      mediaRepo.findEpisodeActivitiesForMedia(auth.user.id, episode.mediaId),
    ]);

    const progress = calculateProgress(
      allEpisodes.map((e) => ({ id: e.id, isSpecial: e.isSpecial })),
      allActivities.map((a) => ({ episodeId: a.episodeId, watched: a.watched })),
    );

    const userMedia = await mediaRepo.findUserMedia(auth.user.id, episode.mediaId);
    if (userMedia) {
      await mediaRepo.updateUserMediaProgress(auth.user.id, episode.mediaId, progress.watched, now);
    }

    await mediaRepo.createActivityEvent({
      id: randomId("act"),
      userId: auth.user.id,
      type: "episode_unwatched",
      mediaId: episode.mediaId,
      episodeId,
      dataJson: null,
      createdAt: now,
    });

    return c.json(apiSuccess({ activity, progress }));
  });

  return router;
}
