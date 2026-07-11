import type { DashboardKind } from "@shared/dashboard";
import { dashboardKinds, mediaTypesForDashboardKind } from "@shared/media-config";
import { randomId } from "./crypto";
import { getUserLibraryVersion } from "./library-version-service";

export type DashboardStatsSnapshot = {
  totalTracked: number;
  statusCounts: Record<string, number>;
  sectionCounts: Record<string, number>;
  libraryVersion: number;
  recalculatedAt: string;
};

export type ProfileStatsSnapshot = {
  totalItems: number;
  favorites: number;
  completed: number;
  byType: Record<string, number>;
  libraryVersion: number;
  recalculatedAt: string;
};

export async function dashboardStatsSnapshot(db: D1Database, userId: string, kind: DashboardKind): Promise<DashboardStatsSnapshot> {
  const version = await getUserLibraryVersion(db, userId);
  const cached = await db.prepare(`SELECT total_tracked, status_counts_json, section_counts_json, library_version, recalculated_at
    FROM user_stats_snapshots
    WHERE user_id = ? AND snapshot_kind = ? AND library_version = ?
    LIMIT 1`)
    .bind(userId, `dashboard:${kind}`, version)
    .first<{ total_tracked: number; status_counts_json: string; section_counts_json: string; library_version: number; recalculated_at: string }>();
  if (cached) {
    return {
      totalTracked: cached.total_tracked,
      statusCounts: parseJsonRecord(cached.status_counts_json),
      sectionCounts: parseJsonRecord(cached.section_counts_json),
      libraryVersion: cached.library_version,
      recalculatedAt: cached.recalculated_at,
    };
  }
  return recalculateDashboardStats(db, userId, kind, version);
}

export async function recalculateDashboardStats(db: D1Database, userId: string, kind: DashboardKind, libraryVersion = 1): Promise<DashboardStatsSnapshot> {
  const now = new Date().toISOString();
  const types = mediaTypesForDashboardKind(kind);
  const typePlaceholders = types.map(() => "?").join(", ");
  const totalTrackedRow = await db.prepare(`
    SELECT COUNT(*) as count
    FROM user_media um
    JOIN media_items mi ON mi.id = um.media_id
    WHERE um.user_id = ? AND mi.type IN (${typePlaceholders})
  `).bind(userId, ...types).first<{ count: number }>();
  const statusCountsRows = await db.prepare(`
    SELECT um.status, COUNT(*) as count
    FROM user_media um
    JOIN media_items mi ON mi.id = um.media_id
    WHERE um.user_id = ? AND mi.type IN (${typePlaceholders})
    GROUP BY um.status
  `).bind(userId, ...types).all<{ status: string; count: number }>();
  const statusCounts: Record<string, number> = {};
  for (const row of statusCountsRows.results) statusCounts[row.status] = row.count;
  const sectionCounts = await dashboardSectionCounts(db, userId, kind);
  const totalTracked = totalTrackedRow?.count ?? 0;
  await writeStatsSnapshot(db, userId, `dashboard:${kind}`, libraryVersion, totalTracked, statusCounts, sectionCounts, {}, now);
  return { totalTracked, statusCounts, sectionCounts, libraryVersion, recalculatedAt: now };
}

export async function profileStatsSnapshot(db: D1Database, userId: string): Promise<ProfileStatsSnapshot> {
  const version = await getUserLibraryVersion(db, userId);
  const cached = await db.prepare(`SELECT profile_stats_json, library_version, recalculated_at
    FROM user_stats_snapshots
    WHERE user_id = ? AND snapshot_kind = 'profile' AND library_version = ?
    LIMIT 1`)
    .bind(userId, version)
    .first<{ profile_stats_json: string; library_version: number; recalculated_at: string }>();
  if (cached) return { ...parseProfileStats(cached.profile_stats_json), libraryVersion: cached.library_version, recalculatedAt: cached.recalculated_at };
  return recalculateProfileStats(db, userId, version);
}

