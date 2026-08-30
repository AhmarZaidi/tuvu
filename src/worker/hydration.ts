import type { MediaType } from "@shared/media";
import { externalApiEndpoints } from "@shared/constants";
import { randomId } from "./crypto";
import { jikanSearchAnime, jikanAnimeCharacters, jikanAnimeEpisodes, igdbFetchDetails, openLibraryFetchDetails, rawgFetchDetails } from "./providers";
import { writeProviderCache } from "./providers/provider-cache-service";
import { providerTtls } from "./providers/provider-ttls";
import { tmdbFetchMediaDetails } from "./providers/tmdb";

let hydrationInFlight: Promise<void> | null = null;

export function scheduleHydrationJobs(env: Env) {
  if (!hydrationInFlight) {
    hydrationInFlight = processHydrationJobs(env).finally(() => {
      hydrationInFlight = null;
    });
  }
  return hydrationInFlight;
}

export async function processHydrationJob(env: Env, jobId: string) {
  if (!env.DB) return;
  const db = env.DB;
  const job = await runD1("load hydration job", db.prepare("SELECT * FROM metadata_refresh_jobs WHERE id = ?").bind(jobId).first<any>());
  if (!job) return;
  await claimAndRunJob(env, job);

  // Season jobs are intentionally left queued. A long season can be dozens of
  // D1 writes, so each season/chunk runs in a separate invocation.
}

export async function processHydrationJobs(env: Env) {
  if (!env.DB) return;
  const db = env.DB;

  const maxJobsPerRun = 1;
  let processed = 0;
  while (processed < maxJobsPerRun) {
    const jobs = await db.prepare(`
      SELECT * FROM metadata_refresh_jobs
      WHERE status IN ('queued', 'stale') OR (status = 'running' AND updated_at < datetime('now', '-10 minutes'))
      ORDER BY created_at ASC
      LIMIT 1
    `).all<any>();

    if (!jobs.results || jobs.results.length === 0) return;

    for (const job of jobs.results) {
      if (processed >= maxJobsPerRun) return;
      const ran = await claimAndRunJob(env, job);
      if (!ran) continue;
      processed++;
    }
  }
}

async function claimAndRunJob(env: Env, job: any) {
  const db = env.DB;
  const claim = await runD1("claim hydration job", db.prepare(`UPDATE metadata_refresh_jobs
    SET status = 'running', updated_at = ?
    WHERE id = ? AND (status IN ('queued', 'stale') OR (status = 'running' AND updated_at < datetime('now', '-10 minutes')))` )
    .bind(new Date().toISOString(), job.id)
    .run());
  if (!claim.meta?.changes) return false;
  try {
    const provider = job.provider || job.provider_code;
    if (provider === "tmdb") {
      await hydrateTmdb(env, job);
    } else if (provider === "igdb") {
      await hydrateIgdb(env, job);
    } else if (provider === "openlibrary") {
      await hydrateOpenLibrary(env, job);
    } else if (provider === "jikan") {
      await hydrateJikan(env, job);
    } else if (provider === "rawg") {
      await hydrateRawg(env, job);
    }
    await runD1("mark hydration job complete", db.prepare(`UPDATE metadata_refresh_jobs
      SET status = 'complete', last_error = NULL, updated_at = ?
      WHERE id = ?`)
      .bind(new Date().toISOString(), job.id)
      .run());
  } catch (err) {
    logHydrationFailure(job, err);
    await db.prepare("UPDATE metadata_refresh_jobs SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?")
      .bind(friendlyHydrationError(err), new Date().toISOString(), job.id).run();
  }
  return true;
}

