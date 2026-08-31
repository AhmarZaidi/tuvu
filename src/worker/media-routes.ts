import { Hono } from "hono";
import { externalApiEndpoints } from "@shared/constants";
import { createMediaSchema, createSeasonSchema, createEpisodeSchema, createMediaUnitSchema } from "@shared/media";
import { randomId } from "./crypto";
import { apiError, apiSuccess } from "./http";
import { bumpUserLibraryVersion } from "./library-version-service";
import { maybeEnqueueStaleMediaRefresh, rehydrateMediaDirectly } from "./hydration";
import { resolveMergedMediaId } from "./media-canonical-service";
import type { MediaRepository } from "./media-repository";
import { cachedJson, ProviderRateLimitError } from "./providers/provider-cache-service";
import { providerCredential } from "./providers/provider-credentials";
import { providerTtls } from "./providers/provider-ttls";
import { tmdbSearch } from "./providers/tmdb";
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

  router.get("/:id/stream-url", requireAuth(), async (c) => {
    const mediaRepo = c.get("mediaRepository");
    const mediaId = c.req.param("id");
    const media = await mediaRepo.findMediaById(mediaId);
    if (!media) return apiError(c, 404, "not_found", "Media item not found.");

    const season = Number(c.req.query("season") || 1);
    const episode = Number(c.req.query("episode") || 1);
    const isEpisode = c.req.query("isEpisode") === "true" || Boolean(c.req.query("episode"));

    // Check if anime
    const isAnime =
      media.type === "anime" ||
      (media.extendedDataJson && (media.extendedDataJson.includes('"category":"anime"') || media.extendedDataJson.includes('"anime":')));

    // Extract TMDB ID
    let tmdbId = media.source === "tmdb" ? media.sourceId : null;
    if (!tmdbId && media.extendedDataJson) {
      try {
        const ext = JSON.parse(media.extendedDataJson);
        tmdbId = ext.tmdbId || ext.id || ext.externalIds?.tmdb_id || null;
      } catch {}
    }
    if (!tmdbId && /^\d+$/.test(media.sourceId || "")) {
      tmdbId = media.sourceId;
    }

    const sources: Array<{
      id: string;
      name: string;
      url: string;
      provider: string;
      badge?: string;
      servers: Array<{
        id: string;
        name: string;
        url: string;
        badge?: string;
      }>;
    }> = [];

    // 1. Anime Sources
    if (isAnime) {
      const slug = await resolveAnikotoSlug(c.env, media.title);
      if (slug) {
        sources.push({
          id: "anikoto",
          name: "Anikoto TV",
          url: `https://anikototv.to/watch/${slug}/ep-${episode}`,
          provider: "anikoto",
          badge: "HD • Sub/Dub",
          servers: [
            { id: "sub_1", name: "Sub (Default)", url: `https://anikototv.to/watch/${slug}/ep-${episode}`, badge: "HD" },
            { id: "dub_1", name: "English Dub", url: `https://anikototv.to/watch/${slug}-dub/ep-${episode}`, badge: "Dub" },
            { id: "megacloud", name: "MegaCloud", url: `https://anikototv.to/watch/${slug}/ep-${episode}?server=megacloud` },
            { id: "vidstream", name: "Vidstream", url: `https://anikototv.to/watch/${slug}/ep-${episode}?server=vidstream` },
          ],
        });
      }

      if (tmdbId) {
        if (media.type === "movie" && !isEpisode) {
          sources.push({
            id: "7reels",
            name: "7reels.cc",
            url: `https://7reels.cc/movie/${tmdbId}/watch`,
            provider: "7reels",
            badge: "Primary",
            servers: [
              { id: "srv_1", name: "Server 1 (Default)", url: `https://7reels.cc/movie/${tmdbId}/watch` },
              { id: "srv_2", name: "Server 2 (Backup)", url: `https://7reels.cc/movie/${tmdbId}/watch?server=2` },
              { id: "srv_3", name: "Server 3 (Fast)", url: `https://7reels.cc/movie/${tmdbId}/watch?server=3` },
            ],
          });
          sources.push({
            id: "vidsrc",
            name: "VidSrc",
            url: `https://vidsrc.to/embed/movie/${tmdbId}`,
            provider: "vidsrc",
            badge: "Fast",
            servers: [
              { id: "vidsrc_to", name: "VidSrc TO", url: `https://vidsrc.to/embed/movie/${tmdbId}` },
              { id: "vidsrc_net", name: "VidSrc Net", url: `https://vidsrc.net/embed/movie/${tmdbId}` },
            ],
          });
          sources.push({
            id: "2embed",
            name: "2Embed",
            url: `https://www.2embed.cc/embed/${tmdbId}`,
            provider: "2embed",
            servers: [
              { id: "2embed_1", name: "2Embed Primary", url: `https://www.2embed.cc/embed/${tmdbId}` },
              { id: "2embed_2", name: "2Embed Mirror", url: `https://www.2embed.skin/embed/${tmdbId}` },
            ],
          });
        } else {
          sources.push({
            id: "7reels",
            name: "7reels.cc",
            url: `https://7reels.cc/tv/${tmdbId}/watch?s=${season}&e=${episode}`,
            provider: "7reels",
            badge: "Primary",
            servers: [
              { id: "srv_1", name: "Server 1 (Default)", url: `https://7reels.cc/tv/${tmdbId}/watch?s=${season}&e=${episode}` },
              { id: "srv_2", name: "Server 2 (Backup)", url: `https://7reels.cc/tv/${tmdbId}/watch?s=${season}&e=${episode}&server=2` },
              { id: "srv_3", name: "Server 3 (Fast)", url: `https://7reels.cc/tv/${tmdbId}/watch?s=${season}&e=${episode}&server=3` },
            ],
          });
          sources.push({
            id: "vidsrc",
            name: "VidSrc",
            url: `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`,
            provider: "vidsrc",
            badge: "Fast",
            servers: [
              { id: "vidsrc_to", name: "VidSrc TO", url: `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}` },
              { id: "vidsrc_net", name: "VidSrc Net", url: `https://vidsrc.net/embed/tv/${tmdbId}/${season}/${episode}` },
            ],
          });
          sources.push({
            id: "2embed",
            name: "2Embed",
            url: `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}`,
            provider: "2embed",
            servers: [
              { id: "2embed_1", name: "2Embed Primary", url: `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}` },
              { id: "2embed_2", name: "2Embed Mirror", url: `https://www.2embed.skin/embedtv/${tmdbId}&s=${season}&e=${episode}` },
            ],
          });
        }
      }

      sources.push({
        id: "hianime",
        name: "HiAnime",
        url: `https://hianime.to/search?keyword=${encodeURIComponent(media.title)}`,
        provider: "hianime",
        badge: "Anime",
        servers: [
          { id: "hianime_search", name: "HiAnime Search", url: `https://hianime.to/search?keyword=${encodeURIComponent(media.title)}` },
        ],
      });
    } else if (media.type === "movie" && !isEpisode) {
      // 2. Movies
      if (tmdbId) {
        sources.push({
          id: "7reels",
          name: "7reels.cc",
          url: `https://7reels.cc/movie/${tmdbId}/watch`,
          provider: "7reels",
          badge: "Primary",
          servers: [
            { id: "srv_1", name: "Server 1 (Default)", url: `https://7reels.cc/movie/${tmdbId}/watch` },
            { id: "srv_2", name: "Server 2 (Backup)", url: `https://7reels.cc/movie/${tmdbId}/watch?server=2` },
            { id: "srv_3", name: "Server 3 (Fast)", url: `https://7reels.cc/movie/${tmdbId}/watch?server=3` },
          ],
        });
        sources.push({
          id: "vidsrc",
          name: "VidSrc",
          url: `https://vidsrc.to/embed/movie/${tmdbId}`,
          provider: "vidsrc",
          badge: "Fast",
          servers: [
            { id: "vidsrc_to", name: "VidSrc TO", url: `https://vidsrc.to/embed/movie/${tmdbId}` },
            { id: "vidsrc_net", name: "VidSrc Net", url: `https://vidsrc.net/embed/movie/${tmdbId}` },
            { id: "vidsrc_in", name: "VidSrc IN", url: `https://vidsrc.in/embed/movie/${tmdbId}` },
          ],
        });
        sources.push({
          id: "2embed",
          name: "2Embed",
          url: `https://www.2embed.cc/embed/${tmdbId}`,
          provider: "2embed",
          badge: "HD",
          servers: [
            { id: "2embed_1", name: "2Embed Primary", url: `https://www.2embed.cc/embed/${tmdbId}` },
            { id: "2embed_2", name: "2Embed Mirror", url: `https://www.2embed.skin/embed/${tmdbId}` },
          ],
        });
        sources.push({
          id: "smashystream",
          name: "SmashyStream",
          url: `https://player.smashystream.com/movie/${tmdbId}`,
          provider: "smashystream",
          servers: [
            { id: "smashy_1", name: "Smashy Main", url: `https://player.smashystream.com/movie/${tmdbId}` },
          ],
        });
      }

      // Check Internet Archive for classic/older movies
      const archiveMatch = await searchArchiveOrgMovie(c.env, media.title, media.year);
      if (archiveMatch) {
        sources.push({
          id: "archive",
          name: "Internet Archive",
          url: archiveMatch.url,
          provider: "archive",
          badge: "Public Domain",
          servers: [
            { id: "archive_main", name: "Archive Embed", url: archiveMatch.url },
          ],
        });
      }

      // YouTube Full Movie search fallback
      sources.push({
        id: "youtube_movie",
        name: "YouTube",
        url: `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(media.title + " Full Movie")}`,
        provider: "youtube",
        badge: "Free",
        servers: [
          { id: "yt_search", name: "YouTube Search", url: `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(media.title + " Full Movie")}` },
        ],
      });
    } else {
      // 3. TV Shows
      if (tmdbId) {
        sources.push({
          id: "7reels",
          name: "7reels.cc",
          url: `https://7reels.cc/tv/${tmdbId}/watch?s=${season}&e=${episode}`,
          provider: "7reels",
          badge: "Primary",
          servers: [
            { id: "srv_1", name: "Server 1 (Default)", url: `https://7reels.cc/tv/${tmdbId}/watch?s=${season}&e=${episode}` },
            { id: "srv_2", name: "Server 2 (Backup)", url: `https://7reels.cc/tv/${tmdbId}/watch?s=${season}&e=${episode}&server=2` },
            { id: "srv_3", name: "Server 3 (Fast)", url: `https://7reels.cc/tv/${tmdbId}/watch?s=${season}&e=${episode}&server=3` },
          ],
        });
        sources.push({
          id: "vidsrc",
          name: "VidSrc",
          url: `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`,
          provider: "vidsrc",
          badge: "Fast",
          servers: [
            { id: "vidsrc_to", name: "VidSrc TO", url: `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}` },
            { id: "vidsrc_net", name: "VidSrc Net", url: `https://vidsrc.net/embed/tv/${tmdbId}/${season}/${episode}` },
          ],
        });
        sources.push({
          id: "2embed",
          name: "2Embed",
          url: `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}`,
          provider: "2embed",
          badge: "HD",
          servers: [
            { id: "2embed_1", name: "2Embed Primary", url: `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}` },
            { id: "2embed_2", name: "2Embed Mirror", url: `https://www.2embed.skin/embedtv/${tmdbId}&s=${season}&e=${episode}` },
          ],
        });
        sources.push({
          id: "smashystream",
          name: "SmashyStream",
          url: `https://player.smashystream.com/tv/${tmdbId}?s=${season}&e=${episode}`,
          provider: "smashystream",
          servers: [
            { id: "smashy_tv", name: "Smashy TV", url: `https://player.smashystream.com/tv/${tmdbId}?s=${season}&e=${episode}` },
          ],
        });
      }
    }

    if (sources.length === 0) {
      if (isAnime) {
        sources.push({
          id: "anikoto_search",
          name: "Anikoto",
          url: `https://anikototv.to/search?keyword=${encodeURIComponent(media.title)}`,
          provider: "anikoto",
        });
      } else {
        sources.push({
          id: "7reels_search",
          name: "7reels.cc",
          url: `https://7reels.cc/search?q=${encodeURIComponent(media.title)}`,
          provider: "7reels",
        });
      }
    }

    const primary = sources[0];
    return c.json(apiSuccess({
      streamUrl: primary.url,
      provider: primary.provider,
      sourceLabel: primary.name,
      siteUrl: primary.url,
      isAnime,
      tmdbId,
      sources,
    }));
  });

  // GET /api/media/:id — get media detail
  router.patch("/:id/classification", requireAuth(), requireCsrf(), async (c) => {
    const body = await c.req.json().catch(() => null) as { anime?: boolean; type?: string } | null;
    if (!body || (body.anime === undefined && !body.type)) return apiError(c, 400, "validation_failed", "Classification update is invalid.");
    const mediaRepo = c.get("mediaRepository");
    const media = await mediaRepo.findMediaById(c.req.param("id"));
    if (!media) return apiError(c, 404, "not_found", "Media item not found.");

    const validTypes = ["movie", "show", "anime", "book", "game"];
    let targetType = media.type;
    if (body.type && validTypes.includes(body.type)) {
      targetType = body.type;
    } else if (typeof body.anime === "boolean") {
      targetType = body.anime ? "anime" : (media.type === "anime" ? "show" : media.type);
    }
    const isAnime = targetType === "anime" || body.anime === true;

    const typeChanged = targetType !== media.type;
    const now = new Date().toISOString();
    const extendedDataJson = updateAnimeClassification(media.extendedDataJson, isAnime, targetType, typeChanged);

    const userId = c.get("auth").user.id;
    if (c.env.DB) {
      await c.env.DB.prepare("UPDATE media_items SET type = ?, extended_data_json = ?, updated_at = ? WHERE id = ?")
        .bind(targetType, extendedDataJson, now, media.id)
        .run();

      // Clean up, re-search provider match, and rehydrate when moving between types
      if (typeChanged) {
        let provider = media.source || "tmdb";
        if (provider === "tv_time" || !provider) provider = "tmdb";

        if (provider === "tmdb") {
          try {
            const mode = targetType === "movie" ? "movie" : "tv";
            const searchResults = await tmdbSearch(c.env, mode, media.title, 5, userId);
            const normalizedMediaTitle = media.title.trim().toLowerCase();
            const bestMatch = searchResults.find((r) => {
              const rTitle = (r.title || "").trim().toLowerCase();
              if (rTitle === normalizedMediaTitle) {
                if (media.year && r.year) return Math.abs(media.year - r.year) <= 1;
                return true;
              }
              return false;
            }) || searchResults[0];

            if (bestMatch) {
              await c.env.DB.prepare(`UPDATE media_items SET
                source = 'tmdb',
                source_id = ?,
                title = COALESCE(?, title),
                overview = COALESCE(?, overview),
                poster_path = COALESCE(?, poster_path),
                backdrop_path = COALESCE(?, backdrop_path),
                release_date = COALESCE(?, release_date),
                year = COALESCE(?, year),
                updated_at = ?
                WHERE id = ?`)
                .bind(
                  bestMatch.providerId,
                  bestMatch.title || null,
                  bestMatch.overview || null,
                  bestMatch.posterPath || null,
                  bestMatch.backdropPath || null,
                  bestMatch.releaseDate || null,
                  bestMatch.year || null,
                  now,
                  media.id
                )
                .run();

              await c.env.DB.prepare(`INSERT INTO media_external_ids
                (id, media_id, namespace, external_id, provider_code, external_url, is_primary, created_at, updated_at, source)
                VALUES (?, ?, 'tmdb', ?, 'tmdb', ?, 1, ?, ?, 'tmdb')
                ON CONFLICT(media_id, source, external_id) DO UPDATE SET
                  external_id = excluded.external_id,
                  external_url = excluded.external_url,
                  updated_at = excluded.updated_at`)
                .bind(randomId("mei"), media.id, bestMatch.providerId, bestMatch.sourceUrl || `https://www.themoviedb.org/${mode}/${bestMatch.providerId}`, now, now)
                .run();
            }
          } catch (searchErr) {
            console.error("Provider re-search on classification change failed:", searchErr);
          }
        }

        if (targetType === "movie") {
          // Adjust TMDB URLs from /tv/ to /movie/
          await c.env.DB.prepare("UPDATE media_external_ids SET external_url = REPLACE(external_url, '/tv/', '/movie/'), updated_at = ? WHERE media_id = ? AND (source = 'tmdb' OR namespace = 'tmdb' OR provider_code = 'tmdb') AND external_url LIKE '%/tv/%'")
            .bind(now, media.id)
            .run();
          // Remove TVDB IDs associated with TV series
          await c.env.DB.prepare("DELETE FROM media_external_ids WHERE media_id = ? AND (source = 'tvdb' OR namespace = 'tvdb' OR provider_code = 'tvdb')")
            .bind(media.id)
            .run();
          // Delete obsolete episode rows and episode activities for this movie
          await c.env.DB.prepare("DELETE FROM episodes WHERE media_id = ?")
            .bind(media.id)
            .run();
          await c.env.DB.prepare("DELETE FROM episode_activity WHERE media_id = ?")
            .bind(media.id)
            .run();
        } else if (targetType === "show" || targetType === "anime") {
          // Adjust TMDB URLs from /movie/ to /tv/
          await c.env.DB.prepare("UPDATE media_external_ids SET external_url = REPLACE(external_url, '/movie/', '/tv/'), updated_at = ? WHERE media_id = ? AND (source = 'tmdb' OR namespace = 'tmdb' OR provider_code = 'tmdb') AND external_url LIKE '%/movie/%'")
            .bind(now, media.id)
            .run();
        }

        // Clean up previous extended details (cast, images, conflicts)
        const cleanExt = targetType === "anime" ? JSON.stringify({ category: "anime", animeFormat: "series", pendingConflicts: [] }) : "{}";
        await c.env.DB.prepare("UPDATE media_items SET extended_data_json = ?, updated_at = ? WHERE id = ?")
          .bind(cleanExt, now, media.id)
          .run();

        // Perform direct synchronous rehydration
        try {
          await rehydrateMediaDirectly(c.env, media.id);
        } catch (hydrateErr) {
          console.error("Direct rehydration on classification change failed:", hydrateErr);
        }
      }

      const um = await c.env.DB.prepare("SELECT * FROM user_media WHERE user_id = ? AND media_id = ?")
        .bind(userId, media.id)
        .first<{ id: string; status: string }>();

      if (um) {
        let newStatus = um.status;
        if (targetType === "movie") {
          if (["completed", "up_to_date", "watched"].includes(um.status)) {
            newStatus = "watched";
          } else {
            newStatus = "watch_later";
          }
        } else if (targetType === "show" || targetType === "anime") {
          if (um.status === "watched") {
            newStatus = "completed";
          } else if (!["watching", "up_to_date", "completed", "stopped", "not_started", "watch_later"].includes(um.status)) {
            newStatus = "not_started";
          }
        }
        await c.env.DB.prepare("UPDATE user_media SET status = ?, updated_at = ? WHERE user_id = ? AND media_id = ?")
          .bind(newStatus, now, userId, media.id)
          .run();
      }
    } else {
      await mediaRepo.updateMediaExtendedData(media.id, extendedDataJson, now);
    }
    const updated = await mediaRepo.findMediaById(media.id);
    const libraryVersion = await bumpUserLibraryVersion(c.env.DB, userId);
    return c.json(apiSuccess({ media: updated ?? { ...media, type: targetType, extendedDataJson }, libraryVersion }));
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

  // GET /api/media/image-proxy?url=...
  router.get("/image-proxy", async (c) => {
    const rawUrl = c.req.query("url");
    if (!rawUrl) return apiError(c, 400, "bad_request", "Missing url parameter.");
    try {
      const parsed = new URL(rawUrl);
      const hostname = parsed.hostname.toLowerCase();
      if (!hostname.includes("tmdb.org") && !hostname.includes("b-cdn.net") && !hostname.includes("themoviedb.org")) {
        return apiError(c, 403, "forbidden", "Only TMDB images are supported.");
      }
      if (hostname === "image.tmdb.org") {
        parsed.hostname = "tmdb-image-prod.b-cdn.net";
      }
      const upstream = await fetch(parsed.toString());
      if (!upstream.ok) {
        return apiError(c, 502, "bad_gateway", "Upstream image fetch failed.");
      }
      const contentType = upstream.headers.get("content-type") || "image/jpeg";
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=604800, immutable",
        },
      });
    } catch {
      return apiError(c, 502, "bad_gateway", "Failed to retrieve image.");
    }
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
  try {
    const rows = await env.DB.prepare(`SELECT response_json FROM provider_cache
      WHERE provider_code = 'newsapi' AND cache_key IN (?, ?)
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
  } catch {
    try {
      const rows = await env.DB.prepare(`SELECT response_json FROM provider_cache
        WHERE cache_key IN (?, ?)
        ORDER BY fetched_at DESC
        LIMIT 2`)
        .bind(`media:exact:${safeTitle}`, `media:broad:${safeTitle}`)
        .all<{ response_json: string }>();
      for (const row of rows.results ?? []) {
        try {
          const parsed = JSON.parse(row.response_json) as NewsApiResponse;
          const articles = normalizeNewsArticles(parsed);
          if (articles.length) return articles;
        } catch {}
      }
    } catch {}
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

function updateAnimeClassification(json: string | null | undefined, anime: boolean, type: string, typeChanged = false) {
  let data: Record<string, unknown> = {};
  if (json) {
    try {
      data = JSON.parse(json) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  if (typeChanged) {
    delete data.pendingConflicts;
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

async function resolveAnikotoSlug(env: Env, rawTitle: string): Promise<string | null> {
  const cleanTitle = rawTitle.replace(/[:\-–—]\s*(the\s+)?final\s+season.*$/i, "").trim();
  const cacheKey = `anikoto:slug:${cleanTitle.toLowerCase().slice(0, 80)}`;

  if (env.DB) {
    const cached = await env.DB.prepare("SELECT response_json, expires_at FROM provider_cache WHERE provider_code = 'anikoto' AND cache_key = ?")
      .bind(cacheKey)
      .first<{ response_json: string; expires_at: string }>()
      .catch(() => null);
    if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
      return JSON.parse(cached.response_json) as string;
    }
  }

  try {
    const searchUrl = `https://anikototv.to/search?keyword=${encodeURIComponent(cleanTitle)}`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const matches = [...html.matchAll(/<a\s+[^>]*href=["'](https:\/\/anikototv\.to\/watch\/([^"'/]+)\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/g)]
      .map((m) => ({
        url: m[1],
        slug: m[2],
        titleText: m[3].replace(/<[^>]*>/g, "").trim(),
      }))
      .filter((m) => m.titleText.length > 2);

    if (matches.length > 0) {
      const slug = matches[0].slug;
      if (env.DB) {
        const now = new Date();
        const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        await env.DB.prepare(
          `INSERT INTO provider_cache (id, provider_code, cache_key, response_json, http_status, fetched_at, expires_at)
           VALUES (?, 'anikoto', ?, ?, 200, ?, ?)
           ON CONFLICT(provider_code, cache_key) DO UPDATE SET response_json=excluded.response_json, expires_at=excluded.expires_at`
        )
          .bind(`pc_anikoto_${cacheKey.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32)}`, cacheKey, JSON.stringify(slug), now.toISOString(), expires.toISOString())
          .run()
          .catch(() => {});
      }
      return slug;
    }
  } catch (err) {
    console.error("Anikoto slug resolution error:", err);
  }

  return null;
}

async function searchArchiveOrgMovie(env: Env, title: string, year?: number | null): Promise<{ identifier: string; url: string; title: string } | null> {
  const cacheKey = `archive:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}:${year || "any"}`;
  if (env.DB) {
    const cached = await env.DB.prepare("SELECT response_json, expires_at FROM provider_cache WHERE provider_code = 'archive' AND cache_key = ?")
      .bind(cacheKey)
      .first<{ response_json: string; expires_at: string }>()
      .catch(() => null);
    if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
      return JSON.parse(cached.response_json);
    }
  }

  try {
    const cleanTitle = title.replace(/[^\w\s]/gi, "").trim();
    const query = year
      ? `title:(${cleanTitle}) AND year:(${year}) AND mediatype:(movies)`
      : `title:(${cleanTitle}) AND mediatype:(movies)`;
    const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier,title,year&output=json&rows=3`;
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "tuvu/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const docs = data?.response?.docs || [];
    if (docs.length > 0 && docs[0].identifier) {
      const match = {
        identifier: docs[0].identifier,
        url: `https://archive.org/embed/${docs[0].identifier}`,
        title: docs[0].title || title,
      };
      if (env.DB) {
        const now = new Date();
        const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await env.DB.prepare(
          `INSERT INTO provider_cache (id, provider_code, cache_key, response_json, http_status, fetched_at, expires_at)
           VALUES (?, 'archive', ?, ?, 200, ?, ?)
           ON CONFLICT(provider_code, cache_key) DO UPDATE SET response_json=excluded.response_json, expires_at=excluded.expires_at`
        )
          .bind(`pc_archive_${cacheKey.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32)}`, cacheKey, JSON.stringify(match), now.toISOString(), expires.toISOString())
          .run()
          .catch(() => {});
      }
      return match;
    }
  } catch {}
  return null;
}
