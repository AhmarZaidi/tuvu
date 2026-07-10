import { Hono } from "hono";
import { z } from "zod";
import type { MediaType } from "@shared/media";
import { randomId } from "./crypto";
import { apiError, apiSuccess } from "./http";
import type { MediaRepository } from "./media-repository";
import { providerFindByExternalId, providerSearch, type ProviderResult } from "./providers";
import { requireAuth, requireCsrf, type AppVariables } from "./session";

type MediaRow = {
  id: string;
  type: MediaType;
  title: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  air_status: string | null;
  runtime_minutes: number | null;
  release_date: string | null;
  year: number | null;
  language: string | null;
  country: string | null;
  source: string;
  source_id: string | null;
  total_episodes: number | null;
  total_seasons: number | null;
  created_at: string;
  updated_at: string;
};

type ExternalIdRow = { media_id: string; source: string; external_id: string };
type MergeCandidate = {
  source: ProviderResult & { localMediaId: string; source: string };
  candidate: ProviderResult | null;
  confidence: "external_id_exact" | "title_year_strong" | "title_only_review" | "ambiguous";
  reason: string;
};

const mergeBodySchema = z.object({
  sourceMediaId: z.string().min(1),
  targetMediaId: z.string().min(1).optional(),
  providerResult: z.object({
    provider: z.enum(["tmdb", "rawg", "openlibrary", "local"]),
    providerId: z.string(),
    type: z.enum(["show", "movie", "anime", "game", "book"]),
    title: z.string(),
    overview: z.string().nullable().optional(),
    posterPath: z.string().nullable().optional(),
    backdropPath: z.string().nullable().optional(),
    releaseDate: z.string().nullable().optional(),
    year: z.number().nullable().optional(),
    sourceUrl: z.string().nullable().optional(),
    rating: z.number().nullable().optional(),
    popularity: z.number().nullable().optional(),
    attribution: z.object({ provider: z.string(), label: z.string(), url: z.string() }),
    localMediaId: z.string().nullable().optional(),
  }).optional(),
  confidence: z.string().optional(),
  reason: z.string().optional(),
});

