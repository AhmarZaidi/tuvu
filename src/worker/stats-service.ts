import type { DashboardKind } from "@shared/dashboard";
import { mediaTypesForDashboardKind } from "@shared/media-config";

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