async function hydrateTmdb(env: Env, job: any) {
  const db = env.DB;
  const media = await runD1("load media for hydration", db.prepare("SELECT * FROM media_items WHERE id = ?").bind(job.media_id).first<any>());
  if (!media) throw new Error("Media not found");

  let tmdbId = (media.canonical_provider_code === "tmdb" || media.source === "tmdb") ? (media.canonical_provider_id || media.source_id) : null;
  if (!tmdbId) {
    const extRows = await runD1("load TMDB id for hydration", db.prepare("SELECT * FROM media_external_ids WHERE media_id = ?").bind(job.media_id).all<any>());
    const match = (extRows.results ?? []).find((r) => r.source === "tmdb" || r.namespace === "tmdb" || r.provider_code === "tmdb");
    tmdbId = match?.external_id;
  }
  if (!tmdbId) throw new Error("No TMDB ID for media");

  if (job.scope === "media") {
    const typePath = media.type === "movie" ? "movie" : "tv";
    const data = await tmdbFetchMediaDetails(env, `${typePath}/${tmdbId}?append_to_response=credits,recommendations,similar,watch/providers,external_ids,videos,images`);

    const now = new Date();

    // Extract compact extended data for media_items
    const cast = (data.credits?.cast || []).slice(0, 16).map((c: any) => ({ id: c.id, name: c.name, role: c.character, profilePath: tmdbImage(c.profile_path, "w185") }));
    const crewJobs = new Set(["Director", "Writer", "Screenplay", "Producer", "Executive Producer"]);
    const crew = (data.credits?.crew || []).filter((c: any) => crewJobs.has(c.job)).slice(0, 20).map((c: any) => ({ id: c.id, name: c.name, job: c.job }));
    const creators = (data.created_by || []).map((c: any) => ({ id: c.id, name: c.name, job: "Creator", profilePath: tmdbImage(c.profile_path, "w185") }));
    const watchProviders = data["watch/providers"]?.results?.US?.flatrate?.map((p: any) => ({ name: p.provider_name, logoPath: tmdbImage(p.logo_path, "w92") })) || [];
    const related = [...(data.recommendations?.results || []), ...(data.similar?.results || [])].slice(0, 10).map((r: any) => ({ id: r.id, title: r.title || r.name, posterPath: tmdbImage(r.poster_path, "w342"), type: r.media_type || media.type }));
    const videos = (data.videos?.results || []).filter((v: any) => v.site === "YouTube").slice(0, 5).map((v: any) => ({ name: v.name, key: v.key, type: v.type }));
    const backdrops = (data.images?.backdrops || []).slice(0, 16).map((b: any) => tmdbImage(b.file_path, "w780")).filter(Boolean);
    const posters = (data.images?.posters || []).slice(0, 16).map((p: any) => tmdbImage(p.file_path, "w342")).filter(Boolean);
    const images = { backdrops, posters };
    const releaseDate = media.type === "movie" ? data.release_date : data.first_air_date;
    const runtime = media.type === "movie" ? data.runtime : (data.episode_run_time?.[0] ?? null);
    
    const pendingConflicts: Array<{ section: string; label: string; current: string; incoming: string }> = [];

    // Check title conflict
    const incomingTitle = data.title ?? data.name;
    if (media.title && incomingTitle && media.title.trim().toLowerCase() !== incomingTitle.trim().toLowerCase()) {
      pendingConflicts.push({ section: "title", label: "Title", current: media.title, incoming: incomingTitle });
    }

    // Check overview conflict
    const incomingOverview = data.overview?.trim();
    if (media.overview && incomingOverview && media.overview.trim() !== incomingOverview) {
      pendingConflicts.push({ section: "overview", label: "Overview", current: media.overview, incoming: incomingOverview });
    }

    // Check poster conflict
    const incomingPoster = tmdbImage(data.poster_path, "w342");
    if (media.poster_path && incomingPoster && media.poster_path !== incomingPoster) {
      pendingConflicts.push({ section: "poster", label: "Poster Artwork", current: media.poster_path, incoming: incomingPoster });
    }

    // Check backdrop conflict
    const incomingBackdrop = tmdbImage(data.backdrop_path, "w780");
    if (media.backdrop_path && incomingBackdrop && media.backdrop_path !== incomingBackdrop) {
      pendingConflicts.push({ section: "backdrop", label: "Backdrop Banner", current: media.backdrop_path, incoming: incomingBackdrop });
    }

    // Check release date conflict
    if (media.release_date && releaseDate && media.release_date !== releaseDate) {
      pendingConflicts.push({ section: "release_date", label: "Release Date", current: media.release_date, incoming: releaseDate });
    }

    const conflictingSections = new Set(pendingConflicts.map((c) => c.section));

    // Only overwrite existing non-empty fields if there is no conflict
    const appliedTitle = conflictingSections.has("title") ? media.title : (incomingTitle ?? media.title);
    const appliedOverview = conflictingSections.has("overview") ? media.overview : (data.overview || media.overview);
    const appliedPoster = conflictingSections.has("poster") ? media.poster_path : (incomingPoster || media.poster_path);
    const appliedBackdrop = conflictingSections.has("backdrop") ? media.backdrop_path : (incomingBackdrop || media.backdrop_path);
    const appliedReleaseDate = conflictingSections.has("release_date") ? media.release_date : (releaseDate || media.release_date);

    const existingExt = JSON.parse(media.extended_data_json || "{}");
    const extendedData = {
      ...existingExt,
      cast,
      crew,
      creators,
      watchProviders,
      related,
      videos,
      images,
      originalLanguage: data.original_language || media.language || existingExt.originalLanguage || null,
      spokenLanguages: (data.spoken_languages || []).map((l: any) => ({
        code: l.iso_639_1,
        name: l.english_name || l.name,
      })),
      languages: data.languages || (data.spoken_languages ? data.spoken_languages.map((l: any) => l.iso_639_1) : []),
      externalIds: data.external_ids,
      rating: data.vote_average,
      voteCount: data.vote_count,
      popularity: data.popularity,
      genres: data.genres || [],
      homepage: data.homepage || null,
      pendingConflicts,
      hydratedAt: now.toISOString(),
    };

    const compactCache = {
      id: data.id,
      type: media.type,
      title: appliedTitle,
      status: data.status ?? null,
      releaseDate: appliedReleaseDate,
      posterPath: appliedPoster,
      backdropPath: appliedBackdrop,
      rating: data.vote_average ?? null,
      voteCount: data.vote_count ?? null,
      hydratedAt: now.toISOString(),
    };
    await runD1("cache TMDB media detail", writeProviderCache(db, "tmdb", `detail:${media.id}`, compactCache, 200, providerTtls.tmdbDetail));

    try {
      await runD1("update hydrated media item", db.prepare(`UPDATE media_items SET
        title = ?,
        overview = ?,
        poster_path = ?,
        backdrop_path = ?,
        release_date = ?,
        runtime_minutes = COALESCE(?, runtime_minutes),
        air_status = COALESCE(?, air_status),
        language = COALESCE(?, language),
        extended_data_json = ?, 
        total_seasons = COALESCE(?, total_seasons), 
        total_episodes = COALESCE(?, total_episodes),
        updated_at = ? 
        WHERE id = ?`)
        .bind(
          appliedTitle,
          appliedOverview || null,
          appliedPoster || null,
          appliedBackdrop || null,
          appliedReleaseDate || null,
          runtime || null,
          inferTmdbStatus(data.status, media.type),
          data.original_language || null,
          JSON.stringify(extendedData),
          data.number_of_seasons || null,
          data.number_of_episodes || null,
          now.toISOString(),
          media.id
        ).run());
    } catch {
      await runD1("fallback update hydrated media item", db.prepare(`UPDATE media_items SET
        title = ?,
        overview = ?,
        poster_path = ?,
        backdrop_path = ?,
        release_date = ?,
        extended_data_json = ?,
        updated_at = ?
        WHERE id = ?`)
        .bind(
          appliedTitle,
          appliedOverview || null,
          appliedPoster || null,
          appliedBackdrop || null,
          appliedReleaseDate || null,
          JSON.stringify(extendedData),
          now.toISOString(),
          media.id
        ).run());
    }
      
    await runD1("update media freshness", db.prepare(`INSERT INTO media_metadata_freshness (media_id, details_hydrated_at, credits_hydrated_at, availability_hydrated_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(media_id) DO UPDATE SET
        details_hydrated_at=excluded.details_hydrated_at,
        credits_hydrated_at=excluded.credits_hydrated_at,
        availability_hydrated_at=excluded.availability_hydrated_at,
        updated_at=excluded.updated_at`)
      .bind(media.id, now.toISOString(), now.toISOString(), now.toISOString(), now.toISOString()).run());

    // If TV show, queue season hydration
    if (media.type === "show" || media.type === "anime") {
      const seasons = data.seasons || [];
      await enqueueSeasonHydrationJobs(db, media.id, "tmdb", now.toISOString(), seasons.map((season: any) => season.season_number));
    }
    
    // If Anime, queue Jikan hydration to augment details
    if (media.type === "anime") {
      await runD1("queue jikan hydration", enqueueHydrationJob(db, media.id, "jikan", "media", now.toISOString(), null));
    }
  } else if (job.scope === "season") {
    const context = JSON.parse(job.context_json || "{}");
    const seasonNum = context.seasonNumber;
    const episodeOffset = Number(context.episodeOffset ?? 0);
    const episodeLimit = 20;
    if (seasonNum == null) throw new Error("Missing season number in context");

    const data = await tmdbFetchMediaDetails(env, `tv/${tmdbId}/season/${seasonNum}?append_to_response=credits,videos`);

    const now = new Date().toISOString();
    
    // Ensure season exists
    const seasonRow = await runD1("load hydrated season", db.prepare("SELECT id FROM seasons WHERE media_id = ? AND season_number = ?").bind(media.id, seasonNum).first<{ id: string }>());
    let seasonId = seasonRow?.id;
    if (!seasonId) {
      seasonId = randomId("sea");
      try {
        await runD1("insert hydrated season", db.prepare(`INSERT INTO seasons
          (id, media_id, season_number, title, synopsis, poster_url, episode_count, release_date, name, overview, poster_path, air_date, is_special, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(seasonId, media.id, seasonNum, data.name, data.overview, tmdbImage(data.poster_path, "w342"), data.episodes?.length || 0, data.air_date, data.name, data.overview, tmdbImage(data.poster_path, "w342"), data.air_date, seasonNum === 0 ? 1 : 0, now, now).run());
      } catch {
        await runD1("fallback insert hydrated season", db.prepare(`INSERT INTO seasons
          (id, media_id, season_number, title, synopsis, poster_url, episode_count, release_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(seasonId, media.id, seasonNum, data.name, data.overview, tmdbImage(data.poster_path, "w342"), data.episodes?.length || 0, data.air_date, now, now).run());
      }
    } else {
      try {
        await runD1("update hydrated season", db.prepare("UPDATE seasons SET title = ?, synopsis = ?, poster_url = ?, name = ?, overview = ?, poster_path = ?, episode_count = ?, air_date = ?, release_date = ?, updated_at = ? WHERE id = ?")
          .bind(data.name, data.overview, tmdbImage(data.poster_path, "w342"), data.name, data.overview, tmdbImage(data.poster_path, "w342"), data.episodes?.length || 0, data.air_date, data.air_date, now, seasonId).run());
      } catch {
        await runD1("fallback update hydrated season", db.prepare("UPDATE seasons SET title = ?, synopsis = ?, poster_url = ?, episode_count = ?, release_date = ?, updated_at = ? WHERE id = ?")
          .bind(data.name, data.overview, tmdbImage(data.poster_path, "w342"), data.episodes?.length || 0, data.air_date, now, seasonId).run());
      }
    }

    const episodes = data.episodes || [];
    const existingEpisodes = await runD1("load existing season episodes", db.prepare("SELECT id, episode_number FROM episodes WHERE media_id = ? AND season_number = ?")
      .bind(media.id, seasonNum)
      .all<{ id: string; episode_number: number }>());
    const existingByNumber = new Map(existingEpisodes.results.map((episode) => [episode.episode_number, episode.id]));
    const episodeChunk = episodes.slice(episodeOffset, episodeOffset + episodeLimit);
    for (const ep of episodeChunk) {
      const cast = (ep.guest_stars || []).slice(0, 8).map((c: any) => ({ id: c.id, name: c.name, role: c.character, profilePath: tmdbImage(c.profile_path, "w185") }));
      const crew = (ep.crew || []).filter((c: any) => c.job === "Director" || c.job === "Writer").map((c: any) => ({ id: c.id, name: c.name, job: c.job }));
      const extendedData = { cast, crew, rating: ep.vote_average };

      const existingEpisodeId = existingByNumber.get(ep.episode_number);
      if (existingEpisodeId) {
        try {
          await runD1("update hydrated episode", db.prepare("UPDATE episodes SET name = ?, overview = ?, title = ?, synopsis = ?, still_path = ?, still_url = ?, air_date = ?, release_date = ?, runtime_minutes = ?, external_id = COALESCE(external_id, ?), extended_data_json = ?, updated_at = ? WHERE id = ?")
            .bind(ep.name, ep.overview, ep.name, ep.overview, tmdbImage(ep.still_path, "w300"), tmdbImage(ep.still_path, "w300"), ep.air_date, ep.air_date, ep.runtime, String(ep.id ?? ""), JSON.stringify(extendedData), now, existingEpisodeId).run());
        } catch {
          await runD1("fallback update hydrated episode", db.prepare("UPDATE episodes SET title = ?, synopsis = ?, still_url = ?, release_date = ?, runtime_minutes = ?, updated_at = ? WHERE id = ?")
            .bind(ep.name, ep.overview, tmdbImage(ep.still_path, "w300"), ep.air_date, ep.runtime, now, existingEpisodeId).run());
        }
      } else {
        try {
          await runD1("insert hydrated episode", db.prepare("INSERT INTO episodes (id, media_id, season_id, season_number, episode_number, name, overview, title, synopsis, still_path, still_url, air_date, release_date, runtime_minutes, is_special, external_id, extended_data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(randomId("epi"), media.id, seasonId, seasonNum, ep.episode_number, ep.name, ep.overview, ep.name, ep.overview, tmdbImage(ep.still_path, "w300"), tmdbImage(ep.still_path, "w300"), ep.air_date, ep.air_date, ep.runtime, seasonNum === 0 ? 1 : 0, String(ep.id ?? ""), JSON.stringify(extendedData), now, now).run());
        } catch {
          await runD1("fallback insert hydrated episode", db.prepare("INSERT INTO episodes (id, media_id, season_id, season_number, episode_number, title, synopsis, still_url, release_date, runtime_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(randomId("epi"), media.id, seasonId, seasonNum, ep.episode_number, ep.name, ep.overview, tmdbImage(ep.still_path, "w300"), ep.air_date, ep.runtime, now, now).run());
        }
      }
    }
    const nextOffset = episodeOffset + episodeChunk.length;
    if (nextOffset < episodes.length) {
      await runD1("queue next season episode chunk", enqueueHydrationJob(db, media.id, "tmdb", "season", now, JSON.stringify({ seasonNumber: seasonNum, episodeOffset: nextOffset })));
    } else {
      await runD1("update episode guide freshness", db.prepare(`INSERT INTO media_metadata_freshness (media_id, episode_guide_hydrated_at, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(media_id) DO UPDATE SET episode_guide_hydrated_at=excluded.episode_guide_hydrated_at, updated_at=excluded.updated_at`)
        .bind(media.id, now, now).run());
    }
  }
}

async function runD1<T>(label: string, operation: Promise<T>) {
  try {
    return await operation;
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function enqueueHydrationJob(db: D1Database, mediaId: string, provider: string, scope: string, now: string, contextJson: string | null = null) {
  const safeProvider = provider || "tmdb";
  const dedupeKey = `${mediaId}:${scope}:${safeProvider}:${contextJson ?? ""}`;
  const existing = await runD1("find existing hydration job", db.prepare(`SELECT id FROM metadata_refresh_jobs
    WHERE media_id = ? AND (provider = ? OR provider_code = ?) AND scope = ? AND COALESCE(context_json, '') = COALESCE(?, '')
      AND status IN ('queued', 'running', 'stale')
    LIMIT 1`)
    .bind(mediaId, safeProvider, safeProvider, scope, contextJson)
    .first<{ id: string }>());
  if (existing) return existing.id;
  const id = randomId("mrj");
  try {
    await runD1("insert hydration job", db.prepare(`INSERT INTO metadata_refresh_jobs
      (id, media_id, provider, provider_code, scope, dedupe_key, run_after, priority, status, attempts, last_error, context_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 100, 'queued', 0, NULL, ?, ?, ?)
      ON CONFLICT(dedupe_key) DO UPDATE SET
        status = 'queued',
        attempts = 0,
        last_error = NULL,
        run_after = excluded.run_after,
        updated_at = excluded.updated_at`)
      .bind(id, mediaId, safeProvider, safeProvider, scope, dedupeKey, now, contextJson ?? "{}", now, now)
      .run());
  } catch {
    try {
      await runD1("fallback insert hydration job with provider_code", db.prepare(`INSERT INTO metadata_refresh_jobs
        (id, media_id, provider_code, scope, status, attempts, last_error, created_at, updated_at, context_json)
        VALUES (?, ?, ?, ?, 'queued', 0, NULL, ?, ?, ?)`)
        .bind(id, mediaId, safeProvider, scope, now, now, contextJson)
        .run());
    } catch {
      await runD1("fallback insert hydration job with provider", db.prepare(`INSERT INTO metadata_refresh_jobs
        (id, media_id, provider, scope, status, attempts, last_error, created_at, updated_at, context_json)
        VALUES (?, ?, ?, ?, 'queued', 0, NULL, ?, ?, ?)`)
        .bind(id, mediaId, safeProvider, scope, now, now, contextJson)
        .run());
    }
  }
  return id;
}

async function enqueueSeasonHydrationJobs(db: D1Database, mediaId: string, provider: string, now: string, seasonNumbers: Array<number | null | undefined>) {
  const uniqueSeasonNumbers = [...new Set(seasonNumbers.filter((seasonNumber): seasonNumber is number => Number.isFinite(seasonNumber)))];
  if (uniqueSeasonNumbers.length === 0) return;
  const safeProvider = provider || "tmdb";

  const existing = await runD1("load queued season hydration jobs", db.prepare(`SELECT context_json FROM metadata_refresh_jobs
    WHERE media_id = ? AND (provider = ? OR provider_code = ?) AND scope = 'season' AND status IN ('queued', 'running', 'stale')`)
    .bind(mediaId, safeProvider, safeProvider)
    .all<{ context_json: string | null }>());
  const existingKeys = new Set((existing.results || []).map((row) => row.context_json ?? ""));

  for (const seasonNumber of uniqueSeasonNumbers) {
    const contextJson = JSON.stringify({ seasonNumber });
    if (existingKeys.has(contextJson)) continue;
    const dedupeKey = `${mediaId}:season:${seasonNumber}:${safeProvider}`;
    try {
      await runD1("insert season hydration job", db.prepare(`INSERT INTO metadata_refresh_jobs
        (id, media_id, provider, provider_code, scope, dedupe_key, run_after, priority, status, attempts, last_error, context_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'season', ?, ?, 100, 'queued', 0, NULL, ?, ?, ?)
        ON CONFLICT(dedupe_key) DO UPDATE SET
          status = 'queued',
          attempts = 0,
          last_error = NULL,
          run_after = excluded.run_after,
          updated_at = excluded.updated_at`)
        .bind(randomId("mrj"), mediaId, safeProvider, safeProvider, dedupeKey, now, contextJson, now, now)
        .run());
    } catch {
      try {
        await runD1("fallback insert season hydration job with provider_code", db.prepare(`INSERT INTO metadata_refresh_jobs
          (id, media_id, provider_code, scope, status, attempts, last_error, created_at, updated_at, context_json)
          VALUES (?, ?, ?, 'season', 'queued', 0, NULL, ?, ?, ?)`)
          .bind(randomId("mrj"), mediaId, safeProvider, now, now, contextJson)
          .run());
      } catch {
        await runD1("fallback insert season hydration job with provider", db.prepare(`INSERT INTO metadata_refresh_jobs
          (id, media_id, provider, scope, status, attempts, last_error, created_at, updated_at, context_json)
          VALUES (?, ?, ?, 'season', 'queued', 0, NULL, ?, ?, ?)`)
          .bind(randomId("mrj"), mediaId, safeProvider, now, now, contextJson)
          .run());
      }
    }
  }
}

export async function maybeEnqueueStaleMediaRefresh(env: Env, media: { id: string; source: string; sourceId: string | null }) {
  if (!env.DB) return null;
  const db = env.DB;
  try {
    const provider = await hydrationProviderForMedia(db, media);
    if (!provider) return null;

    const freshness = await runD1("load media freshness", db.prepare("SELECT details_hydrated_at FROM media_metadata_freshness WHERE media_id = ?").bind(media.id).first<{ details_hydrated_at: string | null }>());
    if (freshness?.details_hydrated_at && Date.now() - new Date(freshness.details_hydrated_at).getTime() < 30 * 24 * 60 * 60 * 1000) {
      return null;
    }

    const active = await runD1("load active hydration job", db.prepare(`SELECT id FROM metadata_refresh_jobs
      WHERE media_id = ? AND scope = 'media' AND status IN ('queued', 'running', 'stale')
      LIMIT 1`).bind(media.id).first<{ id: string }>());
    if (active) return active.id;

    const now = new Date().toISOString();
    const id = randomId("mrj");
    const dedupeKey = `${media.id}:media:${provider}`;
    try {
      await runD1("insert stale hydration job", db.prepare(`INSERT INTO metadata_refresh_jobs
        (id, media_id, provider, provider_code, scope, dedupe_key, run_after, priority, status, attempts, last_error, context_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'media', ?, ?, 100, 'stale', 0, NULL, '{}', ?, ?)
        ON CONFLICT(dedupe_key) DO UPDATE SET
          status = 'stale',
          attempts = 0,
          last_error = NULL,
          run_after = excluded.run_after,
          updated_at = excluded.updated_at`)
        .bind(id, media.id, provider, provider, dedupeKey, now, now, now)
        .run());
    } catch {
      try {
        await runD1("fallback insert stale hydration job with provider_code", db.prepare(`INSERT INTO metadata_refresh_jobs
          (id, media_id, provider_code, scope, status, attempts, last_error, created_at, updated_at, context_json)
          VALUES (?, ?, ?, 'media', 'stale', 0, NULL, ?, ?, NULL)`)
          .bind(id, media.id, provider, now, now)
          .run());
      } catch {
        await runD1("fallback insert stale hydration job with provider", db.prepare(`INSERT INTO metadata_refresh_jobs
          (id, media_id, provider, scope, status, attempts, last_error, created_at, updated_at, context_json)
          VALUES (?, ?, ?, 'media', 'stale', 0, NULL, ?, ?, NULL)`)
          .bind(id, media.id, provider, now, now)
          .run());
      }
    }
    return id;
  } catch (err) {
    return null;
  }
}

async function hydrationProviderForMedia(db: D1Database, media: { id: string; source: string; sourceId: string | null }) {
  if (media.source === "tmdb" || media.source === "igdb" || media.source === "openlibrary" || media.source === "jikan" || media.source === "rawg") return media.source;
  try {
    const tmdb = await db.prepare("SELECT external_id FROM media_external_ids WHERE media_id = ? AND (provider_code = 'tmdb' OR namespace = 'tmdb') LIMIT 1").bind(media.id).first<{ external_id: string }>();
    if (tmdb) return "tmdb";
  } catch {
    try {
      const tmdb = await db.prepare("SELECT external_id FROM media_external_ids WHERE media_id = ? AND source = 'tmdb' LIMIT 1").bind(media.id).first<{ external_id: string }>();
      if (tmdb) return "tmdb";
    } catch {}
  }
  return null;
}

function logHydrationFailure(job: any, error: unknown) {
  console.error(JSON.stringify({
    event: "hydration_failed",
    jobId: job.id,
    mediaId: job.media_id,
    provider: job.provider,
    scope: job.scope,
    message: error instanceof Error ? error.message : String(error),
  }));
}

export function friendlyHydrationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/rate limited|busy|429|retry/i.test(message)) return "Provider is temporarily busy. Please try refreshing again later.";
  if (/not connected|missing|api_key/i.test(message)) return "Provider connection is missing. Add or check provider credentials in settings.";
  if (/No TMDB ID/i.test(message)) return "This item needs a provider match before details can be refreshed.";
  if (/not found/i.test(message)) return "Provider details could not be found for this item.";
  return "Details could not be refreshed right now. Please try again later.";
}

function tmdbImage(path: string | null | undefined, size: string) {
  if (!path) return null;
  return String(path).startsWith("http") ? String(path) : `${externalApiEndpoints.tmdbImage}/${size}${path}`;
}

function inferTmdbStatus(status: string | null | undefined, type: MediaType) {
  if (!status) return null;
  if (status === "Ended" || status === "Released") return type === "movie" ? "released" : "ended";
  if (status === "Returning Series" || status === "In Production") return "continuing";
  if (status === "Planned" || status === "Post Production") return "upcoming";
  return null;
}

// ============================================================================
// IGDB (Games)
// ============================================================================
async function hydrateIgdb(env: Env, job: any) {
  const db = env.DB;
  const media = await runD1("load media for igdb hydration", db.prepare("SELECT * FROM media_items WHERE id = ?").bind(job.media_id).first<any>());
  if (!media || media.source !== "igdb") throw new Error("Media not found or not IGDB");
  
  const details = await igdbFetchDetails(env, media.source_id);
  
  if (details) {
    const existingExtended = JSON.parse(media.extended_data_json || "{}");
    if (!existingExtended.game) existingExtended.game = {};
    
    if (details.platforms.length > 0) existingExtended.game.platforms = details.platforms;
    if (details.developers.length > 0) existingExtended.game.developers = details.developers;
    if (details.publishers.length > 0) existingExtended.game.publishers = details.publishers;
    if (details.trailers && details.trailers.length > 0) existingExtended.game.trailers = details.trailers;
    if (details.characters.length > 0) existingExtended.game.characters = details.characters;

    await runD1("save igdb extended details", db.prepare("UPDATE media_items SET extended_data_json = ? WHERE id = ?")
      .bind(JSON.stringify(existingExtended), media.id).run());
  }

  const now = new Date().toISOString();
  await runD1("update media freshness", db.prepare(`INSERT INTO media_metadata_freshness (media_id, details_hydrated_at, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(media_id) DO UPDATE SET
        details_hydrated_at=excluded.details_hydrated_at,
        updated_at=excluded.updated_at`)
      .bind(media.id, now, now).run());
}

// ============================================================================
// RAWG (Games)
// ============================================================================
async function hydrateRawg(env: Env, job: any) {
  const db = env.DB;
  const media = await runD1("load media for rawg hydration", db.prepare("SELECT * FROM media_items WHERE id = ?").bind(job.media_id).first<any>());
  if (!media || media.source !== "rawg") throw new Error("Media not found or not RAWG");
  
  const details = await rawgFetchDetails(env, media.source_id);
  
  if (details) {
    const existingExtended = JSON.parse(media.extended_data_json || "{}");
    if (!existingExtended.game) existingExtended.game = {};
    
    if (details.platforms.length > 0) existingExtended.game.platforms = details.platforms;
    if (details.developers.length > 0) existingExtended.game.developers = details.developers;
    if (details.publishers.length > 0) existingExtended.game.publishers = details.publishers;
    if (details.trailers && details.trailers.length > 0) existingExtended.game.trailers = details.trailers;

    await runD1("save rawg extended details", db.prepare("UPDATE media_items SET extended_data_json = ? WHERE id = ?")
      .bind(JSON.stringify(existingExtended), media.id).run());
  }

  const now = new Date().toISOString();
  await runD1("update media freshness", db.prepare(`INSERT INTO media_metadata_freshness (media_id, details_hydrated_at, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(media_id) DO UPDATE SET
        details_hydrated_at=excluded.details_hydrated_at,
        updated_at=excluded.updated_at`)
      .bind(media.id, now, now).run());
}

// ============================================================================
// OpenLibrary (Books)
// ============================================================================
async function hydrateOpenLibrary(env: Env, job: any) {
  const db = env.DB;
  const media = await runD1("load media for book hydration", db.prepare("SELECT * FROM media_items WHERE id = ?").bind(job.media_id).first<any>());
  if (!media || media.source !== "openlibrary") throw new Error("Media not found or not OpenLibrary");
  
  const details = await openLibraryFetchDetails(env, media.source_id);
  
  if (details) {
    const existingExtended = JSON.parse(media.extended_data_json || "{}");
    if (!existingExtended.book) existingExtended.book = {};
    
    if (details.description) existingExtended.book.description = details.description;
    if (details.subjects.length > 0) existingExtended.book.subjects = details.subjects;
    if (details.pageCount) existingExtended.book.pageCount = details.pageCount;
    if (details.isbn10) existingExtended.book.isbn10 = details.isbn10;
    if (details.isbn13) existingExtended.book.isbn13 = details.isbn13;

    await runD1("save book extended details", db.prepare("UPDATE media_items SET extended_data_json = ? WHERE id = ?")
      .bind(JSON.stringify(existingExtended), media.id).run());
  }

  const now = new Date().toISOString();
  await runD1("update media freshness", db.prepare(`INSERT INTO media_metadata_freshness (media_id, details_hydrated_at, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(media_id) DO UPDATE SET
        details_hydrated_at=excluded.details_hydrated_at,
        updated_at=excluded.updated_at`)
      .bind(media.id, now, now).run());
}

// ============================================================================
// Jikan (Anime Details)
// ============================================================================
async function hydrateJikan(env: Env, job: any) {
  const db = env.DB;
  const media = await runD1("load media for jikan hydration", db.prepare("SELECT * FROM media_items WHERE id = ?").bind(job.media_id).first<any>());
  if (!media) throw new Error("Media not found");

  const results = await jikanSearchAnime(env, media.title, 1);
  if (!results || results.length === 0) return;
  const anime = results[0];
  const malId = anime.mal_id;

  const characters = await jikanAnimeCharacters(env, malId);
  const episodes = await jikanAnimeEpisodes(env, malId);

  // Extract details
  const studios = (anime.studios || []).map((s: any) => ({ name: s.name, url: s.url }));
  const jikanRating = anime.score;
  const broadcast = anime.broadcast ? `${anime.broadcast.day} at ${anime.broadcast.time} (${anime.broadcast.timezone})` : null;
  const status = anime.status;
  const languages = ["Japanese"]; // Jikan primarily indexes Japanese original, we infer English from dub cast
  
  // Extract cast
  const jikanCast = characters.map((c: any) => {
     // Find japanese and english voice actors
     const vaJp = c.voice_actors?.find((va: any) => va.language === "Japanese")?.person;
     const vaEn = c.voice_actors?.find((va: any) => va.language === "English")?.person;
     if (vaEn) languages.push("English"); // Infer dub availability
     return {
       character: { id: c.character?.mal_id, name: c.character?.name, image: c.character?.images?.jpg?.image_url },
       japaneseCast: vaJp ? { id: vaJp.mal_id, name: vaJp.name, image: vaJp.images?.jpg?.image_url } : null,
       englishCast: vaEn ? { id: vaEn.mal_id, name: vaEn.name, image: vaEn.images?.jpg?.image_url } : null,
     };
  }).slice(0, 16);

  const uniqueLanguages = Array.from(new Set(languages));

  const existingExtended = JSON.parse(media.extended_data_json || "{}");
  
  // Transform cast into ExtendedPerson array for Japanese and Dub
  const japaneseCast = jikanCast.map(c => ({
    id: c.japaneseCast?.id || c.character?.id,
    name: c.japaneseCast?.name || "Unknown VA",
    role: c.character?.name,
    profilePath: c.japaneseCast?.image || c.character?.image
  })).filter(c => c.id);

  const dubCast = jikanCast.filter(c => c.englishCast).map(c => ({
    id: c.englishCast?.id,
    name: c.englishCast?.name || "Unknown VA",
    role: c.character?.name,
    profilePath: c.englishCast?.image || c.character?.image
  }));

  existingExtended.anime = {
    malId,
    studios,
    malRating: jikanRating,
    broadcast,
    status,
    originalLanguage: "Japanese",
    audioLanguages: uniqueLanguages,
    japaneseCast,
    dubCast,
    episodes: episodes.slice(0, 24).map((e: any) => ({ 
      title: e.title, 
      titleJapanese: e.title_japanese, 
      aired: e.aired,
      filler: e.filler,
      recap: e.recap
    })),
  };

  const now = new Date().toISOString();
  await runD1("update hydrated anime with jikan", db.prepare(`UPDATE media_items SET extended_data_json = ?, updated_at = ? WHERE id = ?`)
    .bind(JSON.stringify(existingExtended), now, media.id).run());
    
  await runD1("update media freshness", db.prepare(`INSERT INTO media_metadata_freshness (media_id, details_hydrated_at, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(media_id) DO UPDATE SET
        details_hydrated_at=excluded.details_hydrated_at,
        updated_at=excluded.updated_at`)
      .bind(media.id, now, now).run());
}
