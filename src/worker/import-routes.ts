import { Hono } from "hono";
import {
  createImportJobSchema,
  dryRunImportJobSchema,
  uploadImportChunkSchema,
  type TvTimeImportItem,
  type TvTimeEpisode,
  type TvTimeMovieItem,
  type TvTimeShowItem,
} from "@shared/tv-time-import";
import { randomId } from "./crypto";
import { apiError, apiSuccess } from "./http";
import { bumpUserLibraryVersion } from "./library-version-service";
import { resolveOrCreateImportedCanonicalMedia } from "./media-canonical-service";
import { requireAuth, requireCsrf, type AppVariables } from "./session";

type ImportJobRow = {
  id: string;
  user_id: string;
  source: string;
  status: string;
  file_names_json: string;
  counts_json: string | null;
  error_message: string | null;
  committed_at: string | null;
  rolled_back_at: string | null;
  created_at: string;
  updated_at: string;
};

type ImportItemRow = {
  id: string;
  job_id: string;
  user_id: string;
  item_key: string;
  item_kind: "show" | "movie";
  chunk_index: number;
  raw_json: string;
  status: string;
  media_id: string | null;
  created_at: string;
  updated_at: string;
};

type TvTimeShow = TvTimeShowItem;
type TvTimeMovie = TvTimeMovieItem;