export async function recalculateProfileStats(db: D1Database, userId: string, libraryVersion = 1): Promise<ProfileStatsSnapshot> {
  const now = new Date().toISOString();
  const rows = await db.prepare(`
    SELECT mi.type, COUNT(*) AS count,
      SUM(CASE WHEN um.is_favorite = 1 THEN 1 ELSE 0 END) AS favorites,
      SUM(CASE WHEN um.status IN ('completed','watched','finished','up_to_date') THEN 1 ELSE 0 END) AS completed
    FROM user_media um
    JOIN media_items mi ON mi.id = um.media_id
    WHERE um.user_id = ?
    GROUP BY mi.type
  `).bind(userId).all<{ type: string; count: number; favorites: number | null; completed: number | null }>();
  const byType: Record<string, number> = {};
  let totalItems = 0;
  let favorites = 0;
  let completed = 0;
  for (const row of rows.results) {
    byType[row.type] = row.count;
    totalItems += row.count;
    favorites += row.favorites ?? 0;
    completed += row.completed ?? 0;
  }
  const profileStats = { totalItems, favorites, completed, byType };
  await writeStatsSnapshot(db, userId, "profile", libraryVersion, totalItems, {}, {}, profileStats, now);
  return { ...profileStats, libraryVersion, recalculatedAt: now };
}

export async function recalculateAllUserStats(db: D1Database | undefined, userId: string): Promise<void> {
  if (!db) return;
  const version = await getUserLibraryVersion(db, userId);
  await Promise.all([
    ...dashboardKinds.map((kind) => recalculateDashboardStats(db, userId, kind, version)),
    recalculateProfileStats(db, userId, version),
  ]);
}

async function writeStatsSnapshot(db: D1Database, userId: string, kind: string, libraryVersion: number, totalTracked: number, statusCounts: Record<string, number>, sectionCounts: Record<string, number>, profileStats: Record<string, unknown>, now: string) {
  await db.prepare(`INSERT INTO user_stats_snapshots
      (id, user_id, snapshot_kind, library_version, total_tracked, status_counts_json, section_counts_json, profile_stats_json, recalculated_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, snapshot_kind) DO UPDATE SET
      library_version=excluded.library_version,
      total_tracked=excluded.total_tracked,
      status_counts_json=excluded.status_counts_json,
      section_counts_json=excluded.section_counts_json,
      profile_stats_json=excluded.profile_stats_json,
      recalculated_at=excluded.recalculated_at,
      updated_at=excluded.updated_at`)
    .bind(randomId("uss"), userId, kind, libraryVersion, totalTracked, JSON.stringify(statusCounts), JSON.stringify(sectionCounts), JSON.stringify(profileStats), now, now, now)
    .run();
}

function parseJsonRecord(value: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
  } catch {
    return {};
  }
}

function parseProfileStats(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<ProfileStatsSnapshot>;
    return {
      totalItems: parsed.totalItems ?? 0,
      favorites: parsed.favorites ?? 0,
      completed: parsed.completed ?? 0,
      byType: parsed.byType ?? {},
    };
  } catch {
    return { totalItems: 0, favorites: 0, completed: 0, byType: {} };
  }
}

