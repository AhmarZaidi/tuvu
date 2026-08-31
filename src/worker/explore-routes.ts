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
    return c.json(apiSuccess({ query: query.data.q, results: marked.slice(0, 40) }));
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

export function extractCanonicalAnimeBaseTitle(rawTitle: string): string {
  let t = rawTitle.trim();
  t = t.replace(/[:\-–—]\s*(the\s+)?final\s+(season|chapters|act).*$/i, "");
  t = t.replace(/[:\-–—]\s*(\d+(st|nd|rd|th)|second|third|fourth|fifth|final)\s+season.*$/i, "");
  t = t.replace(/\s+season\s+\d+.*$/i, "");
  t = t.replace(/\s+\d+(st|nd|rd|th)\s+season.*$/i, "");
  t = t.replace(/[:\-–—]?\s*part\s+\d+.*$/i, "");
  t = t.replace(/[:\-–—]?\s*cour\s+\d+.*$/i, "");
  t = t.replace(/[:\-–—]?\s*(mugen train|entertainment district|swordsmith village|hashira training|thousand-year blood war).*$/i, "");
  t = t.replace(/\s+(ii|iii|iv|v|vi|vii|viii|ix|x)$/i, "");
  t = t.replace(/[?!\.\s]+$/, "").trim();
  return t || rawTitle;
}

function normalizeTitleForDedupe(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function areMediaTypesCompatible(t1: string, t2: string): boolean {
  if (t1 === t2) return true;
  if ((t1 === "show" || t1 === "anime") && (t2 === "show" || t2 === "anime")) return true;
  if ((t1 === "movie" || t1 === "anime") && (t2 === "movie" || t2 === "anime")) return true;
  return false;
}

function dedupeResults(results: ProviderResult[]) {
  const seenProviderKeys = new Set<string>();
  const titleIndexes = new Map<string, number>();
  const baseTitleIndexes = new Map<string, number>();
  const malIdIndexes = new Map<number, number>();
  const anilistIdIndexes = new Map<number, number>();
  const output: ProviderResult[] = [];

  for (const result of results) {
    const key = `${result.provider}:${result.providerId}:${result.type}`;
    if (seenProviderKeys.has(key)) continue;
    seenProviderKeys.add(key);

    let ext: any = {};
    try {
      if (result.extendedDataJson) ext = JSON.parse(result.extendedDataJson);
    } catch {}

    const malId = ext?.anime?.malId || (result.provider === "jikan" ? Number(result.providerId) : null);
    const anilistId = ext?.anime?.anilistId || (result.provider === "anilist" ? Number(result.providerId) : null);
    const normTitle = normalizeTitleForDedupe(result.title);
    const baseTitle = normalizeTitleForDedupe(extractCanonicalAnimeBaseTitle(result.title));

    const titleKey = `${normTitle}:${result.year ?? ""}`;
    const altEngKey = ext?.anime?.titles?.english ? `${normalizeTitleForDedupe(ext.anime.titles.english)}:${result.year ?? ""}` : null;
    const altRomajiKey = ext?.anime?.titles?.romaji ? `${normalizeTitleForDedupe(ext.anime.titles.romaji)}:${result.year ?? ""}` : null;

    let existingIndex: number | undefined = titleIndexes.get(titleKey);
    if (existingIndex === undefined && altEngKey) existingIndex = titleIndexes.get(altEngKey);
    if (existingIndex === undefined && altRomajiKey) existingIndex = titleIndexes.get(altRomajiKey);
    if (existingIndex === undefined && malId && malIdIndexes.has(malId)) {
      existingIndex = malIdIndexes.get(malId);
    }
    if (existingIndex === undefined && anilistId && anilistIdIndexes.has(anilistId)) {
      existingIndex = anilistIdIndexes.get(anilistId);
    }
    // Also check base title match if it's an anime / show
    if (existingIndex === undefined && (result.type === "anime" || result.type === "show")) {
      existingIndex = baseTitleIndexes.get(baseTitle);
    }

    if (existingIndex !== undefined) {
      const existing = output[existingIndex];
      if (areMediaTypesCompatible(existing.type, result.type)) {
        let existingExt: any = {};
        try {
          if (existing.extendedDataJson) existingExt = JSON.parse(existing.extendedDataJson);
        } catch {}

        const mergedExt = {
          ...existingExt,
          ...ext,
          category: existingExt.category || ext.category || (result.type === "anime" || existing.type === "anime" ? "anime" : undefined),
          hasDub: existingExt.hasDub || ext.hasDub || Boolean(existingExt.anime?.dubCast?.length || ext.anime?.dubCast?.length),
          anime: {
            ...(existingExt.anime || {}),
            ...(ext.anime || {}),
            characters: existingExt.anime?.characters?.length ? existingExt.anime.characters : ext.anime?.characters || [],
            japaneseCast: existingExt.anime?.japaneseCast?.length ? existingExt.anime.japaneseCast : ext.anime?.japaneseCast || [],
            dubCast: existingExt.anime?.dubCast?.length ? existingExt.anime.dubCast : ext.anime?.dubCast || [],
            studios: existingExt.anime?.studios?.length ? existingExt.anime.studios : ext.anime?.studios || [],
            titles: {
              ...(existingExt.anime?.titles || {}),
              ...(ext.anime?.titles || {}),
            },
          },
        };

        // Prefer local or tmdb as the primary result identity
        const isExistingPrimary = existing.provider === "local" || existing.provider === "tmdb";
        const primary = isExistingPrimary ? existing : result;

        output[existingIndex] = {
          ...primary,
          title: isExistingPrimary ? existing.title : extractCanonicalAnimeBaseTitle(result.title),
          posterPath: primary.posterPath || existing.posterPath || result.posterPath,
          backdropPath: primary.backdropPath || existing.backdropPath || result.backdropPath,
          overview: primary.overview || existing.overview || result.overview,
          releaseDate: primary.releaseDate || existing.releaseDate || result.releaseDate,
          year: primary.year || existing.year || result.year,
          extendedDataJson: JSON.stringify(mergedExt),
          localMediaId: existing.localMediaId || result.localMediaId,
        };
        continue;
      }
    }

    const idx = output.length;
    titleIndexes.set(titleKey, idx);
    if (altEngKey) titleIndexes.set(altEngKey, idx);
    if (altRomajiKey) titleIndexes.set(altRomajiKey, idx);
    if (baseTitle) baseTitleIndexes.set(baseTitle, idx);
    if (malId) malIdIndexes.set(malId, idx);
    if (anilistId) anilistIdIndexes.set(anilistId, idx);
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

  for (const provider of ["tmdb", "igdb", "rawg", "openlibrary", "jikan", "anilist"] as const) {
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
