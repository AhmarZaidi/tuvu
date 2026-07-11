import { Hono } from "hono";
import { z } from "zod";
import type { MediaType } from "@shared/media";
import { randomId } from "./crypto";
import { apiError, apiSuccess } from "./http";
import { defaultStatus } from "./media-logic";
import type { MediaItemRecord, MediaRepository } from "./media-repository";
import { providerExplore, providerSearch, providerTypeExplore, type ProviderResult } from "./providers";
import { requireAuth, requireCsrf, type AppVariables } from "./session";

const mediaTypeSchema = z.enum(["show", "movie", "anime", "game", "book"]);
const searchSchema = z.object({
  q: z.string().trim().min(2).max(120),
  types: z.string().optional(),
});

const addProviderSchema = z.object({
  provider: z.enum(["tmdb", "igdb", "openlibrary", "rawg"]),
  providerId: z.string().min(1).max(200),
  type: mediaTypeSchema,
  title: z.string().trim().min(1).max(500),
  overview: z.string().max(2000).nullable().optional(),
  posterPath: z.string().max(500).nullable().optional(),
  backdropPath: z.string().max(500).nullable().optional(),
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  year: z.number().int().min(1000).max(2100).nullable().optional(),
  sourceUrl: z.string().max(500).nullable().optional(),
  extendedDataJson: z.string().max(5000).nullable().optional(),
});