export function createImportRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  router.post("/tv-time/jobs", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const body = createImportJobSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Import job request is invalid.", body.error.flatten());
    const auth = c.get("auth");
    const now = new Date().toISOString();
    const job = {
      id: randomId("imp"),
      userId: auth.user.id,
      status: "created",
      fileNamesJson: JSON.stringify(body.data.fileNames),
      countsJson: body.data.counts ? JSON.stringify(body.data.counts) : null,
      createdAt: now,
      updatedAt: now,
    };
    await c.env.DB.prepare("INSERT INTO import_jobs (id, user_id, source, status, file_names_json, counts_json, created_at, updated_at) VALUES (?, ?, 'tv_time', ?, ?, ?, ?, ?)")
      .bind(job.id, job.userId, job.status, job.fileNamesJson, job.countsJson, job.createdAt, job.updatedAt)
      .run();
    return c.json(apiSuccess({ job: await readJob(c.env.DB, auth.user.id, job.id) }), 201);
  });

  router.post("/tv-time/jobs/:id/dry-run", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const body = dryRunImportJobSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Dry run request is invalid.", body.error.flatten());
    const auth = c.get("auth");
    const job = await readJobRow(c.env.DB, auth.user.id, c.req.param("id"));
    if (!job) return apiError(c, 404, "not_found", "Import job not found.");
    const now = new Date().toISOString();
    await c.env.DB.prepare("UPDATE import_jobs SET status = 'dry_run', counts_json = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(body.data.counts), now, job.id)
      .run();
    await replaceWarnings(c.env.DB, job.id, body.data.warnings, now);
    return c.json(apiSuccess({ job: await readJob(c.env.DB, auth.user.id, job.id) }));
  });

  router.post("/tv-time/jobs/:id/chunks", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const body = uploadImportChunkSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Import chunk is invalid.", body.error.flatten());
    const auth = c.get("auth");
    const job = await readJobRow(c.env.DB, auth.user.id, c.req.param("id"));
    if (!job) return apiError(c, 404, "not_found", "Import job not found.");
    if (job.status === "committed" || job.status === "rolled_back") return apiError(c, 409, "conflict", "This import job can no longer accept chunks.");
    const now = new Date().toISOString();
    const statements = body.data.items.map((item) =>
      c.env.DB.prepare(`INSERT INTO import_job_items (id, job_id, user_id, item_key, item_kind, chunk_index, raw_json, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?)
        ON CONFLICT(job_id, item_key) DO UPDATE SET chunk_index=excluded.chunk_index, raw_json=excluded.raw_json, status='uploaded', updated_at=excluded.updated_at`)
        .bind(randomId("imi"), job.id, auth.user.id, item.itemKey, item.kind, body.data.chunkIndex, JSON.stringify(item), now, now),
    );
    statements.push(c.env.DB.prepare("UPDATE import_jobs SET status = 'uploaded', updated_at = ? WHERE id = ?").bind(now, job.id));
    await c.env.DB.batch(statements);
    return c.json(apiSuccess({ accepted: body.data.items.length, job: await readJob(c.env.DB, auth.user.id, job.id) }));
  });

  router.post("/tv-time/jobs/:id/commit", requireAuth(), requireCsrf(), async (c) => {
    try {
      if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
      const auth = c.get("auth");
      const job = await readJobRow(c.env.DB, auth.user.id, c.req.param("id"));
      if (!job) return apiError(c, 404, "not_found", "Import job not found.");
      if (job.status === "committed") return c.json(apiSuccess({ done: true, job: await readJob(c.env.DB, auth.user.id, job.id) }));
      if (job.status === "rolled_back" || job.status === "abandoned") return apiError(c, 409, "conflict", "This import job can no longer be committed.");
      if (job.status === "failed") return apiError(c, 409, "conflict", "Import has failed. Abandon and restart or rollback.");
      
      const rows = await c.env.DB.prepare("SELECT * FROM import_job_items WHERE job_id = ? AND status = 'uploaded' ORDER BY chunk_index, item_key LIMIT 15").bind(job.id).all<ImportItemRow>();
      const now = new Date().toISOString();
      
      if (job.status !== "committing") {
        await c.env.DB.prepare("UPDATE import_jobs SET status = 'committing', updated_at = ? WHERE id = ?").bind(now, job.id).run();
      }

      if (rows.results.length === 0) {
        await c.env.DB.prepare("UPDATE import_jobs SET status = 'committed', committed_at = ?, updated_at = ? WHERE id = ?").bind(now, now, job.id).run();
        const libraryVersion = await bumpUserLibraryVersion(c.env.DB, auth.user.id);
        return c.json(apiSuccess({ done: true, job: await readJob(c.env.DB, auth.user.id, job.id), libraryVersion }));
      }

      try {
        for (const row of rows.results) {
          const item = JSON.parse(row.raw_json) as TvTimeImportItem;
          const mediaId = item.kind === "show"
            ? await commitShow(c.env.DB, auth.user.id, job.id, item, now)
            : await commitMovie(c.env.DB, auth.user.id, job.id, item, now);
          await c.env.DB.prepare("UPDATE import_job_items SET status = 'committed', media_id = ?, updated_at = ? WHERE id = ?")
            .bind(mediaId, now, row.id)
            .run();
        }
      } catch (error) {
        console.error("IMPORT COMMIT CRASHED:", error);
        const message = error instanceof Error ? (error.stack || error.message) : "Import commit failed.";
        await c.env.DB.prepare("UPDATE import_jobs SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?").bind(message, now, job.id).run();
        return apiError(c, 500, "server_error", message);
      }

      const stats = await c.env.DB.prepare("SELECT status, COUNT(*) as count FROM import_job_items WHERE job_id = ? GROUP BY status").bind(job.id).all<{ status: string; count: number }>();
      let processed = 0;
      let total = 0;
      for (const stat of stats.results) {
        total += stat.count;
        if (stat.status === 'committed') processed += stat.count;
      }
      
      return c.json(apiSuccess({ done: false, processed, total, job: await readJob(c.env.DB, auth.user.id, job.id) }));
    } catch (outerError) {
      console.error("OUTER IMPORT COMMIT CRASHED:", outerError);
      const message = outerError instanceof Error ? (outerError.stack || outerError.message) : "Outer import commit failed.";
      return apiError(c, 500, "server_error", message);
    }
  });

  router.post("/tv-time/jobs/:id/rollback", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const auth = c.get("auth");
    const job = await readJobRow(c.env.DB, auth.user.id, c.req.param("id"));
    if (!job) return apiError(c, 404, "not_found", "Import job not found.");

    if (job.status !== "committed" && job.status !== "rolling_back") {
      return apiError(c, 400, "invalid_state", "Only committed imports can be rolled back.");
    }
    
    if (job.status === "committed") {
      const now = new Date().toISOString();
      await c.env.DB.prepare("UPDATE import_jobs SET status = 'rolling_back', updated_at = ? WHERE id = ?").bind(now, job.id).run();
    }

    const batch = await c.env.DB.prepare("SELECT id, table_name, record_id FROM import_created_records WHERE job_id = ? ORDER BY created_at DESC LIMIT 50").bind(job.id).all<{ id: string; table_name: string; record_id: string }>();

    if (batch.results.length === 0) {
      const now = new Date().toISOString();
      await c.env.DB.prepare("UPDATE import_jobs SET status = 'rolled_back', rolled_back_at = ?, updated_at = ? WHERE id = ?").bind(now, now, job.id).run();
      await c.env.DB.prepare("UPDATE import_job_items SET status = 'rolled_back', media_id = NULL, updated_at = ? WHERE job_id = ?").bind(now, job.id).run();
      const libraryVersion = await bumpUserLibraryVersion(c.env.DB, auth.user.id);
      return c.json(apiSuccess({ done: true, job: await readJob(c.env.DB, auth.user.id, job.id), libraryVersion }));
    }

    const deleteStatements: any[] = [];
    for (const record of batch.results) {
      deleteStatements.push(c.env.DB.prepare(`DELETE FROM ${record.table_name} WHERE id = ?`).bind(record.record_id));
    }
    
    const idsToDelete = batch.results.map(r => r.id);
    const placeholders = idsToDelete.map(() => "?").join(",");
    deleteStatements.push(c.env.DB.prepare(`DELETE FROM import_created_records WHERE id IN (${placeholders})`).bind(...idsToDelete));

    await c.env.DB.batch(deleteStatements);

    const remaining = await c.env.DB.prepare("SELECT COUNT(*) as count FROM import_created_records WHERE job_id = ?").bind(job.id).first<{ count: number }>();
    return c.json(apiSuccess({ done: false, remaining: remaining?.count || 0 }));
  });

  router.get("/tv-time/jobs/:id", requireAuth(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const auth = c.get("auth");
    const job = await readJob(c.env.DB, auth.user.id, c.req.param("id"));
    if (!job) return apiError(c, 404, "not_found", "Import job not found.");
    return c.json(apiSuccess({ job }));
  });



  router.get("/tv-time/jobs", requireAuth(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const auth = c.get("auth");
    const rows = await c.env.DB.prepare("SELECT * FROM import_jobs WHERE user_id = ? ORDER BY created_at DESC").bind(auth.user.id).all();
    const jobs = [];
    for (const r of rows.results) {
      const itemStats = await c.env.DB.prepare("SELECT item_kind, status, COUNT(*) AS count FROM import_job_items WHERE job_id = ? GROUP BY item_kind, status").bind(r.id).all<{ item_kind: string; status: string; count: number }>();
      const warnings = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM import_warnings WHERE job_id = ?").bind(r.id).first<{ count: number }>();
      const remainingCreated = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM import_created_records WHERE job_id = ?").bind(r.id).first<{ count: number }>();

      jobs.push({
        id: r.id,
        user_id: r.user_id,
        source: r.source,
        status: r.status,
        fileNames: JSON.parse(r.file_names_json as string),
        counts: r.counts_json ? JSON.parse(r.counts_json as string) : null,
        error_message: r.error_message,
        committed_at: r.committed_at,
        rolled_back_at: r.rolled_back_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
        itemStats: itemStats.results,
        warningCount: warnings?.count ?? 0,
        remainingCreatedRecords: remainingCreated?.count ?? 0,
      });
    }
    return c.json(apiSuccess({ jobs }));
  });

  router.post("/tv-time/jobs/:id/abandon", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const auth = c.get("auth");
    const job = await readJobRow(c.env.DB, auth.user.id, c.req.param("id"));
    if (!job) return apiError(c, 404, "not_found", "Import job not found.");
    const terminableStatuses = ["committing", "rolling_back", "uploaded", "created", "failed"];
    if (!terminableStatuses.includes(job.status)) {
      return apiError(c, 400, "invalid_state", `Cannot abandon a job with status '${job.status}'.`);
    }
    const now = new Date().toISOString();
    await c.env.DB.prepare("UPDATE import_jobs SET status = 'failed', error_message = 'Manually stopped.', updated_at = ? WHERE id = ?")
      .bind(now, job.id)
      .run();
    return c.json(apiSuccess({ job: await readJob(c.env.DB, auth.user.id, job.id) }));
  });

  router.delete("/tv-time/jobs/:id", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const auth = c.get("auth");
    const job = await readJobRow(c.env.DB, auth.user.id, c.req.param("id"));
    if (!job) return apiError(c, 404, "not_found", "Import job not found.");
    await c.env.DB.prepare("DELETE FROM import_jobs WHERE id = ?").bind(job.id).run();
    return c.json(apiSuccess({ deleted: true }));
  });

  return router;
}

