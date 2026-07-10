import type { MediaType } from "@shared/media";
import { randomId } from "./crypto";
import { envString } from "./env";

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
      WHERE status = 'queued' OR (status = 'running' AND updated_at < datetime('now', '-10 minutes'))
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
    WHERE id = ? AND (status = 'queued' OR (status = 'running' AND updated_at < datetime('now', '-10 minutes')))` )
    .bind(new Date().toISOString(), job.id)
    .run());
  if (!claim.meta?.changes) return false;
  try {
    if (job.provider === "tmdb") {
      await hydrateTmdb(env, job);
    }
    await runD1("delete completed/stale hydration jobs", db.prepare(`DELETE FROM metadata_refresh_jobs
      WHERE id = ? OR (media_id = ? AND provider = ? AND scope = ? AND status = 'failed')`)
      .bind(job.id, job.media_id, job.provider, job.scope)
      .run());
  } catch (err) {
    console.error(`Hydration failed for job ${job.id} (${job.provider}:${job.scope}:${job.media_id}):`, err);
    await db.prepare("UPDATE metadata_refresh_jobs SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?")
      .bind(err instanceof Error ? err.message : String(err), new Date().toISOString(), job.id).run();
  }
  return true;
}

async function hydrateTmdb(env: Env, job: any) {
  const db = env.DB;
  const key = envString(env, "TMDB_API_KEY");
  if (!key) throw new Error("TMDB_API_KEY missing");

  const media = await runD1("load media for hydration", db.prepare("SELECT * FROM media_items WHERE id = ?").bind(job.media_id).first<any>());
  if (!media) throw new Error("Media not found");

  const externalIdRow = await runD1("load TMDB id for hydration", db.prepare("SELECT external_id FROM media_external_ids WHERE media_id = ? AND source = 'tmdb'").bind(job.media_id).first<{ external_id: string }>());
  const tmdbId = externalIdRow?.external_id;
  if (!tmdbId) throw new Error("No TMDB ID for media");

  if (job.scope === "media") {
    const typePath = media.type === "movie" ? "movie" : "tv";
    const res = await fetch(`https://api.themoviedb.org/3/${typePath}/${tmdbId}?api_key=${key}&append_to_response=credits,recommendations,similar,watch/providers,external_ids,videos`);
    if (!res.ok) throw new Error(`TMDB error: ${res.statusText}`);
    const data = await res.json() as any;

    const now = new Date();

    // Extract compact extended data for media_items
    const cast = (data.credits?.cast || []).slice(0, 16).map((c: any) => ({ id: c.id, name: c.name, role: c.character, profilePath: tmdbImage(c.profile_path, "w185") }));
    const crewJobs = new Set(["Director", "Writer", "Screenplay", "Producer", "Executive Producer"]);
    const crew = (data.credits?.crew || []).filter((c: any) => crewJobs.has(c.job)).slice(0, 20).map((c: any) => ({ id: c.id, name: c.name, job: c.job }));
    const creators = (data.created_by || []).map((c: any) => ({ id: c.id, name: c.name, job: "Creator", profilePath: tmdbImage(c.profile_path, "w185") }));
    const watchProviders = data["watch/providers"]?.results?.US?.flatrate?.map((p: any) => ({ name: p.provider_name, logoPath: tmdbImage(p.logo_path, "w92") })) || [];
    const related = [...(data.recommendations?.results || []), ...(data.similar?.results || [])].slice(0, 10).map((r: any) => ({ id: r.id, title: r.title || r.name, posterPath: tmdbImage(r.poster_path, "w342"), type: r.media_type || media.type }));
    const videos = (data.videos?.results || []).filter((v: any) => v.site === "YouTube").slice(0, 3).map((v: any) => ({ name: v.name, key: v.key, type: v.type }));
    const releaseDate = media.type === "movie" ? data.release_date : data.first_air_date;
    const runtime = media.type === "movie" ? data.runtime : (data.episode_run_time?.[0] ?? null);
    
    const extendedData = { cast, crew, creators, watchProviders, related, videos, externalIds: data.external_ids, rating: data.vote_average, voteCount: data.vote_count, popularity: data.popularity, genres: data.genres || [], homepage: data.homepage || null };

    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const compactCache = {
      id: data.id,
      type: media.type,
      title: data.title ?? data.name ?? media.title,
      status: data.status ?? null,
      releaseDate,
      posterPath: tmdbImage(data.poster_path, "w342"),
      backdropPath: tmdbImage(data.backdrop_path, "w780"),
      rating: data.vote_average ?? null,
      voteCount: data.vote_count ?? null,
      hydratedAt: now.toISOString(),
    };
    await runD1("cache TMDB media detail", db.prepare(`INSERT INTO provider_cache (id, provider, cache_key, response_json, status, fetched_at, expires_at, attribution_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, cache_key) DO UPDATE SET response_json=excluded.response_json, status=excluded.status, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at`)
      .bind(randomId("pc"), "tmdb", `detail:${media.id}`, JSON.stringify(compactCache), res.status, now.toISOString(), expires.toISOString(), null)
      .run());

    await runD1("update hydrated media item", db.prepare(`UPDATE media_items SET
      overview = COALESCE(?, overview),
      poster_path = COALESCE(?, poster_path),
      backdrop_path = COALESCE(?, backdrop_path),
      release_date = COALESCE(?, release_date),
      runtime_minutes = COALESCE(?, runtime_minutes),
      air_status = COALESCE(?, air_status),
      extended_data_json = ?, 
      total_seasons = COALESCE(?, total_seasons), 
      total_episodes = COALESCE(?, total_episodes),
      updated_at = ? 
      WHERE id = ?`)
      .bind(data.overview || null, tmdbImage(data.poster_path, "w342"), tmdbImage(data.backdrop_path, "w780"), releaseDate || null, runtime || null, inferTmdbStatus(data.status, media.type), JSON.stringify(extendedData), data.number_of_seasons || null, data.number_of_episodes || null, now.toISOString(), media.id).run());
      
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
  } else if (job.scope === "season") {
    const context = JSON.parse(job.context_json || "{}");
    const seasonNum = context.seasonNumber;
    const episodeOffset = Number(context.episodeOffset ?? 0);
    const episodeLimit = 20;
    if (seasonNum == null) throw new Error("Missing season number in context");

    const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${key}&append_to_response=credits,videos`);
    if (!res.ok) throw new Error(`TMDB error: ${res.statusText}`);
    const data = await res.json() as any;

    const now = new Date().toISOString();
    
    // Ensure season exists
    const seasonRow = await runD1("load hydrated season", db.prepare("SELECT id FROM seasons WHERE media_id = ? AND season_number = ?").bind(media.id, seasonNum).first<{ id: string }>());
    let seasonId = seasonRow?.id;
    if (!seasonId) {
      seasonId = randomId("sea");
      await runD1("insert hydrated season", db.prepare("INSERT INTO seasons (id, media_id, season_number, name, overview, poster_path, episode_count, air_date, is_special, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(seasonId, media.id, seasonNum, data.name, data.overview, tmdbImage(data.poster_path, "w342"), data.episodes?.length || 0, data.air_date, seasonNum === 0 ? 1 : 0, now, now).run());
    } else {
      await runD1("update hydrated season", db.prepare("UPDATE seasons SET name = ?, overview = ?, poster_path = ?, episode_count = ?, air_date = ?, updated_at = ? WHERE id = ?")
        .bind(data.name, data.overview, tmdbImage(data.poster_path, "w342"), data.episodes?.length || 0, data.air_date, now, seasonId).run());
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
        await runD1("update hydrated episode", db.prepare("UPDATE episodes SET name = ?, overview = ?, still_path = ?, air_date = ?, runtime_minutes = ?, external_id = COALESCE(external_id, ?), extended_data_json = ?, updated_at = ? WHERE id = ?")
          .bind(ep.name, ep.overview, tmdbImage(ep.still_path, "w300"), ep.air_date, ep.runtime, String(ep.id ?? ""), JSON.stringify(extendedData), now, existingEpisodeId).run());
      } else {
        await runD1("insert hydrated episode", db.prepare("INSERT INTO episodes (id, media_id, season_id, season_number, episode_number, name, overview, still_path, air_date, runtime_minutes, is_special, external_id, extended_data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(randomId("epi"), media.id, seasonId, seasonNum, ep.episode_number, ep.name, ep.overview, tmdbImage(ep.still_path, "w300"), ep.air_date, ep.runtime, seasonNum === 0 ? 1 : 0, String(ep.id ?? ""), JSON.stringify(extendedData), now, now).run());
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
  const existing = await runD1("find existing hydration job", db.prepare(`SELECT id FROM metadata_refresh_jobs
    WHERE media_id = ? AND provider = ? AND scope = ? AND COALESCE(context_json, '') = COALESCE(?, '')
      AND status IN ('queued', 'running')
    LIMIT 1`)
    .bind(mediaId, provider, scope, contextJson)
    .first<{ id: string }>());
  if (existing) return existing.id;
  const id = randomId("mrj");
  await runD1("insert hydration job", db.prepare("INSERT INTO metadata_refresh_jobs (id, media_id, provider, scope, status, attempts, last_error, created_at, updated_at, context_json) VALUES (?, ?, ?, ?, 'queued', 0, NULL, ?, ?, ?)")
    .bind(id, mediaId, provider, scope, now, now, contextJson)
    .run());
  return id;
}

async function enqueueSeasonHydrationJobs(db: D1Database, mediaId: string, provider: string, now: string, seasonNumbers: Array<number | null | undefined>) {
  const uniqueSeasonNumbers = [...new Set(seasonNumbers.filter((seasonNumber): seasonNumber is number => Number.isFinite(seasonNumber)))];
  if (uniqueSeasonNumbers.length === 0) return;

  const existing = await runD1("load queued season hydration jobs", db.prepare(`SELECT context_json FROM metadata_refresh_jobs
    WHERE media_id = ? AND provider = ? AND scope = 'season' AND status IN ('queued', 'running')`)
    .bind(mediaId, provider)
    .all<{ context_json: string | null }>());
  const existingKeys = new Set((existing.results || []).map((row) => row.context_json ?? ""));

  for (const seasonNumber of uniqueSeasonNumbers) {
    const contextJson = JSON.stringify({ seasonNumber });
    if (existingKeys.has(contextJson)) continue;
    await runD1("insert season hydration job", db.prepare("INSERT INTO metadata_refresh_jobs (id, media_id, provider, scope, status, attempts, last_error, created_at, updated_at, context_json) VALUES (?, ?, ?, 'season', 'queued', 0, NULL, ?, ?, ?)")
      .bind(randomId("mrj"), mediaId, provider, now, now, contextJson)
      .run());
  }
}

function tmdbImage(path: string | null | undefined, size: string) {
  if (!path) return null;
  return String(path).startsWith("http") ? String(path) : `https://image.tmdb.org/t/p/${size}${path}`;
}

function inferTmdbStatus(status: string | null | undefined, type: MediaType) {
  if (!status) return null;
  if (status === "Ended" || status === "Released") return type === "movie" ? "released" : "ended";
  if (status === "Returning Series" || status === "In Production") return "continuing";
  if (status === "Planned" || status === "Post Production") return "upcoming";
  return null;
}
