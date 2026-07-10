import { Hono } from "hono";
import { dashboardKindSchema, buildDashboardSections } from "@shared/dashboard";
import {
  addToLibrarySchema,
  updateStatusSchema,
  updateRatingSchema,
  updateNotesSchema,
  updateFavoriteSchema,
  updateMediaProgressSchema,
  markMovieWatchedSchema,
} from "@shared/media";
import { randomId } from "./crypto";
import { apiError, apiSuccess } from "./http";
import { defaultStatus, validateStatus } from "./media-logic";
import type { MediaRepository } from "./media-repository";
import { requireAuth, requireCsrf, type AppVariables } from "./session";

export function createLibraryRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: AppVariables & { mediaRepository: MediaRepository } }>();

  router.get("/dashboard/:kind", requireAuth(), async (c) => {
    const kind = dashboardKindSchema.safeParse(c.req.param("kind"));
    if (!kind.success) {
      return apiError(c, 400, "validation_failed", "Unknown dashboard type.");
    }

    const requestedLimit = Number(c.req.query("limit") ?? 60);
    const requestedOffset = Number(c.req.query("offset") ?? 0);
    const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.trunc(requestedLimit))) : 60;
    const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.trunc(requestedOffset)) : 0;
    const entries = await c.get("mediaRepository").findDashboardEntries(c.get("auth").user.id, kind.data, limit, offset);

    return c.json(apiSuccess({
      kind: kind.data,
      entries,
      sections: buildDashboardSections(kind.data, entries),
      page: { limit, offset, hasMore: entries.length === limit },
    }));
  });

  // GET /api/library — user's library with optional filters
  router.get("/", requireAuth(), async (c) => {
    const mediaRepo = c.get("mediaRepository");
    const auth = c.get("auth");

    const type = c.req.query("type") as "show" | "movie" | "anime" | "game" | "book" | undefined;
    const status = c.req.query("status");
    const favParam = c.req.query("favorite");
    const isFavorite = favParam === "true" ? true : favParam === "false" ? false : undefined;
    const cursor = c.req.query("cursor");

    const entries = await mediaRepo.findUserLibrary(auth.user.id, {
      type,
      status,
      isFavorite,
      cursor,
      limit: 50,
    });

    return c.json(apiSuccess({ library: entries }));
  });

  // POST /api/library/:mediaId — add to library
  router.post("/:mediaId", requireAuth(), requireCsrf(), async (c) => {
    const body = addToLibrarySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Library add request is invalid.", body.error.flatten());
    }

    const mediaRepo = c.get("mediaRepository");
    const auth = c.get("auth");
    const mediaId = c.req.param("mediaId");

    const media = await mediaRepo.findMediaById(mediaId);
    if (!media) {
      return apiError(c, 404, "not_found", "Media item not found.");
    }

    const existing = await mediaRepo.findUserMedia(auth.user.id, mediaId);
    if (existing) {
      return apiError(c, 409, "conflict", "This item is already in your library.");
    }

    const status = body.data.status ?? defaultStatus(media.type);
    if (!validateStatus(media.type, status)) {
      return apiError(c, 400, "validation_failed", `Invalid status '${status}' for ${media.type}.`);
    }

    const now = new Date().toISOString();
    const record = await mediaRepo.upsertUserMedia({
      id: randomId("ulb"),
      userId: auth.user.id,
      mediaId,
      status,
      isFavorite: false,
      rating: null,
      notes: null,
      watchedAt: null,
      rewatchCount: 0,
      progressEpisodes: 0,
      progressValue: null,
      progressTotal: null,
      progressUnit: null,
      platform: null,
      visibility: "private",
      createdAt: now,
      updatedAt: now,
    });

    await mediaRepo.createActivityEvent({
      id: randomId("act"),
      userId: auth.user.id,
      type: "add_library",
      mediaId,
      episodeId: null,
      dataJson: JSON.stringify({ status }),
      createdAt: now,
    });

    return c.json(apiSuccess({ userMedia: record, media }), 201);
  });

  // DELETE /api/library/:mediaId — remove from library
  router.delete("/:mediaId", requireAuth(), requireCsrf(), async (c) => {
    const mediaRepo = c.get("mediaRepository");
    const auth = c.get("auth");
    const mediaId = c.req.param("mediaId");

    const existing = await mediaRepo.findUserMedia(auth.user.id, mediaId);
    if (!existing) {
      return apiError(c, 404, "not_found", "This item is not in your library.");
    }

    await mediaRepo.removeUserMedia(auth.user.id, mediaId);
    await mediaRepo.createActivityEvent({
      id: randomId("act"),
      userId: auth.user.id,
      type: "remove_library",
      mediaId,
      episodeId: null,
      dataJson: null,
      createdAt: new Date().toISOString(),
    });

    return c.json(apiSuccess({ ok: true }));
  });

  // PATCH /api/library/:mediaId/status
  router.patch("/:mediaId/status", requireAuth(), requireCsrf(), async (c) => {
    const body = updateStatusSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Status update is invalid.", body.error.flatten());
    }

    const mediaRepo = c.get("mediaRepository");
    const auth = c.get("auth");
    const mediaId = c.req.param("mediaId");

    const media = await mediaRepo.findMediaById(mediaId);
    if (!media) {
      return apiError(c, 404, "not_found", "Media item not found.");
    }

    if (!validateStatus(media.type, body.data.status)) {
      return apiError(c, 400, "validation_failed", `Invalid status '${body.data.status}' for ${media.type}.`);
    }

    const existing = await mediaRepo.findUserMedia(auth.user.id, mediaId);
    if (!existing) {
      return apiError(c, 404, "not_found", "This item is not in your library.");
    }

    const now = new Date().toISOString();
    const updated = await mediaRepo.upsertUserMedia({
      ...existing,
      status: body.data.status,
      updatedAt: now,
    });

    await mediaRepo.createActivityEvent({
      id: randomId("act"),
      userId: auth.user.id,
      type: "status_changed",
      mediaId,
      episodeId: null,
      dataJson: JSON.stringify({ from: existing.status, to: body.data.status }),
      createdAt: now,
    });

    return c.json(apiSuccess({ userMedia: updated }));
  });

  // PATCH /api/library/:mediaId/favorite
  router.patch("/:mediaId/favorite", requireAuth(), requireCsrf(), async (c) => {
    const body = updateFavoriteSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Favorite update is invalid.", body.error.flatten());
    }

    const mediaRepo = c.get("mediaRepository");
    const auth = c.get("auth");
    const mediaId = c.req.param("mediaId");

    const existing = await mediaRepo.findUserMedia(auth.user.id, mediaId);
    if (!existing) {
      return apiError(c, 404, "not_found", "This item is not in your library.");
    }

    const now = new Date().toISOString();
    const updated = await mediaRepo.upsertUserMedia({
      ...existing,
      isFavorite: body.data.isFavorite,
      updatedAt: now,
    });

    await mediaRepo.createActivityEvent({
      id: randomId("act"),
      userId: auth.user.id,
      type: "favorite_toggled",
      mediaId,
      episodeId: null,
      dataJson: JSON.stringify({ isFavorite: body.data.isFavorite }),
      createdAt: now,
    });

    return c.json(apiSuccess({ userMedia: updated }));
  });

  // PATCH /api/library/:mediaId/rating
  router.patch("/:mediaId/rating", requireAuth(), requireCsrf(), async (c) => {
    const body = updateRatingSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Rating update is invalid.", body.error.flatten());
    }

    const mediaRepo = c.get("mediaRepository");
    const auth = c.get("auth");
    const mediaId = c.req.param("mediaId");

    const existing = await mediaRepo.findUserMedia(auth.user.id, mediaId);
    if (!existing) {
      return apiError(c, 404, "not_found", "This item is not in your library.");
    }

    const now = new Date().toISOString();
    const updated = await mediaRepo.upsertUserMedia({
      ...existing,
      rating: body.data.rating,
      updatedAt: now,
    });

    await mediaRepo.createActivityEvent({
      id: randomId("act"),
      userId: auth.user.id,
      type: "rating_set",
      mediaId,
      episodeId: null,
      dataJson: JSON.stringify({ rating: body.data.rating }),
      createdAt: now,
    });

    return c.json(apiSuccess({ userMedia: updated }));
  });

  // PATCH /api/library/:mediaId/notes
  router.patch("/:mediaId/notes", requireAuth(), requireCsrf(), async (c) => {
    const body = updateNotesSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Notes update is invalid.", body.error.flatten());
    }

    const mediaRepo = c.get("mediaRepository");
    const auth = c.get("auth");
    const mediaId = c.req.param("mediaId");

    const existing = await mediaRepo.findUserMedia(auth.user.id, mediaId);
    if (!existing) {
      return apiError(c, 404, "not_found", "This item is not in your library.");
    }

    const now = new Date().toISOString();
    const updated = await mediaRepo.upsertUserMedia({
      ...existing,
      notes: body.data.notes,
      updatedAt: now,
    });

    return c.json(apiSuccess({ userMedia: updated }));
  });

  router.patch("/:mediaId/progress", requireAuth(), requireCsrf(), async (c) => {
    const body = updateMediaProgressSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Progress update is invalid.", body.error.flatten());
    const repo = c.get("mediaRepository");
    const auth = c.get("auth");
    const mediaId = c.req.param("mediaId");
    if (!(await repo.findUserMedia(auth.user.id, mediaId))) return apiError(c, 404, "not_found", "This item is not in your library.");
    const updated = await repo.updateUserMediaDetailProgress(auth.user.id, mediaId, body.data.value, body.data.total ?? null, body.data.unit ?? null, body.data.platform ?? null, new Date().toISOString());
    return c.json(apiSuccess({ userMedia: updated }));
  });

  // PATCH /api/library/:mediaId/watched — movies only: set watched_at, bump rewatch
  router.patch("/:mediaId/watched", requireAuth(), requireCsrf(), async (c) => {
    const body = markMovieWatchedSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Watched update is invalid.", body.error.flatten());
    }

    const mediaRepo = c.get("mediaRepository");
    const auth = c.get("auth");
    const mediaId = c.req.param("mediaId");

    const media = await mediaRepo.findMediaById(mediaId);
    if (!media) {
      return apiError(c, 404, "not_found", "Media item not found.");
    }
    if (media.type !== "movie") {
      return apiError(c, 400, "bad_request", "This endpoint is for movies only. Use the episode watched API for shows.");
    }

    const existing = await mediaRepo.findUserMedia(auth.user.id, mediaId);
    if (!existing) {
      return apiError(c, 404, "not_found", "This item is not in your library.");
    }

    const now = new Date().toISOString();
    const watchedAt = body.data.watchedAt ?? now;
    const isRewatch = existing.status === "watched";
    const updated = await mediaRepo.upsertUserMedia({
      ...existing,
      status: "watched",
      watchedAt,
      rewatchCount: isRewatch ? existing.rewatchCount + 1 : existing.rewatchCount,
      updatedAt: now,
    });

    await mediaRepo.createActivityEvent({
      id: randomId("act"),
      userId: auth.user.id,
      type: "movie_watched",
      mediaId,
      episodeId: null,
      dataJson: JSON.stringify({ watchedAt, rewatch: isRewatch }),
      createdAt: now,
    });

    return c.json(apiSuccess({ userMedia: updated }));
  });

  return router;
}
