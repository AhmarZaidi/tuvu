import { Hono } from "hono";
import { createMediaSchema, createSeasonSchema, createEpisodeSchema, createMediaUnitSchema } from "@shared/media";
import { randomId } from "./crypto";
import { apiError, apiSuccess } from "./http";
import { resolveMergedMediaId } from "./media-canonical-service";
import type { MediaRepository } from "./media-repository";
import { requireAuth, requireCsrf, type AppVariables } from "./session";
import { uploadMediaCoverToSupabase } from "./supabase-storage";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxCoverBytes = 10 * 1024 * 1024; // 10MB cover limit

export function createMediaRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: AppVariables & { mediaRepository: MediaRepository } }>();

  // POST /api/media — create a placeholder media item
  router.post("/", requireAuth(), requireCsrf(), async (c) => {
    const body = createMediaSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Media creation request is invalid.", body.error.flatten());
    }

    const mediaRepo = c.get("mediaRepository");
    const now = new Date().toISOString();
    const item = {
      id: randomId("med"),
      type: body.data.type,
      title: body.data.title,
      overview: body.data.overview ?? null,
      posterPath: body.data.posterPath ?? null,
      backdropPath: body.data.backdropPath ?? null,
      airStatus: body.data.airStatus ?? null,
      runtimeMinutes: body.data.runtimeMinutes ?? null,
      releaseDate: body.data.releaseDate ?? null,
      year: body.data.year ?? null,
      language: body.data.language ?? null,
      country: body.data.country ?? null,
      source: body.data.source,
      sourceId: body.data.sourceId ?? null,
      totalEpisodes: null,
      totalSeasons: null,
      extendedDataJson: null,
      createdAt: now,
      updatedAt: now,
    };

    await mediaRepo.createMedia(item);
    return c.json(apiSuccess({ media: item }), 201);
  });

  // GET /api/media/:id — get media detail
  router.get("/:id", requireAuth(), async (c) => {
    const mediaRepo = c.get("mediaRepository");
    const requestedId = c.req.param("id");
    const resolved = c.env.DB ? await resolveMergedMediaId(c.env.DB, requestedId) : { mediaId: requestedId, aliasFromMediaId: null };
    const media = await mediaRepo.findMediaById(resolved.mediaId);
    if (!media) {
      return apiError(c, 404, "not_found", "Media item not found.");
    }

    const auth = c.get("auth");
    const userMedia = await mediaRepo.findUserMedia(auth.user.id, media.id);
    if (c.env.DB) {
      media.extendedDataJson = await enrichRelatedMedia(c.env.DB, auth.user.id, media.extendedDataJson);
    }

    return c.json(apiSuccess({ media, userMedia, canonicalMediaId: media.id, aliasFromMediaId: resolved.aliasFromMediaId }));
  });

  // GET /api/media/:id/seasons — list seasons
  router.get("/:id/seasons", requireAuth(), async (c) => {
    const mediaRepo = c.get("mediaRepository");
    const media = await mediaRepo.findMediaById(c.req.param("id"));
    if (!media) {
      return apiError(c, 404, "not_found", "Media item not found.");
    }

    const seasons = await mediaRepo.findSeasonsByMediaId(media.id);
    return c.json(apiSuccess({ seasons }));
  });

  // POST /api/media/:id/seasons — add a season
  router.post("/:id/seasons", requireAuth(), requireCsrf(), async (c) => {
    const body = createSeasonSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Season data is invalid.", body.error.flatten());
    }

    const mediaRepo = c.get("mediaRepository");
    const media = await mediaRepo.findMediaById(c.req.param("id"));
    if (!media) {
      return apiError(c, 404, "not_found", "Media item not found.");
    }

    const now = new Date().toISOString();
    const season = {
      id: randomId("sea"),
      mediaId: media.id,
      seasonNumber: body.data.seasonNumber,
      name: body.data.name ?? null,
      overview: body.data.overview ?? null,
      posterPath: null,
      episodeCount: body.data.episodeCount ?? null,
      airDate: body.data.airDate ?? null,
      isSpecial: body.data.isSpecial,
      createdAt: now,
      updatedAt: now,
    };

    await mediaRepo.createSeason(season);
    return c.json(apiSuccess({ season }), 201);
  });

  // GET /api/media/:id/episodes?season=N — list episodes
  router.get("/:id/episodes", requireAuth(), async (c) => {
    const mediaRepo = c.get("mediaRepository");
    const media = await mediaRepo.findMediaById(c.req.param("id"));
    if (!media) {
      return apiError(c, 404, "not_found", "Media item not found.");
    }

    const seasonParam = c.req.query("season");
    const seasonNumber = seasonParam !== undefined ? Number(seasonParam) : undefined;
    const episodes = await mediaRepo.findEpisodesByMediaId(media.id, seasonNumber);

    // Include watched state for the current user
    const auth = c.get("auth");
    const activities = await mediaRepo.findEpisodeActivitiesForMedia(auth.user.id, media.id);
    const activityMap = new Map(activities.map((a) => [a.episodeId, a]));

    const episodesWithActivity = episodes.map((ep) => ({
      ...ep,
      activity: activityMap.get(ep.id) ?? null,
    }));

    return c.json(apiSuccess({ episodes: episodesWithActivity }));
  });

  // POST /api/media/:id/episodes — add an episode
  router.post("/:id/episodes", requireAuth(), requireCsrf(), async (c) => {
    const body = createEpisodeSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return apiError(c, 400, "validation_failed", "Episode data is invalid.", body.error.flatten());
    }

    const mediaRepo = c.get("mediaRepository");
    const media = await mediaRepo.findMediaById(c.req.param("id"));
    if (!media) {
      return apiError(c, 404, "not_found", "Media item not found.");
    }

    // Resolve season_id if the season exists
    const seasons = await mediaRepo.findSeasonsByMediaId(media.id);
    const matchedSeason = seasons.find((s) => s.seasonNumber === body.data.seasonNumber);

    const now = new Date().toISOString();
    const episode = {
      id: randomId("epi"),
      mediaId: media.id,
      seasonId: matchedSeason?.id ?? null,
      seasonNumber: body.data.seasonNumber,
      episodeNumber: body.data.episodeNumber,
      name: body.data.name ?? null,
      overview: body.data.overview ?? null,
      stillPath: null,
      airDate: body.data.airDate ?? null,
      runtimeMinutes: body.data.runtimeMinutes ?? null,
      isSpecial: body.data.isSpecial,
      externalId: body.data.externalId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await mediaRepo.createEpisode(episode);
    return c.json(apiSuccess({ episode }), 201);
  });

  router.get("/:id/units", requireAuth(), async (c) => {
    const repo = c.get("mediaRepository");
    const media = await repo.findMediaById(c.req.param("id"));
    if (!media) return apiError(c, 404, "not_found", "Media item not found.");
    const [units, activities] = await Promise.all([repo.findMediaUnits(media.id), repo.findUnitActivitiesForMedia(c.get("auth").user.id, media.id)]);
    const activityMap = new Map(activities.map((activity) => [activity.unitId, activity]));
    return c.json(apiSuccess({ units: units.map((unit) => ({ ...unit, activity: activityMap.get(unit.id) ?? null })) }));
  });

  router.post("/:id/units", requireAuth(), requireCsrf(), async (c) => {
    const body = createMediaUnitSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Unit data is invalid.", body.error.flatten());
    const repo = c.get("mediaRepository");
    const media = await repo.findMediaById(c.req.param("id"));
    if (!media || !["book", "game"].includes(media.type)) return apiError(c, 400, "bad_request", "Units are available for books and games.");
    if (body.data.parentId) {
      const parent = await repo.findMediaUnitById(body.data.parentId);
      if (!parent || parent.mediaId !== media.id) return apiError(c, 400, "validation_failed", "Parent unit was not found in this media item.");
    }
    const now = new Date().toISOString();
    const unit = { id: randomId("unt"), mediaId: media.id, parentId: body.data.parentId ?? null, kind: body.data.kind, position: body.data.position, title: body.data.title ?? null, overview: body.data.overview ?? null, imagePath: body.data.imagePath ?? null, releaseDate: body.data.releaseDate ?? null, externalId: body.data.externalId ?? null, createdAt: now, updatedAt: now };
    await repo.createMediaUnit(unit);
    return c.json(apiSuccess({ unit }), 201);
  });

  // POST /api/media/:id/cover — upload cover image
  router.post("/:id/cover", requireAuth(), requireCsrf(), async (c) => {
    const mediaRepo = c.get("mediaRepository");
    const media = await mediaRepo.findMediaById(c.req.param("id"));
    if (!media) {
      return apiError(c, 404, "not_found", "Media item not found.");
    }

    const form = await c.req.parseBody().catch(() => null);
    if (!form || !(form.file instanceof File)) {
      return apiError(c, 400, "bad_request", "Upload requires a 'file' parameter containing the image file.");
    }

    const file = form.file;
    if (!allowedImageTypes.has(file.type)) {
      return apiError(c, 400, "validation_failed", "Only JPEG, PNG, WebP, or GIF images are allowed.");
    }

    if (file.size > maxCoverBytes) {
      return apiError(c, 400, "validation_failed", "Cover image is too large (max 10MB).");
    }

    let uploaded;
    try {
      uploaded = await uploadMediaCoverToSupabase({ env: c.env, mediaId: media.id, file });
    } catch (error) {
      return apiError(c, 503, "server_error", error instanceof Error ? error.message : "Upload storage failed.");
    }

    const now = new Date().toISOString();
    await mediaRepo.updateMediaPoster(media.id, uploaded.publicUrl ?? "", now);

    return c.json(apiSuccess({ posterPath: uploaded.publicUrl }));
  });

  return router;
}

