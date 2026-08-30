import { Hono } from "hono";
import { z } from "zod";
import { mediaTypeSchema, type MediaType } from "@shared/media";
import { searchableMediaTypes } from "@shared/media-config";
import { addProviderResultToLibrary, resolveOrCreateProviderCanonicalMedia } from "./media-canonical-service";
import { apiError, apiSuccess } from "./http";
import { bumpUserLibraryVersion } from "./library-version-service";
import type { MediaItemRecord, MediaRepository } from "./media-repository";
import { providerExplore, providerSearch, providerTypeExplore, providerTypeExploreRows, type ProviderResult } from "./providers";
import { requireAuth, requireCsrf, type AppVariables } from "./session";

const searchSchema = z.object({
  q: z.string().trim().min(2).max(120),
  types: z.string().optional(),
});

const addProviderSchema = z.object({
  provider: z.string().min(1).max(50),
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
    const rows = await providerExplore(c.env, auth.user.id);
    const filteredRows = c.env.DB ? await markAndFilterTracked(c.env.DB, auth.user.id, rows) : rows;
    return c.json(apiSuccess({ rows: filteredRows }));
  });

  router.get("/type/:type", requireAuth(), async (c) => {
    const typeParam = c.req.param("type");
    const parsedType = mediaTypeSchema.safeParse(typeParam);
    if (!parsedType.success) return apiError(c, 400, "validation_failed", "Invalid media type.", parsedType.error.flatten());

    const auth = c.get("auth");
    const rows = await providerTypeExploreRows(c.env, parsedType.data, auth.user.id);
    const filteredRows = c.env.DB ? await markAndFilterTracked(c.env.DB, auth.user.id, rows) : rows;
    const allResults = filteredRows.flatMap((r) => r.results);
    return c.json(apiSuccess({ results: allResults, rows: filteredRows }));
  });

  router.get("/search", requireAuth(), async (c) => {
    const rawTypes = c.req.query("types") || c.req.query("type");
    const query = searchSchema.safeParse({ q: c.req.query("q"), types: rawTypes });
    if (!query.success) return apiError(c, 400, "validation_failed", "Search query is invalid.", query.error.flatten());
    const auth = c.get("auth");
    const mediaRepo = c.get("mediaRepository");
    const types = parseTypes(query.data.types);

    const localResults = await Promise.all(types.map((type) => mediaRepo.searchMedia(query.data.q, type, 6)));
    const local = localResults.flat().map((media) => localProviderResult(media));
    const remote = await providerSearch(c.env, query.data.q, types, 8, auth.user.id);
    const combined = dedupeResults([...local, ...remote]);
    const marked = c.env.DB ? dedupeMarkedResults(await markTrackedResults(c.env.DB, auth.user.id, combined)) : combined;
    const untracked = marked.filter((result) => !result.alreadyTracked);
    return c.json(apiSuccess({ query: query.data.q, results: untracked.slice(0, 40) }));
  });

  router.post("/add", requireAuth(), requireCsrf(), async (c) => {
    const body = addProviderSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Provider result is invalid.", body.error.flatten());

    const auth = c.get("auth");
    const repo = c.get("mediaRepository");
    const result = await addProviderResultToLibrary({ env: c.env, repo, userId: auth.user.id, result: body.data });
    const libraryVersion = result.alreadyTracked ? null : await bumpUserLibraryVersion(c.env.DB, auth.user.id);
    return c.json(apiSuccess({ ...result, libraryVersion }), result.alreadyTracked ? 200 : 201);
  });

  router.post("/resolve", requireAuth(), requireCsrf(), async (c) => {
    const body = addProviderSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Provider result is invalid.", body.error.flatten());

    const repo = c.get("mediaRepository");
    const media = await resolveOrCreateProviderCanonicalMedia({
      db: c.env.DB,
      repo,
      result: body.data,
      now: new Date().toISOString(),
    });
    return c.json(apiSuccess({ media }));
  });

  return router;
}

function parseTypes(value?: string): MediaType[] {
  if (!value) return [...searchableMediaTypes];
  const parsed = value.split(",").map((item) => item.trim()).filter((item): item is MediaType => mediaTypeSchema.safeParse(item).success);
  return parsed.length ? parsed : [...searchableMediaTypes];
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

  for (const provider of ["tmdb", "igdb", "rawg", "openlibrary", "jikan"] as const) {
    const providerResults = results.filter((result) => result.provider === provider);
    const ids = [...new Set(providerResults.map((result) => result.providerId))];
    if (ids.length === 0) continue;
    const placeholders = ids.map(() => "?").join(",");
    try {
      const rows = await db.prepare(`SELECT mi.id, mi.canonical_provider_id AS provider_id, ex.external_id FROM media_items mi
        LEFT JOIN media_external_ids ex ON ex.media_id = mi.id AND (ex.provider_code = ? OR ex.namespace = ?)
        WHERE (mi.canonical_provider_code = ? AND mi.canonical_provider_id IN (${placeholders})) OR ex.external_id IN (${placeholders})`)
        .bind(provider, provider, provider, ...ids, ...ids)
        .all<{ id: string; provider_id: string | null; external_id: string | null }>();
      for (const row of rows.results) {
        const matchedId = row.provider_id ?? row.external_id;
        if (!matchedId) continue;
        for (const result of providerResults) {
          if (result.providerId === matchedId) localIds.set(resultKey(result), row.id);
        }
      }
    } catch {
      try {
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
      } catch {}
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
