import { Hono } from "hono";
import { markEpisodeWatchedSchema } from "@shared/media";
import { randomId } from "./crypto";
import { apiError, apiSuccess } from "./http";
import { calculateProgress } from "./media-logic";
import type { MediaRepository } from "./media-repository";
import { requireAuth, requireCsrf, type AppVariables } from "./session";

export function createEpisodeRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: AppVariables & { mediaRepository: MediaRepository } }>();

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
