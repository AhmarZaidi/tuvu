import type { MediaType } from "@shared/media";
import { randomId } from "./crypto";
import { defaultStatus } from "./media-logic";
import type { MediaItemRecord, UserMediaRecord } from "./media-repository";
import type { CanonicalMediaRepository } from "./repositories/media-repository-boundaries";
import type { ProviderResult } from "./providers";

type MediaItemRow = {
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
  extended_data_json?: string | null;
  created_at: string;
  updated_at: string;
};

export type ProviderCanonicalInput = Pick<
  ProviderResult,
  "provider" | "providerId" | "type" | "title"
> & Partial<Pick<
  ProviderResult,
  "overview" | "posterPath" | "backdropPath" | "releaseDate" | "year" | "extendedDataJson" | "localMediaId"
>>;

export type ImportedCanonicalInput = {
  type: "show" | "movie";
  title: string;
  year: number | null;
  sourceUuid: string | null;
  tvdbId: string | null;
  imdbId: string | null;
  releaseDate: string | null;
  createdAt: string | null;
};

export type ImportedCanonicalResult = {
  mediaId: string;
  created: boolean;
};

export async function addProviderResultToLibrary(input: {
  env: Env;
  repo: CanonicalMediaRepository;
  userId: string;
  result: ProviderCanonicalInput;
  now?: string;
}): Promise<{ media: MediaItemRecord; userMedia: UserMediaRecord; alreadyTracked: boolean }> {
  const now = input.now ?? new Date().toISOString();
  const media = await resolveOrCreateProviderCanonicalMedia({
    db: input.env.DB,
    repo: input.repo,
    result: input.result,
    now,
  });
  const existing = await input.repo.findUserMedia(input.userId, media.id);
  if (existing) return { media, userMedia: existing, alreadyTracked: true };

  const status = defaultStatus(media.type);
  const userMedia = await input.repo.upsertUserMedia({
    id: randomId("ulb"),
    userId: input.userId,
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
  await input.repo.createActivityEvent({
    id: randomId("act"),
    userId: input.userId,
    type: "add_library",
    mediaId: media.id,
    episodeId: null,
    dataJson: JSON.stringify({ status, provider: input.result.provider, providerId: input.result.providerId }),
    createdAt: now,
  });
  return { media, userMedia, alreadyTracked: false };
}

export async function resolveOrCreateProviderCanonicalMedia(input: {
  db?: D1Database;
  repo: Pick<CanonicalMediaRepository, "createMedia" | "findMediaById" | "searchMedia">;
  result: ProviderCanonicalInput;
  now?: string;
}): Promise<MediaItemRecord> {
  const now = input.now ?? new Date().toISOString();
  if (input.result.provider === "local" && input.result.localMediaId) {
    const local = await input.repo.findMediaById(input.result.localMediaId);
    if (local) return local;
  }

  let existing = input.db
    ? await findMediaByExternalId(input.db, input.result.provider, input.result.providerId)
    : await findMediaByProviderResult(input.repo, input.result.provider, input.result.providerId, input.result.title, input.result.type);

  if (!existing && input.db && input.result.provider !== "local") {
    let ext: any = {};
    try {
      if (input.result.extendedDataJson) ext = JSON.parse(input.result.extendedDataJson);
    } catch {}

    const malId = ext?.anime?.malId;
    const anilistId = ext?.anime?.anilistId;
    if (malId) {
      existing = await findMediaByExternalId(input.db, "mal", String(malId));
      if (!existing) existing = await findMediaByExternalId(input.db, "jikan", String(malId));
    }
    if (!existing && anilistId) {
      existing = await findMediaByExternalId(input.db, "anilist", String(anilistId));
    }

    if (!existing) {
      try {
        const normTitle = input.result.title.trim().toLowerCase();
        const baseTitle = input.result.title
          .replace(/[:\-–—]\s*(the\s+)?final\s+(season|chapters|act).*$/i, "")
          .replace(/[:\-–—]\s*(\d+(st|nd|rd|th)|second|third|fourth|fifth|final)\s+season.*$/i, "")
          .replace(/\s+season\s+\d+.*$/i, "")
          .replace(/\s+\d+(st|nd|rd|th)\s+season.*$/i, "")
          .replace(/[:\-–—]?\s*part\s+\d+.*$/i, "")
          .replace(/[:\-–—]?\s*cour\s+\d+.*$/i, "")
          .replace(/\s+(ii|iii|iv|v|vi|vii|viii|ix|x)$/i, "")
          .trim().toLowerCase();

        const matchRows = await input.db.prepare(
          `SELECT * FROM media_items WHERE (LOWER(title) = ? OR LOWER(title) = ?) AND (type = ? OR type IN ('show', 'anime')) LIMIT 1`
        )
          .bind(normTitle, baseTitle, input.result.type)
          .all<MediaItemRow>();

        if (matchRows.results && matchRows.results.length > 0) {
          existing = mapMediaItemRow(matchRows.results[0]);
        }
      } catch {}
    }
  }

  if (existing) {
    if (input.db && input.result.provider !== "local") {
      await attachExternalId(input.db, existing.id, input.result.provider, input.result.providerId, now);
      if (input.result.extendedDataJson) {
        try {
          const currentExt = JSON.parse(existing.extendedDataJson || "{}");
          const incomingExt = JSON.parse(input.result.extendedDataJson);
          const merged = {
            ...currentExt,
            ...incomingExt,
            category: currentExt.category || incomingExt.category,
            hasDub: currentExt.hasDub || incomingExt.hasDub,
            anime: {
              ...(currentExt.anime || {}),
              ...(incomingExt.anime || {}),
              characters: currentExt.anime?.characters?.length ? currentExt.anime.characters : incomingExt.anime?.characters || [],
              japaneseCast: currentExt.anime?.japaneseCast?.length ? currentExt.anime.japaneseCast : incomingExt.anime?.japaneseCast || [],
              dubCast: currentExt.anime?.dubCast?.length ? currentExt.anime.dubCast : incomingExt.anime?.dubCast || [],
              studios: currentExt.anime?.studios?.length ? currentExt.anime.studios : incomingExt.anime?.studios || [],
            },
          };
          await input.db.prepare("UPDATE media_items SET extended_data_json = ?, updated_at = ? WHERE id = ?")
            .bind(JSON.stringify(merged), now, existing.id)
            .run();
        } catch {}
      }
    }
    return existing;
  }

  const media: MediaItemRecord = {
    id: randomId("med"),
    type: input.result.type,
    title: input.result.title,
    overview: input.result.overview ?? null,
    posterPath: input.result.posterPath ?? null,
    backdropPath: input.result.backdropPath ?? null,
    airStatus: inferAirStatus(input.result.type, input.result.releaseDate ?? null),
    runtimeMinutes: null,
    releaseDate: input.result.releaseDate ?? null,
    year: input.result.year ?? null,
    language: null,
    country: null,
    source: input.result.provider,
    sourceId: input.result.providerId,
    totalEpisodes: null,
    totalSeasons: null,
    extendedDataJson: input.result.extendedDataJson ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await input.repo.createMedia(media);
  if (input.db && input.result.provider !== "local") {
    await attachExternalId(input.db, media.id, input.result.provider, input.result.providerId, now);
    await upsertMediaSourceRecord(input.db, media.id, input.result.provider, input.result.providerId, input.result.title, input.result.type, input.result.year ?? null, input.result, now);
    await enqueueMetadataRefresh(input.db, media.id, input.result.provider, now);
  }
  return media;
}

export async function resolveOrCreateImportedCanonicalMedia(input: {
  db: D1Database;
  item: ImportedCanonicalInput;
  now: string;
  onCreated?: (tableName: string, recordId: string) => Promise<void>;
}): Promise<ImportedCanonicalResult> {
  const existing = await findMediaIdByExternalIds(input.db, [
    ["tvtime_uuid", input.item.sourceUuid],
    ["tvdb", input.item.tvdbId],
    ["imdb", input.item.imdbId],
  ]);
  if (existing) {
    await attachImportedExternalIds(input.db, existing, input.item, input.now, input.onCreated);
    await upsertMediaSourceRecord(input.db, existing, "tv_time", input.item.sourceUuid ?? input.item.tvdbId ?? input.item.imdbId, input.item.title, input.item.type, input.item.year, {
      tvdbId: input.item.tvdbId,
      imdbId: input.item.imdbId,
      sourceUuid: input.item.sourceUuid,
    }, input.now);
    return { mediaId: existing, created: false };
  }

  const mediaId = randomId("med");
  try {
    await input.db.prepare(`INSERT INTO media_items (id, media_type_code, canonical_title, normalized_title, type, title, overview, release_date, year, original_language, primary_country, canonical_provider_code, canonical_provider_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, 'tv_time', ?, ?, ?)`)
      .bind(mediaId, input.item.type, input.item.title, normalizeTitle(input.item.title), input.item.type, input.item.title, input.item.releaseDate, input.item.year, input.item.sourceUuid ?? input.item.tvdbId ?? input.item.imdbId, input.item.createdAt ?? input.now, input.now)
      .run();
  } catch {
    await input.db.prepare(`INSERT INTO media_items (id, type, title, overview, poster_path, backdrop_path, air_status, runtime_minutes, release_date, year, language, country, source, source_id, total_episodes, total_seasons, extended_data_json, created_at, updated_at)
      VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL, NULL, 'tv_time', ?, NULL, NULL, NULL, ?, ?)`)
      .bind(mediaId, input.item.type, input.item.title, input.item.releaseDate, input.item.year, input.item.sourceUuid ?? input.item.tvdbId ?? input.item.imdbId, input.item.createdAt ?? input.now, input.now)
      .run();
  }
  await input.onCreated?.("media_items", mediaId);
  await attachImportedExternalIds(input.db, mediaId, input.item, input.now, input.onCreated);
  await upsertMediaSourceRecord(input.db, mediaId, "tv_time", input.item.sourceUuid ?? input.item.tvdbId ?? input.item.imdbId, input.item.title, input.item.type, input.item.year, {
    tvdbId: input.item.tvdbId,
    imdbId: input.item.imdbId,
    sourceUuid: input.item.sourceUuid,
  }, input.now);
  return { mediaId, created: true };
}

export async function findMediaByExternalId(db: D1Database, provider: string, providerId: string): Promise<MediaItemRecord | null> {
  try {
    const row = await db.prepare(`SELECT mi.* FROM media_items mi
      LEFT JOIN media_external_ids ex ON ex.media_id = mi.id
      WHERE (mi.canonical_provider_code = ? AND mi.canonical_provider_id = ?)
         OR ((ex.provider_code = ? OR ex.namespace = ?) AND ex.external_id = ?)
      LIMIT 1`).bind(provider, providerId, provider, provider, providerId).first<MediaItemRow>();
    if (row) return mapMediaItemRow(row);
  } catch {}

  try {
    const row = await db.prepare(`SELECT mi.* FROM media_items mi
      LEFT JOIN media_external_ids ex ON ex.media_id = mi.id
      WHERE (mi.source = ? AND mi.source_id = ?) OR (ex.source = ? AND ex.external_id = ?)
      LIMIT 1`).bind(provider, providerId, provider, providerId).first<MediaItemRow>();
    if (row) return mapMediaItemRow(row);
  } catch {}

  return null;
}

export async function findMediaIdByExternalIds(db: D1Database, ids: Array<[string, string | null]>): Promise<string | null> {
  for (const [source, externalId] of ids) {
    if (!externalId) continue;
    try {
      const row = await db.prepare("SELECT media_id FROM media_external_ids WHERE (provider_code = ? OR namespace = ?) AND external_id = ?").bind(source, source, externalId).first<{ media_id: string }>();
      if (row) return row.media_id;
    } catch {
      try {
        const row = await db.prepare("SELECT media_id FROM media_external_ids WHERE source = ? AND external_id = ?").bind(source, externalId).first<{ media_id: string }>();
        if (row) return row.media_id;
      } catch {}
    }
  }
  return null;
}

export async function resolveMergedMediaId(db: D1Database, requestedMediaId: string): Promise<{ mediaId: string; aliasFromMediaId: string | null }> {
  try {
    const alias = await db.prepare("SELECT target_media_id FROM media_merge_aliases WHERE source_media_id = ? AND status = 'merged'")
      .bind(requestedMediaId)
      .first<{ target_media_id: string }>();
    return { mediaId: alias?.target_media_id ?? requestedMediaId, aliasFromMediaId: alias ? requestedMediaId : null };
  } catch {
    return { mediaId: requestedMediaId, aliasFromMediaId: null };
  }
}

export async function attachExternalId(db: D1Database, mediaId: string, source: string, externalId: string, now: string): Promise<string | null> {
  if (!externalId || source === "local") return null;
  try {
    const existing = await db.prepare("SELECT id FROM media_external_ids WHERE (provider_code = ? OR namespace = ?) AND external_id = ?").bind(source, source, externalId).first<{ id: string }>();
    if (existing) return null;
    const id = randomId("mex");
    await db.prepare("INSERT OR IGNORE INTO media_external_ids (id, media_id, provider_code, namespace, external_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, mediaId, source, source, externalId, now, now)
      .run();
    return id;
  } catch {
    try {
      const existing = await db.prepare("SELECT id FROM media_external_ids WHERE source = ? AND external_id = ?").bind(source, externalId).first<{ id: string }>();
      if (existing) return null;
      const id = randomId("mex");
      await db.prepare("INSERT OR IGNORE INTO media_external_ids (id, media_id, source, external_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(id, mediaId, source, externalId, now)
        .run();
      return id;
    } catch {}
  }
  return null;
}

export async function upsertMediaSourceRecord(db: D1Database, mediaId: string, sourceKind: string, sourceId: string | null, title: string, type: string, year: number | null, raw: unknown, now: string) {
  if (!sourceId) return;
  try {
    await db.prepare(`INSERT INTO media_source_records (id, media_id, provider_code, provider_entity_id, scope, raw_json, confidence, fetched_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'details', ?, 1.0, ?, ?, ?)
      ON CONFLICT(media_id, provider_code, scope) DO UPDATE SET raw_json=excluded.raw_json, updated_at=excluded.updated_at`)
      .bind(randomId("msr"), mediaId, sourceKind, sourceId, JSON.stringify(raw), now, now, now)
      .run();
  } catch {
    try {
      await db.prepare(`INSERT INTO media_source_records (id, media_id, source_kind, source_id, raw_title, raw_type, raw_year, normalized_title, cache_key, raw_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
        ON CONFLICT(source_kind, source_id) DO UPDATE SET media_id=excluded.media_id, raw_title=excluded.raw_title, raw_type=excluded.raw_type, raw_year=excluded.raw_year, normalized_title=excluded.normalized_title, raw_json=excluded.raw_json, updated_at=excluded.updated_at`)
        .bind(randomId("msr"), mediaId, sourceKind, sourceId, title, type, year, normalizeTitle(title), JSON.stringify(raw), now, now)
        .run();
    } catch {}
  }
}

export function inferAirStatus(type: MediaType, releaseDate: string | null) {
  if (releaseDate && releaseDate > new Date().toISOString().slice(0, 10)) return "upcoming";
  return type === "show" || type === "anime" ? "continuing" : "released";
}

export function normalizeTitle(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

async function attachImportedExternalIds(db: D1Database, mediaId: string, item: ImportedCanonicalInput, now: string, onCreated?: (tableName: string, recordId: string) => Promise<void>) {
  const ids = [
    ["tvtime_uuid", item.sourceUuid],
    ["tvdb", item.tvdbId],
    ["imdb", item.imdbId],
  ].filter((pair): pair is [string, string] => Boolean(pair[1]));
  for (const [source, externalId] of ids) {
    const id = await attachExternalId(db, mediaId, source, externalId, now);
    if (id) await onCreated?.("media_external_ids", id);
  }
}

async function findMediaByProviderResult(repo: Pick<CanonicalMediaRepository, "searchMedia">, provider: string, providerId: string, title: string, type: MediaType) {
  const candidates = await repo.searchMedia(title, type, 10);
  return candidates.find((candidate) => candidate.source === provider && candidate.sourceId === providerId) ?? null;
}

async function enqueueMetadataRefresh(db: D1Database, mediaId: string, provider: string, now: string) {
  const safeProvider = provider || "tmdb";
  const dedupeKey = `${mediaId}:media:${safeProvider}`;
  try {
    await db.prepare(`INSERT INTO metadata_refresh_jobs
      (id, media_id, provider, provider_code, scope, dedupe_key, run_after, priority, status, attempts, last_error, context_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'media', ?, ?, 100, 'queued', 0, NULL, '{}', ?, ?)
      ON CONFLICT(dedupe_key) DO UPDATE SET
        status = 'queued',
        attempts = 0,
        last_error = NULL,
        run_after = excluded.run_after,
        updated_at = excluded.updated_at`)
      .bind(randomId("mrj"), mediaId, safeProvider, safeProvider, dedupeKey, now, now, now)
      .run();
  } catch {
    try {
      await db.prepare("INSERT INTO metadata_refresh_jobs (id, media_id, provider_code, scope, status, attempts, last_error, created_at, updated_at, context_json) VALUES (?, ?, ?, 'media', 'queued', 0, NULL, ?, ?, NULL)")
        .bind(randomId("mrj"), mediaId, safeProvider, now, now)
        .run();
    } catch {
      try {
        await db.prepare("INSERT INTO metadata_refresh_jobs (id, media_id, provider, scope, status, attempts, last_error, created_at, updated_at, context_json) VALUES (?, ?, ?, 'media', 'queued', 0, NULL, ?, ?, NULL)")
          .bind(randomId("mrj"), mediaId, safeProvider, now, now)
          .run();
      } catch {}
    }
  }
}

function mapMediaItemRow(row: any): MediaItemRecord {
  return {
    id: row.id,
    type: row.type ?? row.media_type_code,
    title: row.title ?? row.canonical_title,
    overview: row.overview ?? row.synopsis ?? null,
    posterPath: row.poster_path ?? row.poster_url ?? null,
    backdropPath: row.backdrop_path ?? row.backdrop_url ?? null,
    airStatus: row.air_status ?? row.status ?? "released",
    runtimeMinutes: row.runtime_minutes ?? null,
    releaseDate: row.release_date ?? null,
    year: row.year ?? (row.release_date ? Number(row.release_date.slice(0, 4)) : null),
    language: row.language ?? row.original_language ?? null,
    country: row.country ?? row.primary_country ?? null,
    source: row.source ?? row.canonical_provider_code ?? "unknown",
    sourceId: row.source_id ?? row.canonical_provider_id ?? null,
    totalEpisodes: row.total_episodes ?? null,
    totalSeasons: row.total_seasons ?? null,
    extendedDataJson: row.extended_data_json ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