export async function dashboardSectionCounts(db: D1Database, userId: string, kind: DashboardKind): Promise<Record<string, number>> {
  if (kind === "shows" || kind === "anime") {
    const mediaType = mediaTypesForDashboardKind(kind)[0];
    const row = await db.prepare(`
      WITH show_rows AS (
        SELECT
          um.status,
          um.progress_episodes,
          um.updated_at,
          mi.release_date,
          (
            SELECT e.air_date
            FROM episodes e
            LEFT JOIN episode_activity ea ON ea.episode_id = e.id AND ea.user_id = um.user_id AND ea.watched = 1
            WHERE e.media_id = mi.id AND e.is_special = 0 AND ea.id IS NULL
            ORDER BY e.season_number, e.episode_number
            LIMIT 1
          ) AS next_air_date,
          (
            SELECT e.id
            FROM episodes e
            LEFT JOIN episode_activity ea ON ea.episode_id = e.id AND ea.user_id = um.user_id AND ea.watched = 1
            WHERE e.media_id = mi.id AND e.is_special = 0 AND ea.id IS NULL
            ORDER BY e.season_number, e.episode_number
            LIMIT 1
          ) AS next_episode_id
        FROM user_media um
        JOIN media_items mi ON mi.id = um.media_id
        WHERE um.user_id = ? AND mi.type = ?
      )
      SELECT
        COUNT(*) AS all_count,
        SUM(CASE WHEN next_episode_id IS NOT NULL AND (next_air_date IS NULL OR date(next_air_date) <= date('now')) THEN 1 ELSE 0 END) AS watch_next,
        SUM(CASE WHEN progress_episodes > 0 AND next_episode_id IS NOT NULL THEN 1 ELSE 0 END) AS continue_watching,
        SUM(CASE WHEN status = 'watching' AND datetime(updated_at) <= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS away,
        SUM(CASE WHEN status IN ('watch_later', 'not_started') THEN 1 ELSE 0 END) AS watch_later,
        SUM(CASE WHEN date(COALESCE(next_air_date, release_date)) > date('now') THEN 1 ELSE 0 END) AS upcoming,
        SUM(CASE WHEN status IN ('up_to_date', 'completed') THEN 1 ELSE 0 END) AS up_to_date,
        SUM(CASE WHEN status = 'stopped' THEN 1 ELSE 0 END) AS stopped
      FROM show_rows
    `).bind(userId, mediaType).first<Record<string, number | null>>();
    return {
      "watch-next": row?.watch_next ?? 0,
      "continue-watching": row?.continue_watching ?? 0,
      away: row?.away ?? 0,
      "watch-later": row?.watch_later ?? 0,
      upcoming: row?.upcoming ?? 0,
      "up-to-date": row?.up_to_date ?? 0,
      stopped: row?.stopped ?? 0,
      all: row?.all_count ?? 0,
    };
  }

  if (kind === "movies") {
    const row = await db.prepare(`
      SELECT
        COUNT(*) AS all_count,
        SUM(CASE WHEN um.status = 'watch_later' AND (mi.release_date IS NULL OR date(mi.release_date) <= date('now')) THEN 1 ELSE 0 END) AS watchlist,
        SUM(CASE WHEN um.status = 'watched' THEN 1 ELSE 0 END) AS watched,
        SUM(CASE WHEN um.is_favorite = 1 THEN 1 ELSE 0 END) AS favorites,
        SUM(CASE WHEN date(mi.release_date) > date('now') THEN 1 ELSE 0 END) AS upcoming
      FROM user_media um
      JOIN media_items mi ON mi.id = um.media_id
      WHERE um.user_id = ? AND mi.type = 'movie'
    `).bind(userId).first<Record<string, number | null>>();
    return { watchlist: row?.watchlist ?? 0, watched: row?.watched ?? 0, favorites: row?.favorites ?? 0, upcoming: row?.upcoming ?? 0, all: row?.all_count ?? 0 };
  }

  if (kind === "books") {
    const row = await db.prepare(`
      SELECT
        COUNT(*) AS all_count,
        SUM(CASE WHEN um.status = 'reading' THEN 1 ELSE 0 END) AS reading,
        SUM(CASE WHEN um.status = 'want_to_read' THEN 1 ELSE 0 END) AS want_to_read,
        SUM(CASE WHEN um.status = 'finished' THEN 1 ELSE 0 END) AS finished,
        SUM(CASE WHEN date(mi.release_date) > date('now') THEN 1 ELSE 0 END) AS upcoming,
        SUM(CASE WHEN um.is_favorite = 1 THEN 1 ELSE 0 END) AS favorites,
        SUM(CASE WHEN um.status IN ('paused', 'dropped') THEN 1 ELSE 0 END) AS paused
      FROM user_media um
      JOIN media_items mi ON mi.id = um.media_id
      WHERE um.user_id = ? AND mi.type = 'book'
    `).bind(userId).first<Record<string, number | null>>();
    return { reading: row?.reading ?? 0, "want-to-read": row?.want_to_read ?? 0, finished: row?.finished ?? 0, upcoming: row?.upcoming ?? 0, favorites: row?.favorites ?? 0, paused: row?.paused ?? 0, all: row?.all_count ?? 0 };
  }

  const row = await db.prepare(`
    SELECT
      COUNT(*) AS all_count,
      SUM(CASE WHEN um.status = 'playing' THEN 1 ELSE 0 END) AS playing,
      SUM(CASE WHEN um.status = 'planned' THEN 1 ELSE 0 END) AS planned,
      SUM(CASE WHEN um.status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN date(mi.release_date) > date('now') THEN 1 ELSE 0 END) AS upcoming,
      SUM(CASE WHEN um.is_favorite = 1 THEN 1 ELSE 0 END) AS favorites,
      SUM(CASE WHEN um.status IN ('paused', 'dropped') THEN 1 ELSE 0 END) AS paused
    FROM user_media um
    JOIN media_items mi ON mi.id = um.media_id
    WHERE um.user_id = ? AND mi.type = 'game'
  `).bind(userId).first<Record<string, number | null>>();
  return { playing: row?.playing ?? 0, planned: row?.planned ?? 0, completed: row?.completed ?? 0, upcoming: row?.upcoming ?? 0, favorites: row?.favorites ?? 0, paused: row?.paused ?? 0, all: row?.all_count ?? 0 };
}
