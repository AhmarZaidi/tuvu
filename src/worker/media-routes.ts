import { Hono } from "hono";
import { externalApiEndpoints } from "@shared/constants";
import { createMediaSchema, createSeasonSchema, createEpisodeSchema, createMediaUnitSchema } from "@shared/media";
import { randomId } from "./crypto";
import { apiError, apiSuccess } from "./http";
import { bumpUserLibraryVersion } from "./library-version-service";
import { maybeEnqueueStaleMediaRefresh } from "./hydration";
import { resolveMergedMediaId } from "./media-canonical-service";
import type { MediaRepository } from "./media-repository";
import { cachedJson, ProviderRateLimitError } from "./providers/provider-cache-service";
import { providerCredential } from "./providers/provider-credentials";
import { providerTtls } from "./providers/provider-ttls";
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

  router.get("/:id/news", requireAuth(), async (c) => {
    const mediaRepo = c.get("mediaRepository");
    const media = await mediaRepo.findMediaById(c.req.param("id"));
    if (!media) return apiError(c, 404, "not_found", "Media item not found.");
    const key = await providerCredential(c.env, { userId: c.get("auth").user.id, provider: "newsapi", key: "NEWSAPI_KEY" });
    if (!key) return c.json(apiSuccess({ articles: [], warning: null, cached: false }));
    try {
      const articles = await fetchMediaNews(c.env, key, media.title);
      return c.json(apiSuccess({ articles, warning: null, cached: false }));
    } catch (error) {
      if (error instanceof ProviderRateLimitError) {
        const articles = await readCachedMediaNews(c.env, media.title);
        return c.json(apiSuccess({
          articles,
          warning: articles.length ? "News is temporarily rate limited. Showing cached articles." : "News is temporarily rate limited. Try again later.",
          cached: articles.length > 0,
        }));
      }
      console.error("News fetch failed:", error);
      const articles = await readCachedMediaNews(c.env, media.title);
      return c.json(apiSuccess({
        articles,
        warning: articles.length ? "News could not be refreshed. Showing cached articles." : "News could not be loaded right now.",
        cached: articles.length > 0,
      }));
    }
  });

  // GET /api/media/:id — get media detail
  router.patch("/:id/classification", requireAuth(), requireCsrf(), async (c) => {
    const body = await c.req.json().catch(() => null) as { anime?: unknown } | null;
    if (!body || typeof body.anime !== "boolean") return apiError(c, 400, "validation_failed", "Classification update is invalid.");
    const mediaRepo = c.get("mediaRepository");
    const media = await mediaRepo.findMediaById(c.req.param("id"));
    if (!media) return apiError(c, 404, "not_found", "Media item not found.");
    if (media.type !== "show" && media.type !== "movie" && media.type !== "anime") return apiError(c, 400, "bad_request", "Anime classification is available for shows and movies.");
    const now = new Date().toISOString();
    const extendedDataJson = updateAnimeClassification(media.extendedDataJson, body.anime, media.type);
    await mediaRepo.updateMediaExtendedData(media.id, extendedDataJson, now);
    const updated = await mediaRepo.findMediaById(media.id);
    const libraryVersion = await bumpUserLibraryVersion(c.env.DB, c.get("auth").user.id);
    return c.json(apiSuccess({ media: updated ?? { ...media, extendedDataJson }, libraryVersion }));
  });

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
      c.executionCtx.waitUntil(maybeEnqueueStaleMediaRefresh(c.env, media).catch((error) => {
        console.error(JSON.stringify({ event: "stale_refresh_enqueue_failed", mediaId: media.id, message: error instanceof Error ? error.message : String(error) }));
      }));
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

type NewsApiResponse = {
  status: string;
  articles?: Array<{
    source?: { name?: string | null };
    author?: string | null;
    title?: string | null;
    description?: string | null;
    url?: string | null;
    urlToImage?: string | null;
    publishedAt?: string | null;
  }>;
};

async function fetchMediaNews(env: Env, apiKey: string, title: string) {
  const exact = await fetchNewsSearch(env, apiKey, title, true);
  if (exact.length) return exact;
  return fetchNewsSearch(env, apiKey, title, false);
}

async function readCachedMediaNews(env: Env, title: string) {
  if (!env.DB) return [];
  const safeTitle = title.slice(0, 120).replaceAll('"', "").trim().toLowerCase();
  const rows = await env.DB.prepare(`SELECT response_json FROM provider_cache
    WHERE provider = 'newsapi' AND cache_key IN (?, ?)
    ORDER BY fetched_at DESC
    LIMIT 2`)
    .bind(`media:exact:${safeTitle}`, `media:broad:${safeTitle}`)
    .all<{ response_json: string }>();
  for (const row of rows.results ?? []) {
    try {
      const parsed = JSON.parse(row.response_json) as NewsApiResponse;
      const articles = normalizeNewsArticles(parsed);
      if (articles.length) return articles;
    } catch {
      // Try the next cached row.
    }
  }
  return [];
}

async function fetchNewsSearch(env: Env, apiKey: string, title: string, exact: boolean) {
  const safeTitle = title.slice(0, 120).replaceAll('"', "").trim();
  const query = exact ? `"${safeTitle}"` : safeTitle;
  const params = new URLSearchParams({
    q: query,
    language: "en",
    sortBy: "publishedAt",
    searchIn: "title,description",
    pageSize: "10",
    apiKey,
  });
  const data = await cachedJson<NewsApiResponse>(env, "newsapi", `media:${exact ? "exact" : "broad"}:${safeTitle.toLowerCase()}`, providerTtls.newsSearch, () => fetch(`${externalApiEndpoints.newsApi}/everything?${params.toString()}`));
  return normalizeNewsArticles(data);
}

function normalizeNewsArticles(data: NewsApiResponse | null) {
  if (!data || data.status !== "ok" || !Array.isArray(data.articles)) return [];
  return data.articles
    .filter((article) => article.title && article.url)
    .slice(0, 5)
    .map((article) => ({
      sourceName: article.source?.name ?? "News",
      author: article.author ?? null,
      title: article.title!,
      description: article.description ?? null,
      url: article.url!,
      imageUrl: article.urlToImage ?? null,
      publishedAt: article.publishedAt ?? null,
    }));
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

function updateAnimeClassification(json: string | null | undefined, anime: boolean, type: string) {
  let data: Record<string, unknown> = {};
  if (json) {
    try {
      data = JSON.parse(json) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  if (anime) {
    data.category = "anime";
    data.anime = typeof data.anime === "object" && data.anime !== null ? data.anime : {};
    data.animeFormat = type === "movie" ? "movie" : "series";
  } else {
    if (data.category === "anime") delete data.category;
    delete data.animeFormat;
    if (data.anime && Object.keys(data.anime as Record<string, unknown>).length === 0) delete data.anime;
  }
  return Object.keys(data).length ? JSON.stringify(data) : null;
}