function prepareRecordCreated(db: D1Database, jobId: string, tableName: string, recordId: string, now: string) {
  return db.prepare("INSERT OR IGNORE INTO import_created_records (id, job_id, table_name, record_id, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(randomId("icr"), jobId, tableName, recordId, now);
}

async function commitShow(db: D1Database, userId: string, jobId: string, item: TvTimeShow, now: string) {
  const mediaId = await resolveOrCreateMedia(db, jobId, {
    type: "show",
    title: item.title,
    year: item.createdAt ? new Date(item.createdAt).getUTCFullYear() : null,
    sourceUuid: item.sourceUuid,
    tvdbId: item.tvdbId,
    imdbId: item.imdbId,
    releaseDate: null,
    createdAt: item.createdAt,
  }, now);

  const progressEpisodes = item.seasons.flatMap((s) => s.episodes).filter((e) => e.isWatched && !e.isSpecial).length;
  const userMediaExisted = await rowExists(db, "user_media", "user_id = ? AND media_id = ?", [userId, mediaId]);
  const userMediaId = userMediaExisted ? await findUserMediaId(db, userId, mediaId) : randomId("ulm");

  const batchStatements: any[] = [];

  batchStatements.push(
    db.prepare(`INSERT INTO user_media (id, user_id, media_id, status, is_favorite, rating, notes, watched_at, rewatch_count, progress_episodes, visibility, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?, 'private', ?, ?)
      ON CONFLICT(user_id, media_id) DO UPDATE SET status=excluded.status, is_favorite=excluded.is_favorite, progress_episodes=excluded.progress_episodes, updated_at=excluded.updated_at`)
      .bind(userMediaId, userId, mediaId, normalizeShowStatus(item.status), item.isFavorite ? 1 : 0, progressEpisodes, item.createdAt ?? now, now)
  );

  if (!userMediaExisted) {
    batchStatements.push(prepareRecordCreated(db, jobId, "user_media", userMediaId, now));
  }

  // 2. Fetch existing seasons and map them
  const existingSeasonsRows = await db.prepare("SELECT id, season_number FROM seasons WHERE media_id = ?").bind(mediaId).all<{ id: string; season_number: number }>();
  const seasonMap = new Map<number, string>();
  for (const s of existingSeasonsRows.results) {
    seasonMap.set(s.season_number, s.id);
  }

  // 3. Fetch existing episodes and map them
  const existingEpisodesRows = await db.prepare("SELECT id, season_number, episode_number FROM episodes WHERE media_id = ?").bind(mediaId).all<{ id: string; season_number: number; episode_number: number }>();
  const episodeMap = new Map<string, string>();
  for (const e of existingEpisodesRows.results) {
    episodeMap.set(`${e.season_number}_${e.episode_number}`, e.id);
  }

  // 4. Fetch existing activities and map them
  const existingActivitiesRows = await db.prepare("SELECT episode_id FROM episode_activity WHERE user_id = ? AND media_id = ?").bind(userId, mediaId).all<{ episode_id: string }>();
  const activitySet = new Set<string>();
  for (const a of existingActivitiesRows.results) {
    activitySet.add(a.episode_id);
  }

  // 5. Loop through seasons and episodes
  for (const season of item.seasons) {
    let seasonId = seasonMap.get(season.number);
    if (!seasonId) {
      seasonId = randomId("sea");
      seasonMap.set(season.number, seasonId);
      batchStatements.push(
        db.prepare("INSERT INTO seasons (id, media_id, season_number, name, overview, poster_path, episode_count, air_date, is_special, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?, ?)")
          .bind(seasonId, mediaId, season.number, season.number === 0 ? "Specials" : `Season ${season.number}`, season.episodes.length, season.isSpecial ? 1 : 0, now, now)
      );
      batchStatements.push(prepareRecordCreated(db, jobId, "seasons", seasonId, now));
    }

    for (const episode of season.episodes) {
      const epKey = `${episode.seasonNumber}_${episode.episodeNumber}`;
      let episodeId = episodeMap.get(epKey);
      if (!episodeId) {
        episodeId = randomId("epi");
        episodeMap.set(epKey, episodeId);
        batchStatements.push(
          db.prepare("INSERT INTO episodes (id, media_id, season_id, season_number, episode_number, name, overview, still_path, air_date, runtime_minutes, is_special, external_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?)")
            .bind(episodeId, mediaId, seasonId, episode.seasonNumber, episode.episodeNumber, episode.name, episode.isSpecial ? 1 : 0, episode.tvdbId, now, now)
        );
        batchStatements.push(prepareRecordCreated(db, jobId, "episodes", episodeId, now));
      }

      if (episode.isWatched) {
        const activityId = randomId("epa");
        batchStatements.push(
          db.prepare(`INSERT INTO episode_activity (id, user_id, episode_id, media_id, watched, watched_at, rewatch_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
            ON CONFLICT(user_id, episode_id) DO UPDATE SET watched=1, watched_at=excluded.watched_at, rewatch_count=excluded.rewatch_count, updated_at=excluded.updated_at`)
            .bind(activityId, userId, episodeId, mediaId, normalizeDateTime(episode.watchedAt), episode.rewatchCount, episode.watchedAt ?? now, now)
        );
        if (!activitySet.has(episodeId)) {
          batchStatements.push(prepareRecordCreated(db, jobId, "episode_activity", activityId, now));
        }
      }
    }
  }

  // 6. Execute statements in chunks of 100
  for (let i = 0; i < batchStatements.length; i += 100) {
    await db.batch(batchStatements.slice(i, i + 100));
  }

  return mediaId;
}

async function commitMovie(db: D1Database, userId: string, jobId: string, item: TvTimeMovie, now: string) {
  const mediaId = await resolveOrCreateMedia(db, jobId, {
    type: "movie",
    title: item.title,
    year: item.year,
    sourceUuid: item.sourceUuid,
    tvdbId: item.tvdbId,
    imdbId: item.imdbId,
    releaseDate: item.year ? `${item.year}-01-01` : null,
    createdAt: item.createdAt,
  }, now);
  const userMediaExisted = await rowExists(db, "user_media", "user_id = ? AND media_id = ?", [userId, mediaId]);
  const userMediaId = userMediaExisted ? await findUserMediaId(db, userId, mediaId) : randomId("ulm");
  await db.prepare(`INSERT INTO user_media (id, user_id, media_id, status, is_favorite, rating, notes, watched_at, rewatch_count, progress_episodes, visibility, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, 0, 'private', ?, ?)
    ON CONFLICT(user_id, media_id) DO UPDATE SET status=excluded.status, is_favorite=excluded.is_favorite, watched_at=excluded.watched_at, rewatch_count=excluded.rewatch_count, updated_at=excluded.updated_at`)
    .bind(userMediaId, userId, mediaId, item.isWatched ? "watched" : "watch_later", item.isFavorite ? 1 : 0, normalizeDateTime(item.watchedAt), item.rewatchCount, item.createdAt ?? now, now)
    .run();
  if (!userMediaExisted) await recordCreated(db, jobId, "user_media", userMediaId, now);
  return mediaId;
}

async function resolveOrCreateMedia(db: D1Database, jobId: string, input: { type: "show" | "movie"; title: string; year: number | null; sourceUuid: string | null; tvdbId: string | null; imdbId: string | null; releaseDate: string | null; createdAt: string | null }, now: string) {
  const result = await resolveOrCreateImportedCanonicalMedia({
    db,
    item: input,
    now,
    onCreated: (tableName, recordId) => recordCreated(db, jobId, tableName, recordId, now),
  });
  if (result.created) {
    await addWarning(db, jobId, input.sourceUuid ?? input.tvdbId ?? input.title, "warning", "placeholder_created", `Created a lightweight placeholder for ${input.title}.`, { title: input.title }, now);
  }
  return result.mediaId;
}

async function resolveOrCreateSeason(db: D1Database, jobId: string, mediaId: string, seasonNumber: number, isSpecial: boolean, episodeCount: number, now: string) {
  const existing = await db.prepare("SELECT id FROM seasons WHERE media_id = ? AND season_number = ?").bind(mediaId, seasonNumber).first<{ id: string }>();
  if (existing) return existing.id;
  const id = randomId("sea");
  await db.prepare("INSERT INTO seasons (id, media_id, season_number, name, overview, poster_path, episode_count, air_date, is_special, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?, ?)")
    .bind(id, mediaId, seasonNumber, seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`, episodeCount, isSpecial ? 1 : 0, now, now)
    .run();
  await recordCreated(db, jobId, "seasons", id, now);
  return id;
}

async function resolveOrCreateEpisode(db: D1Database, jobId: string, mediaId: string, seasonId: string, episode: TvTimeEpisode, now: string) {
  const existing = await db.prepare("SELECT id FROM episodes WHERE media_id = ? AND season_number = ? AND episode_number = ?").bind(mediaId, episode.seasonNumber, episode.episodeNumber).first<{ id: string }>();
  if (existing) return existing.id;
  const id = randomId("epi");
  await db.prepare("INSERT INTO episodes (id, media_id, season_id, season_number, episode_number, name, overview, still_path, air_date, runtime_minutes, is_special, external_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?)")
    .bind(id, mediaId, seasonId, episode.seasonNumber, episode.episodeNumber, episode.name, episode.isSpecial ? 1 : 0, episode.tvdbId, now, now)
    .run();
  await recordCreated(db, jobId, "episodes", id, now);
  return id;
}

async function readJob(db: D1Database, userId: string, jobId: string) {
  const job = await readJobRow(db, userId, jobId);
  if (!job) return null;
  const warnings = await db.prepare("SELECT severity, code, message, item_key, details_json FROM import_warnings WHERE job_id = ? ORDER BY created_at").bind(job.id).all<{ severity: string; code: string; message: string; item_key: string | null; details_json: string | null }>();
  const itemStats = await db.prepare("SELECT item_kind, status, COUNT(*) AS count FROM import_job_items WHERE job_id = ? GROUP BY item_kind, status").bind(job.id).all<{ item_kind: string; status: string; count: number }>();
  return {
    id: job.id,
    status: job.status,
    source: job.source,
    fileNames: JSON.parse(job.file_names_json) as string[],
    counts: job.counts_json ? JSON.parse(job.counts_json) : null,
    errorMessage: job.error_message,
    committedAt: job.committed_at,
    rolledBackAt: job.rolled_back_at,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    warnings: warnings.results.map((warning) => ({ severity: warning.severity, code: warning.code, message: warning.message, itemKey: warning.item_key, details: warning.details_json ? JSON.parse(warning.details_json) : undefined })),
    itemStats: itemStats.results,
  };
}

async function readJobRow(db: D1Database, userId: string, jobId: string) {
  return db.prepare("SELECT * FROM import_jobs WHERE id = ? AND user_id = ?").bind(jobId, userId).first<ImportJobRow>();
}

async function replaceWarnings(db: D1Database, jobId: string, warnings: Array<{ severity: "info" | "warning" | "error"; code: string; message: string; itemKey?: string; details?: unknown }>, now: string) {
  const statements = [db.prepare("DELETE FROM import_warnings WHERE job_id = ?").bind(jobId)];
  for (const warning of warnings) {
    statements.push(
      db.prepare("INSERT INTO import_warnings (id, job_id, item_key, severity, code, message, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(
          randomId("imw"),
          jobId,
          warning.itemKey ?? null,
          warning.severity,
          warning.code,
          warning.message,
          warning.details === undefined ? null : JSON.stringify(warning.details),
          now
        )
    );
  }
  await db.batch(statements);
}

async function addWarning(db: D1Database, jobId: string, itemKey: string | null, severity: "info" | "warning" | "error", code: string, message: string, details: unknown, now: string) {
  await db.prepare("INSERT INTO import_warnings (id, job_id, item_key, severity, code, message, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(randomId("imw"), jobId, itemKey, severity, code, message, details === undefined ? null : JSON.stringify(details), now)
    .run();
}

async function recordCreated(db: D1Database, jobId: string, tableName: string, recordId: string, now: string) {
  await db.prepare("INSERT OR IGNORE INTO import_created_records (id, job_id, table_name, record_id, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(randomId("icr"), jobId, tableName, recordId, now)
    .run();
}

async function rowExists(db: D1Database, tableName: string, where: string, values: unknown[]) {
  const row = await db.prepare(`SELECT id FROM ${tableName} WHERE ${where} LIMIT 1`).bind(...values).first<{ id: string }>();
  return Boolean(row);
}

async function findUserMediaId(db: D1Database, userId: string, mediaId: string) {
  const row = await db.prepare("SELECT id FROM user_media WHERE user_id = ? AND media_id = ?").bind(userId, mediaId).first<{ id: string }>();
  return row?.id ?? randomId("ulm");
}

async function findEpisodeActivityId(db: D1Database, userId: string, episodeId: string) {
  const row = await db.prepare("SELECT id FROM episode_activity WHERE user_id = ? AND episode_id = ?").bind(userId, episodeId).first<{ id: string }>();
  return row?.id ?? randomId("epa");
}

function normalizeShowStatus(status: string) {
  if (status === "up_to_date") return "up_to_date";
  if (status === "stopped") return "stopped";
  if (status === "watch_later") return "watch_later";
  if (status === "completed") return "completed";
  return "watching";
}

function normalizeDateTime(value: string | null) {
  if (!value) return null;
  if (value.includes("T")) return value;
  return value.replace(" ", "T") + "Z";
}