export function createMergeRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: AppVariables & { mediaRepository: MediaRepository } }>();

  router.get("/stats", requireAuth(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const auth = c.get("auth");
    const type = c.req.query("type");
    const typeClause = type && type !== "all" ? "AND mi.type = ?" : "";
    const binds = type && type !== "all" ? [auth.user.id, type] : [auth.user.id];
    const row = await c.env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN mma.id IS NULL THEN 1 ELSE 0 END) AS unmerged,
        SUM(CASE WHEN mma.status = 'merged' THEN 1 ELSE 0 END) AS merged,
        SUM(CASE WHEN mma.id IS NULL AND json_extract(msr.candidate_json, '$.confidence') = 'external_id_exact' THEN 1 ELSE 0 END) AS exact
      FROM user_media um
      JOIN media_items mi ON mi.id = um.media_id
      LEFT JOIN media_merge_aliases mma ON mma.source_media_id = mi.id
      LEFT JOIN media_source_records msr ON msr.media_id = mi.id
      WHERE um.user_id = ? AND mi.source IN ('tv_time','manual') ${typeClause}
    `).bind(...binds).first<{ total: number; unmerged: number | null; merged: number | null; exact: number | null }>();
    const unmerged = row?.unmerged ?? 0;
    const exact = row?.exact ?? 0;
    return c.json(apiSuccess({
      total: row?.total ?? 0,
      unmerged,
      merged: row?.merged ?? 0,
      exact,
      review: Math.max(0, unmerged - exact),
    }));
  });

  router.get("/candidates", requireAuth(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const auth = c.get("auth");
    const limit = Number(c.req.query("limit") ?? 30);
    const offset = Number(c.req.query("offset") ?? 0);
    const search = c.req.query("q")?.trim() || null;
    const candidates = await buildCandidates(c.env, auth.user.id, parseType(c.req.query("type")), limit, offset, search);
    return c.json(apiSuccess({ candidates }));
  });

  router.get("/search", requireAuth(), async (c) => {
    const query = c.req.query("q")?.trim();
    if (!query || query.length < 2) return apiError(c, 400, "validation_failed", "Search query is required.");
    const type = parseType(c.req.query("type"));
    const results = await providerSearch(c.env, query, type ? [type] : ["show", "movie", "book", "game"], 8);
    return c.json(apiSuccess({ results }));
  });

  router.post("/accept", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const auth = c.get("auth");
    const body = mergeBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Merge request is invalid.", body.error.flatten());
    const targetMediaId = body.data.targetMediaId ?? body.data.providerResult?.localMediaId ?? await createCanonicalFromProvider(c.env.DB, body.data.providerResult, new Date().toISOString());
    if (!targetMediaId) return apiError(c, 400, "validation_failed", "Merge needs a target media item.");
    const result = await mergeMedia(c.env.DB, auth.user.id, body.data.sourceMediaId, targetMediaId, body.data.confidence ?? "manual", body.data.reason ?? "Accepted from merge review.");
    c.executionCtx.waitUntil(import("./hydration").then(m => m.scheduleHydrationJobs(c.env)));
    return c.json(apiSuccess(result));
  });

  router.post("/accept-exact", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const auth = c.get("auth");
    const type = parseType(c.req.query("type"));
    const candidates = await buildCandidates(c.env, auth.user.id, type, 500, 0, null);
    const exact = candidates.filter((item) => item.confidence === "external_id_exact" && item.candidate?.localMediaId);
    const results = [];
    for (const candidate of exact) {
      results.push(await mergeMedia(c.env.DB, auth.user.id, candidate.source.localMediaId, candidate.candidate!.localMediaId!, candidate.confidence, candidate.reason));
    }
    c.executionCtx.waitUntil(import("./hydration").then(m => m.scheduleHydrationJobs(c.env)));
    return c.json(apiSuccess({ merged: results.length, results }));
  });

  router.post("/resolve-batch", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const body = z.object({ mediaIds: z.array(z.string()) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Invalid request body.");

    const results: MergeCandidate[] = [];
    const errors: Array<{ mediaId: string; message: string }> = [];
    for (const id of body.data.mediaIds) {
      try {
        const row = await getMedia(c.env.DB, id);
        if (!row) continue;
        const source = mapProviderSource(row);
        let candidate: MergeCandidate;
        try {
          candidate = await candidateForSource(c.env, source);
        } catch (error) {
          candidate = { source, candidate: null, confidence: "ambiguous", reason: "Provider lookup failed. Use reload to retry this candidate later." };
          errors.push({ mediaId: id, message: error instanceof Error ? error.message : String(error) });
        }
        await persistCandidate(c.env.DB, row, candidate);
        results.push(candidate);
      } catch (error) {
        console.error(`Merge candidate resolution failed for ${id}:`, error);
        errors.push({ mediaId: id, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return c.json(apiSuccess({ results, errors }));
  });

  router.post("/:mediaId/refresh", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Database binding is not configured.");
    const media = await getMedia(c.env.DB, c.req.param("mediaId"));
    if (!media) return apiError(c, 404, "not_found", "Media not found.");
    const now = new Date().toISOString();
    const provider = media.source === "tv_time" ? "tmdb" : media.source;
    if (provider === "tmdb") {
      const tmdbId = await c.env.DB.prepare("SELECT external_id FROM media_external_ids WHERE media_id = ? AND source = 'tmdb'")
        .bind(media.id)
        .first<{ external_id: string }>();
      if (!tmdbId?.external_id) {
        return apiError(c, 409, "conflict", "This item needs a TMDB match before metadata can be refreshed. Open Merge media and accept or choose a match first.");
      }
    }
    await enqueueMediaRefreshJob(c.env.DB, media.id, provider, now);
    await c.env.DB.prepare("INSERT INTO media_metadata_freshness (media_id, details_hydrated_at, updated_at) VALUES (?, ?, ?) ON CONFLICT(media_id) DO UPDATE SET updated_at=excluded.updated_at")
      .bind(media.id, null, now)
      .run();

    // Trigger background processing immediately
    c.executionCtx.waitUntil(import("./hydration").then(m => m.scheduleHydrationJobs(c.env)));

    return c.json(apiSuccess({ queued: true }));
  });

  return router;
}

async function buildCandidates(env: Env, userId: string, type: MediaType | null, limit: number, offset = 0, search: string | null = null): Promise<MergeCandidate[]> {
  const db = env.DB;
  const typeClause = type ? "AND mi.type = ?" : "";
  const searchClause = search ? `AND (
    mi.title LIKE ?
    OR mi.source_id LIKE ?
    OR EXISTS (
      SELECT 1 FROM media_external_ids ex
      WHERE ex.media_id = mi.id AND (ex.external_id LIKE ? OR ex.source LIKE ?)
    )
  )` : "";
  const normalizedLimit = Math.min(100, Math.max(1, Number.isFinite(limit) ? limit : 30));
  const normalizedOffset = Math.max(0, Number.isFinite(offset) ? offset : 0);
  const searchPattern = search ? `%${search}%` : null;
  const binds = [
    userId,
    ...(type ? [type] : []),
    ...(searchPattern ? [searchPattern, searchPattern, searchPattern, searchPattern] : []),
    normalizedLimit,
    normalizedOffset,
  ];
  const rows = await db.prepare(`
    SELECT mi.*, msr.candidate_json FROM user_media um
    JOIN media_items mi ON mi.id = um.media_id
    LEFT JOIN media_merge_aliases mma ON mma.source_media_id = mi.id
    LEFT JOIN media_source_records msr ON msr.media_id = mi.id
    WHERE um.user_id = ? AND mma.id IS NULL AND mi.source IN ('tv_time','manual') ${typeClause} ${searchClause}
    ORDER BY um.updated_at DESC
    LIMIT ?
    OFFSET ?
  `).bind(...binds).all<MediaRow & { candidate_json: string | null }>();

  const candidates: MergeCandidate[] = [];
  for (const row of rows.results) {
    const source = mapProviderSource(row);
    if (row.candidate_json) {
      try {
        const cached = JSON.parse(row.candidate_json);
        candidates.push({ source, candidate: cached.candidate, confidence: cached.confidence, reason: cached.reason });
        continue;
      } catch {}
    }
    candidates.push({ source, candidate: null, confidence: "ambiguous", reason: "Needs resolution." });
  }
  return candidates;
}

async function candidateForSource(env: Env, source: MergeCandidate["source"]): Promise<MergeCandidate> {
  const external = await findExternalCandidate(env, source);
  if (external) {
    return { source, candidate: external, confidence: "external_id_exact", reason: "Matched by shared external provider ID." };
  }
  const title = await findTitleCandidate(env.DB, source);
  if (title) return title;
  const remote = await providerSearch(env, source.title, [source.type], 3);
  const best = remote.find((result) => normalizeTitle(result.title) === normalizeTitle(source.title)) ?? remote[0] ?? null;
  return { source, candidate: best, confidence: best ? "title_only_review" : "ambiguous", reason: best ? "Provider search produced a possible title match." : "No confident provider match was found." };
}

async function persistCandidate(db: D1Database, row: MediaRow, candidate: MergeCandidate) {
  const now = new Date().toISOString();
  const candidateJson = JSON.stringify({ candidate: candidate.candidate, confidence: candidate.confidence, reason: candidate.reason, resolvedAt: now });
  const existing = await db.prepare("SELECT id FROM media_source_records WHERE media_id = ? LIMIT 1").bind(row.id).first<{ id: string }>();
  if (existing) {
    await db.prepare("UPDATE media_source_records SET candidate_json = ?, updated_at = ? WHERE id = ?").bind(candidateJson, now, existing.id).run();
    return;
  }
  await db.prepare("INSERT OR IGNORE INTO media_source_records (id, media_id, source_kind, source_id, raw_title, raw_type, raw_year, normalized_title, cache_key, raw_json, candidate_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)")
    .bind(randomId("msr"), row.id, row.source, row.source_id ?? row.id, row.title, row.type, row.year, normalizeTitle(row.title), candidateJson, now, now)
    .run();
}

async function findExternalCandidate(env: Env, source: MergeCandidate["source"]): Promise<ProviderResult | null> {
  const db = env.DB;
  const sourceMediaId = source.localMediaId;
  const ids = await db.prepare("SELECT source, external_id FROM media_external_ids WHERE media_id = ? AND source IN ('tmdb','rawg','openlibrary','imdb','tvdb')").bind(sourceMediaId).all<{ source: string; external_id: string }>();
  for (const id of ids.results) {
    const row = await db.prepare(`SELECT mi.* FROM media_items mi
      JOIN media_external_ids ex ON ex.media_id = mi.id
      WHERE ex.source = ? AND ex.external_id = ? AND mi.id != ? AND mi.source != 'tv_time'
      LIMIT 1`).bind(id.source, id.external_id, sourceMediaId).first<MediaRow>();
    if (row) return mapProviderSource(row);
  }
  for (const id of ids.results) {
    const remote = await providerFindByExternalId(env, source.type, id.source, id.external_id);
    if (remote) return remote;
  }
  return null;
}

async function findTitleCandidate(db: D1Database, source: MergeCandidate["source"]): Promise<MergeCandidate | null> {
  const normalized = normalizeTitle(source.title);
  const row = await db.prepare(`SELECT * FROM media_items
    WHERE id != ? AND source != 'tv_time' AND type = ? AND lower(trim(title)) = ?
      AND (? IS NULL OR year IS NULL OR abs(year - ?) <= 1)
    ORDER BY source = 'tmdb' DESC, updated_at DESC
    LIMIT 1`).bind(source.localMediaId, source.type, normalized, source.year, source.year).first<MediaRow>();
  if (!row) return null;
  return { source, candidate: mapProviderSource(row), confidence: source.year ? "title_year_strong" : "title_only_review", reason: source.year ? "Matched by normalized title and nearby year." : "Matched by normalized title." };
}

async function createCanonicalFromProvider(db: D1Database, providerResult: z.infer<typeof mergeBodySchema>["providerResult"], now: string) {
  if (!providerResult) return null;
  if (providerResult.provider === "local" && providerResult.localMediaId) return providerResult.localMediaId;
  const existing = await db.prepare("SELECT media_id FROM media_external_ids WHERE source = ? AND external_id = ?").bind(providerResult.provider, providerResult.providerId).first<{ media_id: string }>();
  if (existing) return existing.media_id;
  const mediaId = randomId("med");
  await db.prepare(`INSERT INTO media_items (id, type, title, overview, poster_path, backdrop_path, air_status, runtime_minutes, release_date, year, language, country, source, source_id, total_episodes, total_seasons, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?, NULL, NULL, ?, ?)`)
    .bind(mediaId, providerResult.type, providerResult.title, providerResult.overview ?? null, providerResult.posterPath ?? null, providerResult.backdropPath ?? null, inferAirStatus(providerResult.type, providerResult.releaseDate ?? null), providerResult.releaseDate ?? null, providerResult.year ?? null, providerResult.provider, providerResult.providerId, now, now)
    .run();
  await db.prepare("INSERT INTO media_external_ids (id, media_id, source, external_id, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(randomId("mex"), mediaId, providerResult.provider, providerResult.providerId, now)
    .run();
  await db.prepare("INSERT OR IGNORE INTO media_source_records (id, media_id, source_kind, source_id, raw_title, raw_type, raw_year, normalized_title, cache_key, raw_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)")
    .bind(randomId("msr"), mediaId, providerResult.provider, providerResult.providerId, providerResult.title, providerResult.type, providerResult.year ?? null, normalizeTitle(providerResult.title), JSON.stringify(providerResult), now, now)
    .run();
  return mediaId;
}

async function mergeMedia(db: D1Database, userId: string, sourceMediaId: string, targetMediaId: string, confidence: string, reason: string) {
  if (sourceMediaId === targetMediaId) return { sourceMediaId, targetMediaId, merged: false, message: "Source and target already match." };
  const now = new Date().toISOString();
  const [source, target] = await Promise.all([getMedia(db, sourceMediaId), getMedia(db, targetMediaId)]);
  if (!source || !target) throw new Error("Source or target media was not found.");

  await copyMissingProviderFields(db, source, target, now);
  await moveUserMedia(db, userId, sourceMediaId, targetMediaId, now);
  await moveEpisodeActivity(db, userId, sourceMediaId, targetMediaId, now);
  await moveUnitActivity(db, userId, sourceMediaId, targetMediaId, now);
  await db.prepare("UPDATE activity_events SET media_id = ? WHERE user_id = ? AND media_id = ?").bind(targetMediaId, userId, sourceMediaId).run();
  await db.prepare("UPDATE media_external_ids SET media_id = ? WHERE media_id = ? AND NOT EXISTS (SELECT 1 FROM media_external_ids existing WHERE existing.media_id = ? AND existing.source = media_external_ids.source AND existing.external_id = media_external_ids.external_id)")
    .bind(targetMediaId, sourceMediaId, targetMediaId).run();
  await db.prepare("UPDATE media_source_records SET media_id = ?, candidate_json = NULL, updated_at = ? WHERE media_id = ?").bind(targetMediaId, now, sourceMediaId).run();
  await db.prepare("INSERT INTO media_merge_aliases (id, source_media_id, target_media_id, status, confidence, reason_json, merged_by_user_id, created_at, updated_at) VALUES (?, ?, ?, 'merged', ?, ?, ?, ?, ?) ON CONFLICT(source_media_id) DO UPDATE SET target_media_id=excluded.target_media_id, status='merged', confidence=excluded.confidence, reason_json=excluded.reason_json, merged_by_user_id=excluded.merged_by_user_id, updated_at=excluded.updated_at")
    .bind(randomId("mrg"), sourceMediaId, targetMediaId, confidence, JSON.stringify({ reason }), userId, now, now).run();
  await enqueueMediaRefreshJob(db, targetMediaId, target.source === "tv_time" ? "tmdb" : target.source, now);
  return { sourceMediaId, targetMediaId, merged: true };
}

async function enqueueMediaRefreshJob(db: D1Database, mediaId: string, provider: string, now: string) {
  const existing = await db.prepare(`SELECT id FROM metadata_refresh_jobs
    WHERE media_id = ? AND provider = ? AND scope = 'media' AND status IN ('queued', 'running')
    LIMIT 1`)
    .bind(mediaId, provider)
    .first<{ id: string }>();
  if (existing) return existing.id;
  const id = randomId("mrj");
  await db.prepare("INSERT INTO metadata_refresh_jobs (id, media_id, provider, scope, status, attempts, last_error, created_at, updated_at) VALUES (?, ?, ?, 'media', 'queued', 0, NULL, ?, ?)")
    .bind(id, mediaId, provider, now, now)
    .run();
  return id;
}

async function moveUserMedia(db: D1Database, userId: string, sourceMediaId: string, targetMediaId: string, now: string) {
  const source = await db.prepare("SELECT * FROM user_media WHERE user_id = ? AND media_id = ?").bind(userId, sourceMediaId).first<any>();
  if (!source) return;
  const target = await db.prepare("SELECT * FROM user_media WHERE user_id = ? AND media_id = ?").bind(userId, targetMediaId).first<any>();
  if (!target) {
    await db.prepare("UPDATE user_media SET media_id = ?, updated_at = ? WHERE user_id = ? AND media_id = ?").bind(targetMediaId, now, userId, sourceMediaId).run();
    return;
  }
  await db.prepare(`UPDATE user_media SET
    is_favorite = MAX(is_favorite, ?),
    rating = COALESCE(rating, ?),
    notes = COALESCE(notes, ?),
    watched_at = COALESCE(watched_at, ?),
    rewatch_count = MAX(rewatch_count, ?),
    progress_episodes = MAX(progress_episodes, ?),
    updated_at = ?
    WHERE user_id = ? AND media_id = ?`)
    .bind(source.is_favorite, source.rating, source.notes, source.watched_at, source.rewatch_count, source.progress_episodes, now, userId, targetMediaId).run();
  await db.prepare("DELETE FROM user_media WHERE user_id = ? AND media_id = ?").bind(userId, sourceMediaId).run();
}

async function moveEpisodeActivity(db: D1Database, userId: string, sourceMediaId: string, targetMediaId: string, now: string) {
  const sourceEpisodes = await db.prepare("SELECT * FROM episodes WHERE media_id = ?").bind(sourceMediaId).all<any>();
  const targetEpisodes = await db.prepare("SELECT * FROM episodes WHERE media_id = ?").bind(targetMediaId).all<any>();
  const targetMap = new Map(targetEpisodes.results.map((ep) => [`${ep.season_number}:${ep.episode_number}`, ep]));
  for (const sourceEp of sourceEpisodes.results) {
    const key = `${sourceEp.season_number}:${sourceEp.episode_number}`;
    let targetEp = targetMap.get(key);
    if (!targetEp) {
      const seasonId = await ensureSeason(db, targetMediaId, sourceEp.season_number, sourceEp.is_special === 1, now);
      const episodeId = randomId("epi");
      await db.prepare("INSERT INTO episodes (id, media_id, season_id, season_number, episode_number, name, overview, still_path, air_date, runtime_minutes, is_special, external_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(episodeId, targetMediaId, seasonId, sourceEp.season_number, sourceEp.episode_number, sourceEp.name, sourceEp.overview, sourceEp.still_path, sourceEp.air_date, sourceEp.runtime_minutes, sourceEp.is_special, sourceEp.external_id, now, now).run();
      targetEp = { ...sourceEp, id: episodeId, media_id: targetMediaId };
      targetMap.set(key, targetEp);
    }
    await db.prepare(`INSERT INTO episode_activity (id, user_id, episode_id, media_id, watched, watched_at, rewatch_count, rating, notes, created_at, updated_at)
      SELECT ?, user_id, ?, ?, watched, watched_at, rewatch_count, rating, notes, created_at, ?
      FROM episode_activity WHERE user_id = ? AND episode_id = ?
      ON CONFLICT(user_id, episode_id) DO UPDATE SET
        watched = MAX(watched, excluded.watched),
        watched_at = COALESCE(episode_activity.watched_at, excluded.watched_at),
        rewatch_count = MAX(episode_activity.rewatch_count, excluded.rewatch_count),
        rating = COALESCE(episode_activity.rating, excluded.rating),
        notes = COALESCE(episode_activity.notes, excluded.notes),
        updated_at = excluded.updated_at`)
      .bind(randomId("epa"), targetEp.id, targetMediaId, now, userId, sourceEp.id).run();
  }
  await db.prepare("DELETE FROM episode_activity WHERE user_id = ? AND media_id = ?").bind(userId, sourceMediaId).run();
}

async function moveUnitActivity(db: D1Database, userId: string, sourceMediaId: string, targetMediaId: string, now: string) {
  const sourceUnits = await db.prepare("SELECT * FROM media_units WHERE media_id = ?").bind(sourceMediaId).all<any>();
  const targetUnits = await db.prepare("SELECT * FROM media_units WHERE media_id = ?").bind(targetMediaId).all<any>();
  const targetMap = new Map(targetUnits.results.map((unit) => [`${unit.kind}:${unit.position}`, unit]));
  for (const sourceUnit of sourceUnits.results) {
    const key = `${sourceUnit.kind}:${sourceUnit.position}`;
    let targetUnit = targetMap.get(key);
    if (!targetUnit) {
      const unitId = randomId("unt");
      await db.prepare("INSERT INTO media_units (id, media_id, parent_id, kind, position, title, overview, image_path, release_date, external_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(unitId, targetMediaId, sourceUnit.kind, sourceUnit.position, sourceUnit.title, sourceUnit.overview, sourceUnit.image_path, sourceUnit.release_date, sourceUnit.external_id, now, now).run();
      targetUnit = { ...sourceUnit, id: unitId, media_id: targetMediaId };
      targetMap.set(key, targetUnit);
    }
    await db.prepare(`INSERT INTO unit_activity (id, user_id, unit_id, media_id, completed, completed_at, rating, notes, created_at, updated_at)
      SELECT ?, user_id, ?, ?, completed, completed_at, rating, notes, created_at, ?
      FROM unit_activity WHERE user_id = ? AND unit_id = ?
      ON CONFLICT(user_id, unit_id) DO UPDATE SET
        completed = MAX(completed, excluded.completed),
        completed_at = COALESCE(unit_activity.completed_at, excluded.completed_at),
        rating = COALESCE(unit_activity.rating, excluded.rating),
        notes = COALESCE(unit_activity.notes, excluded.notes),
        updated_at = excluded.updated_at`)
      .bind(randomId("uta"), targetUnit.id, targetMediaId, now, userId, sourceUnit.id).run();
  }
  await db.prepare("DELETE FROM unit_activity WHERE user_id = ? AND media_id = ?").bind(userId, sourceMediaId).run();
}

async function copyMissingProviderFields(db: D1Database, source: MediaRow, target: MediaRow, now: string) {
  await db.prepare(`UPDATE media_items SET
    overview = COALESCE(overview, ?),
    poster_path = COALESCE(poster_path, ?),
    backdrop_path = COALESCE(backdrop_path, ?),
    release_date = COALESCE(release_date, ?),
    year = COALESCE(year, ?),
    updated_at = ?
    WHERE id = ?`)
    .bind(source.overview, source.poster_path, source.backdrop_path, source.release_date, source.year, now, target.id).run();
}

async function ensureSeason(db: D1Database, mediaId: string, seasonNumber: number, isSpecial: boolean, now: string) {
  const existing = await db.prepare("SELECT id FROM seasons WHERE media_id = ? AND season_number = ?").bind(mediaId, seasonNumber).first<{ id: string }>();
  if (existing) return existing.id;
  const id = randomId("sea");
  await db.prepare("INSERT INTO seasons (id, media_id, season_number, name, overview, poster_path, episode_count, air_date, is_special, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)")
    .bind(id, mediaId, seasonNumber, seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`, isSpecial ? 1 : 0, now, now).run();
  return id;
}

async function getMedia(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM media_items WHERE id = ?").bind(id).first<MediaRow>();
}

function mapProviderSource(row: MediaRow): MergeCandidate["source"] {
  return {
    provider: row.source === "tmdb" || row.source === "rawg" || row.source === "openlibrary" ? row.source : "local",
    providerId: row.source_id ?? row.id,
    type: row.type,
    title: row.title,
    overview: row.overview,
    posterPath: row.poster_path,
    backdropPath: row.backdrop_path,
    releaseDate: row.release_date,
    year: row.year,
    sourceUrl: null,
    rating: null,
    popularity: null,
    attribution: { provider: "local", label: row.source === "tv_time" ? "TV Time import" : "Tuvu", url: "/" },
    alreadyTracked: true,
    localMediaId: row.id,
    source: row.source,
  };
}

function parseType(type?: string): MediaType | null {
  return type === "show" || type === "movie" || type === "anime" || type === "game" || type === "book" ? type : null;
}

function normalizeTitle(title: string) {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function inferAirStatus(type: MediaType, releaseDate: string | null) {
  if (releaseDate && releaseDate > new Date().toISOString().slice(0, 10)) return "upcoming";
  return type === "show" || type === "anime" ? "continuing" : "released";
}