async function enrichRelatedMedia(db: D1Database, userId: string, extendedDataJson?: string | null) {
  if (!extendedDataJson) return extendedDataJson ?? null;
  try {
    const data = JSON.parse(extendedDataJson) as { related?: Array<Record<string, unknown>> };
    if (!Array.isArray(data.related) || data.related.length === 0) return extendedDataJson;
    const related = [];
    for (const item of data.related) {
      const providerId = String(item.id ?? "");
      const type = normalizeRelatedType(String(item.type ?? "show"));
      let localMediaId: string | null = null;
      let alreadyTracked = false;
      if (providerId) {
        const row = await db.prepare(`SELECT mi.id, um.media_id AS tracked_id
          FROM media_items mi
          LEFT JOIN media_external_ids ex ON ex.media_id = mi.id AND ex.source = 'tmdb'
          LEFT JOIN user_media um ON um.media_id = mi.id AND um.user_id = ?
          WHERE mi.type = ? AND ((mi.source = 'tmdb' AND mi.source_id = ?) OR ex.external_id = ?)
          LIMIT 1`)
          .bind(userId, type, providerId, providerId)
          .first<{ id: string; tracked_id: string | null }>();
        localMediaId = row?.id ?? null;
        alreadyTracked = Boolean(row?.tracked_id);
      }
      related.push({ ...item, provider: "tmdb", providerId, type, localMediaId, alreadyTracked });
    }
    return JSON.stringify({ ...data, related });
  } catch {
    return extendedDataJson;
  }
}

function normalizeRelatedType(type: string) {
  return type === "movie" ? "movie" : "show";
}
