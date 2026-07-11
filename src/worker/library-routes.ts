import { Hono } from "hono";
import { dashboardKindSchema, buildDashboardSections } from "@shared/dashboard";
import { mediaTypesForDashboardKind, type MediaDashboardKind } from "@shared/media-config";
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
    const searchQuery = c.req.query("q")?.trim() || null;
    const limit = Number.isFinite(requestedLimit) ? Math.min(5000, Math.max(1, Math.trunc(requestedLimit))) : 60;
    const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.trunc(requestedOffset)) : 0;
    const auth = c.get("auth");
    
    const entries = await c.get("mediaRepository").findDashboardEntries(auth.user.id, kind.data, limit, offset, searchQuery);

    let totalTracked = entries.length;
    const statusCounts: Record<string, number> = {};
    for (const entry of entries) {
      statusCounts[entry.status] = (statusCounts[entry.status] ?? 0) + 1;
    }
    let sectionCounts: Record<string, number> | undefined;

    if (c.env.DB) {
      // Fetch total tracked and status count breakdowns for correct stats in client pagination
      const types = mediaTypesForDashboardKind(kind.data);
      const typePlaceholders = types.map(() => "?").join(", ");
      const totalTrackedRow = await c.env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM user_media um
        JOIN media_items mi ON mi.id = um.media_id
        WHERE um.user_id = ? AND mi.type IN (${typePlaceholders})
      `).bind(auth.user.id, ...types).first<{ count: number }>();
      const statusCountsRows = await c.env.DB.prepare(`
        SELECT um.status, COUNT(*) as count
        FROM user_media um
        JOIN media_items mi ON mi.id = um.media_id
        WHERE um.user_id = ? AND mi.type IN (${typePlaceholders})
        GROUP BY um.status
      `).bind(auth.user.id, ...types).all<{ status: string; count: number }>();
      totalTracked = totalTrackedRow?.count ?? totalTracked;
      for (const r of statusCountsRows.results) {
        statusCounts[r.status] = r.count;
      }
      sectionCounts = await dashboardSectionCounts(c.env.DB, auth.user.id, kind.data);
    }

    return c.json(apiSuccess({
      kind: kind.data,
      entries,
      sections: buildDashboardSections(kind.data, entries),
      totalTracked,
      statusCounts,
      sectionCounts,
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
    const requestedLimit = Number(c.req.query("limit") ?? 50);
    const limit = Number.isFinite(requestedLimit) ? Math.min(5000, Math.max(1, Math.trunc(requestedLimit))) : 50;

    const entries = await mediaRepo.findUserLibrary(auth.user.id, {
      type,
      status,
      isFavorite,
      cursor,
      limit,
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
      startedAt: null,
      purchaseLibrary: null,
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
    const updated = await repo.updateUserMediaDetailProgress(auth.user.id, mediaId, body.data.value, body.data.total ?? null, body.data.unit ?? null, body.data.platform ?? null, body.data.startedAt ?? null, body.data.purchaseLibrary ?? null, new Date().toISOString());
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

async function dashboardSectionCounts(db: D1Database, userId: string, kind: MediaDashboardKind): Promise<Record<string, number>> {
  if (kind === "shows" || kind === "anime") {
    const mediaType = mediaTypesForDashboardKind(kind)[0];
    const row = await db.prepare(`
      WITH show_rows AS (
        SELECT
          um.status,
          um.progress_episodes,
          um.updated_at,
          mi.release_date,
          (
            SELECT e.air_date
            FROM episodes e
            LEFT JOIN episode_activity ea ON ea.episode_id = e.id AND ea.user_id = um.user_id AND ea.watched = 1
            WHERE e.media_id = mi.id AND e.is_special = 0 AND ea.id IS NULL
            ORDER BY e.season_number, e.episode_number
            LIMIT 1
          ) AS next_air_date,
          (
            SELECT e.id
            FROM episodes e
            LEFT JOIN episode_activity ea ON ea.episode_id = e.id AND ea.user_id = um.user_id AND ea.watched = 1
            WHERE e.media_id = mi.id AND e.is_special = 0 AND ea.id IS NULL
            ORDER BY e.season_number, e.episode_number
            LIMIT 1
          ) AS next_episode_id
        FROM user_media um
        JOIN media_items mi ON mi.id = um.media_id
        WHERE um.user_id = ? AND mi.type = ?
      )
      SELECT
        COUNT(*) AS all_count,
        SUM(CASE WHEN next_episode_id IS NOT NULL AND (next_air_date IS NULL OR date(next_air_date) <= date('now')) THEN 1 ELSE 0 END) AS watch_next,
        SUM(CASE WHEN progress_episodes > 0 AND next_episode_id IS NOT NULL THEN 1 ELSE 0 END) AS continue_watching,
        SUM(CASE WHEN status = 'watching' AND datetime(updated_at) <= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS away,
        SUM(CASE WHEN status IN ('watch_later', 'not_started') THEN 1 ELSE 0 END) AS watch_later,
        SUM(CASE WHEN date(COALESCE(next_air_date, release_date)) > date('now') THEN 1 ELSE 0 END) AS upcoming,
        SUM(CASE WHEN status IN ('up_to_date', 'completed') THEN 1 ELSE 0 END) AS up_to_date,
        SUM(CASE WHEN status = 'stopped' THEN 1 ELSE 0 END) AS stopped
      FROM show_rows
    `).bind(userId, mediaType).first<Record<string, number | null>>();
    return {
      "watch-next": row?.watch_next ?? 0,
      "continue-watching": row?.continue_watching ?? 0,
      away: row?.away ?? 0,
      "watch-later": row?.watch_later ?? 0,
      upcoming: row?.upcoming ?? 0,
      "up-to-date": row?.up_to_date ?? 0,
      stopped: row?.stopped ?? 0,
      all: row?.all_count ?? 0,
    };
  }

  if (kind === "movies") {
    const row = await db.prepare(`
      SELECT
        COUNT(*) AS all_count,
        SUM(CASE WHEN um.status = 'watch_later' AND (mi.release_date IS NULL OR date(mi.release_date) <= date('now')) THEN 1 ELSE 0 END) AS watchlist,
        SUM(CASE WHEN um.status = 'watched' THEN 1 ELSE 0 END) AS watched,
        SUM(CASE WHEN um.is_favorite = 1 THEN 1 ELSE 0 END) AS favorites,
        SUM(CASE WHEN date(mi.release_date) > date('now') THEN 1 ELSE 0 END) AS upcoming
      FROM user_media um
      JOIN media_items mi ON mi.id = um.media_id
      WHERE um.user_id = ? AND mi.type = 'movie'
    `).bind(userId).first<Record<string, number | null>>();
    return { watchlist: row?.watchlist ?? 0, watched: row?.watched ?? 0, favorites: row?.favorites ?? 0, upcoming: row?.upcoming ?? 0, all: row?.all_count ?? 0 };
  }

  if (kind === "books") {
    const row = await db.prepare(`
      SELECT
        COUNT(*) AS all_count,
        SUM(CASE WHEN um.status = 'reading' THEN 1 ELSE 0 END) AS reading,
        SUM(CASE WHEN um.status = 'want_to_read' THEN 1 ELSE 0 END) AS want_to_read,
        SUM(CASE WHEN um.status = 'finished' THEN 1 ELSE 0 END) AS finished,
        SUM(CASE WHEN date(mi.release_date) > date('now') THEN 1 ELSE 0 END) AS upcoming,
        SUM(CASE WHEN um.is_favorite = 1 THEN 1 ELSE 0 END) AS favorites,
        SUM(CASE WHEN um.status IN ('paused', 'dropped') THEN 1 ELSE 0 END) AS paused
      FROM user_media um
      JOIN media_items mi ON mi.id = um.media_id
      WHERE um.user_id = ? AND mi.type = 'book'
    `).bind(userId).first<Record<string, number | null>>();
    return { reading: row?.reading ?? 0, "want-to-read": row?.want_to_read ?? 0, finished: row?.finished ?? 0, upcoming: row?.upcoming ?? 0, favorites: row?.favorites ?? 0, paused: row?.paused ?? 0, all: row?.all_count ?? 0 };
  }

  const row = await db.prepare(`
    SELECT
      COUNT(*) AS all_count,
      SUM(CASE WHEN um.status = 'playing' THEN 1 ELSE 0 END) AS playing,
      SUM(CASE WHEN um.status = 'planned' THEN 1 ELSE 0 END) AS planned,
      SUM(CASE WHEN um.status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN date(mi.release_date) > date('now') THEN 1 ELSE 0 END) AS upcoming,
      SUM(CASE WHEN um.is_favorite = 1 THEN 1 ELSE 0 END) AS favorites,
      SUM(CASE WHEN um.status IN ('paused', 'dropped') THEN 1 ELSE 0 END) AS paused
    FROM user_media um
    JOIN media_items mi ON mi.id = um.media_id
    WHERE um.user_id = ? AND mi.type = 'game'
  `).bind(userId).first<Record<string, number | null>>();
  return { playing: row?.playing ?? 0, planned: row?.planned ?? 0, completed: row?.completed ?? 0, upcoming: row?.upcoming ?? 0, favorites: row?.favorites ?? 0, paused: row?.paused ?? 0, all: row?.all_count ?? 0 };
}