export function createExploreRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: AppVariables & { mediaRepository: MediaRepository } }>();

  router.get("/", requireAuth(), async (c) => {
    const auth = c.get("auth");
    const rows = await providerExplore(c.env);
    const filteredRows = c.env.DB ? await markAndFilterTracked(c.env.DB, auth.user.id, rows) : rows;
    return c.json(apiSuccess({ rows: filteredRows }));
  });

  router.get("/type/:type", requireAuth(), async (c) => {
    const typeParam = c.req.param("type");
    const parsedType = mediaTypeSchema.safeParse(typeParam);
    if (!parsedType.success) return apiError(c, 400, "validation_failed", "Invalid media type.", parsedType.error.flatten());

    const auth = c.get("auth");
    const results = await providerTypeExplore(c.env, parsedType.data);
    const marked = c.env.DB ? dedupeMarkedResults(await markTrackedResults(c.env.DB, auth.user.id, results)) : results;
    return c.json(apiSuccess({ results: marked }));
  });

  router.get("/search", requireAuth(), async (c) => {
    const query = searchSchema.safeParse({ q: c.req.query("q"), types: c.req.query("types") });
    if (!query.success) return apiError(c, 400, "validation_failed", "Search query is invalid.", query.error.flatten());
    const auth = c.get("auth");
    const mediaRepo = c.get("mediaRepository");
    const types = parseTypes(query.data.types);

    const localResults = await Promise.all(types.map((type) => mediaRepo.searchMedia(query.data.q, type, 6)));
    const local = localResults.flat().map((media) => localProviderResult(media));
    const remote = await providerSearch(c.env, query.data.q, types, 8);
    const combined = dedupeResults([...local, ...remote]);
    const marked = c.env.DB ? dedupeMarkedResults(await markTrackedResults(c.env.DB, auth.user.id, combined)) : combined;
    return c.json(apiSuccess({ query: query.data.q, results: marked.slice(0, 40) }));
  });

  router.post("/add", requireAuth(), requireCsrf(), async (c) => {
    const body = addProviderSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Provider result is invalid.", body.error.flatten());

    const auth = c.get("auth");
    const repo = c.get("mediaRepository");
    const now = new Date().toISOString();
    let media: MediaItemRecord | null = c.env.DB ? await findMediaByExternalId(c.env.DB, body.data.provider, body.data.providerId) : null;
    if (!media) {
      media = {
        id: randomId("med"),
        type: body.data.type,
        title: body.data.title,
        overview: body.data.overview ?? null,
        posterPath: body.data.posterPath ?? null,
        backdropPath: body.data.backdropPath ?? null,
        airStatus: inferAirStatus(body.data.type, body.data.releaseDate ?? null),
        runtimeMinutes: null,
        releaseDate: body.data.releaseDate ?? null,
        year: body.data.year ?? null,
        language: null,
        country: null,
        source: body.data.provider,
        sourceId: body.data.providerId,
        totalEpisodes: null,
        totalSeasons: null,
        extendedDataJson: body.data.extendedDataJson ?? null,
        createdAt: now,
        updatedAt: now,
      };
      await repo.createMedia(media);
      if (c.env.DB) {
        await c.env.DB.prepare("INSERT OR IGNORE INTO media_external_ids (id, media_id, source, external_id, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(randomId("exi"), media.id, body.data.provider, body.data.providerId, now)
          .run();
          
        await c.env.DB.prepare("INSERT INTO metadata_refresh_jobs (id, media_id, provider, scope, status, attempts, last_error, created_at, updated_at, context_json) VALUES (?, ?, ?, 'media', 'queued', 0, NULL, ?, ?, NULL)")
          .bind(randomId("mrj"), media.id, body.data.provider, now, now)
          .run();
      }
    }

    const existing = await repo.findUserMedia(auth.user.id, media.id);
    if (existing) return c.json(apiSuccess({ media, userMedia: existing, alreadyTracked: true }));
    const status = defaultStatus(media.type);
    const userMedia = await repo.upsertUserMedia({
      id: randomId("ulb"),
      userId: auth.user.id,
      mediaId: media.id,
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
    await repo.createActivityEvent({ id: randomId("act"), userId: auth.user.id, type: "add_library", mediaId: media.id, episodeId: null, dataJson: JSON.stringify({ status, provider: body.data.provider, providerId: body.data.providerId }), createdAt: now });
    return c.json(apiSuccess({ media, userMedia, alreadyTracked: false }), 201);
  });

  return router;
}

function parseTypes(value?: string): MediaType[] {
  if (!value) return ["show", "movie", "book", "game"];
  const parsed = value.split(",").map((item) => item.trim()).filter((item): item is MediaType => mediaTypeSchema.safeParse(item).success);
  return parsed.length ? parsed : ["show", "movie", "book", "game"];
}

function localProviderResult(media: MediaItemRecord): ProviderResult {
  return {
    provider: "local",
    providerId: media.id,
    type: media.type,
    title: media.title,
    overview: media.overview,
    posterPath: media.posterPath,
    backdropPath: media.backdropPath,
    releaseDate: media.releaseDate,
    year: media.year,
    sourceUrl: null,
    rating: null,
    popularity: null,
    attribution: { provider: "local", label: "Tuvu", url: "/" },
    localMediaId: media.id,
    extendedDataJson: media.extendedDataJson ?? null,
  };
}

function dedupeResults(results: ProviderResult[]) {
  const seenProviderKeys = new Set<string>();
  const titleIndexes = new Map<string, number>();
  const output: ProviderResult[] = [];
  for (const result of results) {
    const key = `${result.provider}:${result.providerId}:${result.type}`;
    const titleKey = `${result.type}:${result.title.toLowerCase()}:${result.year ?? ""}`;
    if (seenProviderKeys.has(key)) continue;
    const existingIndex = titleIndexes.get(titleKey);
    if (existingIndex !== undefined) {
      if (output[existingIndex]?.provider === "local" && result.provider !== "local") {
        output[existingIndex] = { ...result, localMediaId: output[existingIndex].localMediaId };
      }
      continue;
    }
    seenProviderKeys.add(key);
    titleIndexes.set(titleKey, output.length);
    output.push(result);
  }
  return output;
}

async function markAndFilterTracked(db: D1Database, userId: string, rows: Array<{ results: ProviderResult[] }>) {
  const flat = await markTrackedResults(db, userId, rows.flatMap((row) => row.results));
  const byKey = new Map(flat.map((result) => [resultKey(result), result]));
  const output = [];
  for (const row of rows) {
    const marked = row.results.map((result) => byKey.get(resultKey(result)) ?? result);
    output.push({ ...row, results: marked.filter((result) => !result.alreadyTracked).slice(0, 12) });
  }
  return output.filter((row) => row.results.length > 0);
}

async function markTrackedResults(db: D1Database, userId: string, results: ProviderResult[]) {
  if (results.length === 0) return results;
  const localIds = new Map<string, string>();
  for (const result of results) {
    if (result.provider === "local" || result.localMediaId) localIds.set(resultKey(result), result.localMediaId ?? result.providerId);
  }

  const initialLocalIds = [...new Set(localIds.values())];
  if (initialLocalIds.length > 0) {
    const placeholders = initialLocalIds.map(() => "?").join(",");
    const aliases = await db.prepare(`SELECT source_media_id, target_media_id FROM media_merge_aliases
      WHERE status = 'merged' AND source_media_id IN (${placeholders})`)
      .bind(...initialLocalIds)
      .all<{ source_media_id: string; target_media_id: string }>();
    const aliasMap = new Map(aliases.results.map((row) => [row.source_media_id, row.target_media_id]));
    for (const [key, mediaId] of localIds) {
      localIds.set(key, aliasMap.get(mediaId) ?? mediaId);
    }
  }

  for (const provider of ["tmdb", "igdb", "rawg", "openlibrary"] as const) {
    const providerResults = results.filter((result) => result.provider === provider);
    const ids = [...new Set(providerResults.map((result) => result.providerId))];
    if (ids.length === 0) continue;
    const placeholders = ids.map(() => "?").join(",");
    const rows = await db.prepare(`SELECT mi.id, mi.source_id, ex.external_id FROM media_items mi
      LEFT JOIN media_external_ids ex ON ex.media_id = mi.id AND ex.source = ?
      WHERE (mi.source = ? AND mi.source_id IN (${placeholders})) OR ex.external_id IN (${placeholders})`)
      .bind(provider, provider, ...ids, ...ids)
      .all<{ id: string; source_id: string | null; external_id: string | null }>();
    for (const row of rows.results) {
      const matchedId = row.source_id ?? row.external_id;
      if (!matchedId) continue;
      for (const result of providerResults) {
        if (result.providerId === matchedId) localIds.set(resultKey(result), row.id);
      }
    }
  }

  const uniqueLocalIds = [...new Set(localIds.values())];
  const trackedIds = new Set<string>();
  if (uniqueLocalIds.length > 0) {
    const placeholders = uniqueLocalIds.map(() => "?").join(",");
    const rows = await db.prepare(`SELECT media_id FROM user_media WHERE user_id = ? AND media_id IN (${placeholders})`).bind(userId, ...uniqueLocalIds).all<{ media_id: string }>();
    for (const row of rows.results) trackedIds.add(row.media_id);
  }

  return results.map((result) => {
    const localMediaId = localIds.get(resultKey(result)) ?? null;
    return { ...result, localMediaId, alreadyTracked: localMediaId ? trackedIds.has(localMediaId) : false };
  });
}

function dedupeMarkedResults(results: ProviderResult[]) {
  const output: ProviderResult[] = [];
  const byLocalId = new Map<string, number>();
  const byProvider = new Set<string>();
  for (const result of results) {
    const localKey = result.localMediaId ? `${result.type}:${result.localMediaId}` : null;
    if (localKey && byLocalId.has(localKey)) {
      const existingIndex = byLocalId.get(localKey)!;
      const existing = output[existingIndex];
      if (!existing) continue;
      if (existing.provider === "local" && result.provider !== "local") {
        output[existingIndex] = { ...result, localMediaId: existing.localMediaId, alreadyTracked: existing.alreadyTracked || result.alreadyTracked };
      }
      continue;
    }
    const providerKey = resultKey(result);
    if (byProvider.has(providerKey)) continue;
    if (localKey) byLocalId.set(localKey, output.length);
    byProvider.add(providerKey);
    output.push(result);
  }
  return output;
}

function resultKey(result: ProviderResult) {
  return `${result.provider}:${result.providerId}:${result.type}`;
}

async function findMediaByExternalId(db: D1Database, provider: string, providerId: string): Promise<MediaItemRecord | null> {
  const row = await db.prepare(`SELECT mi.* FROM media_items mi
    LEFT JOIN media_external_ids ex ON ex.media_id = mi.id
    WHERE (mi.source = ? AND mi.source_id = ?) OR (ex.source = ? AND ex.external_id = ?)
    LIMIT 1`).bind(provider, providerId, provider, providerId).first<{
      id: string; type: MediaType; title: string; overview: string | null; poster_path: string | null; backdrop_path: string | null; air_status: string | null; runtime_minutes: number | null; release_date: string | null; year: number | null; language: string | null; country: string | null; source: string; source_id: string | null; total_episodes: number | null; total_seasons: number | null; extended_data_json: string | null; created_at: string; updated_at: string;
    }>();
  return row ? {
    id: row.id,
    type: row.type,
    title: row.title,
    overview: row.overview,
    posterPath: row.poster_path,
    backdropPath: row.backdrop_path,
    airStatus: row.air_status,
    runtimeMinutes: row.runtime_minutes,
    releaseDate: row.release_date,
    year: row.year,
    language: row.language,
    country: row.country,
    source: row.source,
    sourceId: row.source_id,
    totalEpisodes: row.total_episodes,
    totalSeasons: row.total_seasons,
    extendedDataJson: row.extended_data_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } : null;
}

function inferAirStatus(type: MediaType, releaseDate: string | null) {
  if (releaseDate && releaseDate > new Date().toISOString().slice(0, 10)) return "upcoming";
  return type === "show" || type === "anime" ? "continuing" : "released";
}
