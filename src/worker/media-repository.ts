import type { MediaType } from "@shared/media";
import type { DashboardEntry, DashboardKind } from "@shared/dashboard";
import { mediaTypesForDashboardKind } from "@shared/media-config";

// ─────────────────────────────────────────────────────────────
// Record Types
// ─────────────────────────────────────────────────────────────
export type MediaItemRecord = {
  id: string;
  type: MediaType;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  airStatus: string | null;
  runtimeMinutes: number | null;
  releaseDate: string | null;
  year: number | null;
  language: string | null;
  country: string | null;
  source: string;
  sourceId: string | null;
  totalEpisodes: number | null;
  totalSeasons: number | null;
  extendedDataJson?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SeasonRecord = {
  id: string;
  mediaId: string;
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  posterPath: string | null;
  episodeCount: number | null;
  airDate: string | null;
  isSpecial: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EpisodeRecord = {
  id: string;
  mediaId: string;
  seasonId: string | null;
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  stillPath: string | null;
  airDate: string | null;
  runtimeMinutes: number | null;
  isSpecial: boolean;
  externalId: string | null;
  extendedDataJson?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserMediaRecord = {
  id: string;
  userId: string;
  mediaId: string;
  status: string;
  isFavorite: boolean;
  rating: number | null;
  notes: string | null;
  watchedAt: string | null;
  rewatchCount: number;
  progressEpisodes: number;
  progressValue: number | null;
  progressTotal: number | null;
  progressUnit: string | null;
  platform: string | null;
  startedAt: string | null;
  purchaseLibrary: string | null;
  visibility: "public" | "connections" | "private";
  createdAt: string;
  updatedAt: string;
};

export type EpisodeActivityRecord = {
  id: string;
  userId: string;
  episodeId: string;
  mediaId: string;
  watched: boolean;
  watchedAt: string | null;
  rewatchCount: number;
  rating: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityEventRecord = {
  id: string;
  userId: string;
  type: string;
  mediaId: string | null;
  episodeId: string | null;
  dataJson: string | null;
  createdAt: string;
};

export type MediaUnitRecord = {
  id: string; mediaId: string; parentId: string | null; kind: "part" | "chapter" | "act" | "mission" | "quest";
  position: number; title: string | null; overview: string | null; imagePath: string | null;
  releaseDate: string | null; externalId: string | null; createdAt: string; updatedAt: string;
};

export type UnitActivityRecord = {
  id: string; userId: string; unitId: string; mediaId: string; completed: boolean;
  completedAt: string | null; rating: number | null; notes: string | null; createdAt: string; updatedAt: string;
};

export type LibraryFilters = {
  type?: MediaType;
  status?: string;
  isFavorite?: boolean;
  limit?: number;
  cursor?: string; // createdAt cursor for pagination
};

// ─────────────────────────────────────────────────────────────
// Repository Interface
// ─────────────────────────────────────────────────────────────
export type MediaRepository = {
  // Media items
  createMedia(item: MediaItemRecord): Promise<void>;
  findMediaById(id: string): Promise<MediaItemRecord | null>;
  searchMedia(query: string, type?: MediaType, limit?: number): Promise<MediaItemRecord[]>;

  // Seasons
  createSeason(season: SeasonRecord): Promise<void>;
  findSeasonsByMediaId(mediaId: string): Promise<SeasonRecord[]>;

  // Episodes
  createEpisode(episode: EpisodeRecord): Promise<void>;
  findEpisodesByMediaId(mediaId: string, seasonNumber?: number): Promise<EpisodeRecord[]>;
  findEpisodeById(id: string): Promise<EpisodeRecord | null>;

  // Optional book/game chapters, missions, and acts
  createMediaUnit(unit: MediaUnitRecord): Promise<void>;
  findMediaUnits(mediaId: string): Promise<MediaUnitRecord[]>;
  findMediaUnitById(id: string): Promise<MediaUnitRecord | null>;
  upsertUnitActivity(activity: UnitActivityRecord): Promise<UnitActivityRecord>;
  findUnitActivity(userId: string, unitId: string): Promise<UnitActivityRecord | null>;
  findUnitActivitiesForMedia(userId: string, mediaId: string): Promise<UnitActivityRecord[]>;

  // User media (library)
  upsertUserMedia(record: UserMediaRecord): Promise<UserMediaRecord>;
  findUserMedia(userId: string, mediaId: string): Promise<UserMediaRecord | null>;
  findUserLibrary(userId: string, filters?: LibraryFilters): Promise<{ item: UserMediaRecord; media: MediaItemRecord }[]>;
  findDashboardEntries(userId: string, kind: DashboardKind, limit: number, offset: number, query?: string | null): Promise<DashboardEntry[]>;
  removeUserMedia(userId: string, mediaId: string): Promise<void>;
  updateUserMediaProgress(userId: string, mediaId: string, progressEpisodes: number, now: string): Promise<void>;
  updateUserMediaDetailProgress(userId: string, mediaId: string, value: number | null, total: number | null, unit: string | null, platform: string | null, startedAt: string | null, purchaseLibrary: string | null, now: string): Promise<UserMediaRecord | null>;

  // Episode activity
  upsertEpisodeActivity(record: EpisodeActivityRecord): Promise<EpisodeActivityRecord>;
  upsertEpisodeActivities(records: EpisodeActivityRecord[]): Promise<void>;
  findEpisodeActivity(userId: string, episodeId: string): Promise<EpisodeActivityRecord | null>;
  findEpisodeActivitiesForMedia(userId: string, mediaId: string): Promise<EpisodeActivityRecord[]>;

  // Activity events
  createActivityEvent(event: ActivityEventRecord): Promise<void>;

  // Media cover/poster updates
  updateMediaPoster(mediaId: string, posterPath: string, now: string): Promise<void>;
  updateMediaExtendedData(mediaId: string, extendedDataJson: string | null, now: string): Promise<void>;
};

// ─────────────────────────────────────────────────────────────
// D1 Row Types
// ─────────────────────────────────────────────────────────────
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

type SeasonRow = {
  id: string;
  media_id: string;
  season_number: number;
  name: string | null;
  overview: string | null;
  poster_path: string | null;
  episode_count: number | null;
  air_date: string | null;
  is_special: number;
  created_at: string;
  updated_at: string;
};

type EpisodeRow = {
  id: string;
  media_id: string;
  season_id: string | null;
  season_number: number;
  episode_number: number;
  name: string | null;
  overview: string | null;
  still_path: string | null;
  air_date: string | null;
  runtime_minutes: number | null;
  is_special: number;
  external_id: string | null;
  extended_data_json?: string | null;
  created_at: string;
  updated_at: string;
};

type UserMediaRow = {
  id: string;
  user_id: string;
  media_id: string;
  status: string;
  is_favorite: number;
  rating: number | null;
  notes: string | null;
  watched_at: string | null;
  rewatch_count: number;
  progress_episodes: number;
  progress_value: number | null;
  progress_total: number | null;
  progress_unit: string | null;
  platform: string | null;
  started_at: string | null;
  purchase_library: string | null;
  visibility: "public" | "connections" | "private";
  created_at: string;
  updated_at: string;
};

type EpisodeActivityRow = {
  id: string;
  user_id: string;
  episode_id: string;
  media_id: string;
  watched: number;
  watched_at: string | null;
  rewatch_count: number;
  rating: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type DashboardRow = {
  media_id: string;
  type: MediaType;
  title: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  air_status: string | null;
  release_date: string | null;
  year: number | null;
  status: string;
  is_favorite: number;
  rating: number | null;
  progress_episodes: number;
  progress_value: number | null;
  progress_total: number | null;
  progress_unit: string | null;
  platform: string | null;
  started_at: string | null;
  purchase_library: string | null;
  updated_at: string;
  total_regular_episodes: number;
  next_episode_id: string | null;
  next_episode_name: string | null;
  next_season_number: number | null;
  next_episode_number: number | null;
  next_episode_air_date: string | null;
};

type MediaUnitRow = { id: string; media_id: string; parent_id: string | null; kind: MediaUnitRecord["kind"]; position: number; title: string | null; overview: string | null; image_path: string | null; release_date: string | null; external_id: string | null; created_at: string; updated_at: string };
type UnitActivityRow = { id: string; user_id: string; unit_id: string; media_id: string; completed: number; completed_at: string | null; rating: number | null; notes: string | null; created_at: string; updated_at: string };

// ─────────────────────────────────────────────────────────────
// D1 Implementation
// ─────────────────────────────────────────────────────────────
export class D1MediaRepository implements MediaRepository {
  constructor(private readonly db: D1Database) {}

  async createMedia(item: MediaItemRecord) {
    await this.db
      .prepare(
        `INSERT INTO media_items
           (id, type, title, overview, poster_path, backdrop_path, air_status,
            runtime_minutes, release_date, year, language, country,
            source, source_id, total_episodes, total_seasons, extended_data_json, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        item.id, item.type, item.title, item.overview, item.posterPath, item.backdropPath,
        item.airStatus, item.runtimeMinutes, item.releaseDate, item.year, item.language,
        item.country, item.source, item.sourceId, item.totalEpisodes, item.totalSeasons,
        item.extendedDataJson ?? null, item.createdAt, item.updatedAt,
      )
      .run();
  }

  async updateMediaPoster(mediaId: string, posterPath: string, now: string) {
    await this.db
      .prepare("UPDATE media_items SET poster_path = ?, updated_at = ? WHERE id = ?")
      .bind(posterPath, now, mediaId)
      .run();
  }

  async updateMediaExtendedData(mediaId: string, extendedDataJson: string | null, now: string) {
    await this.db
      .prepare("UPDATE media_items SET extended_data_json = ?, updated_at = ? WHERE id = ?")
      .bind(extendedDataJson, now, mediaId)
      .run();
  }

  async findMediaById(id: string) {
    const row = await this.db.prepare("SELECT * FROM media_items WHERE id = ?").bind(id).first<MediaItemRow>();
    return row ? mapMediaItem(row) : null;
  }

  async searchMedia(query: string, type?: MediaType, limit = 20) {
    const like = `%${query}%`;
    const result = type
      ? await this.db
          .prepare("SELECT * FROM media_items WHERE type = ? AND title LIKE ? LIMIT ?")
          .bind(type, like, limit)
          .all<MediaItemRow>()
      : await this.db
          .prepare("SELECT * FROM media_items WHERE title LIKE ? LIMIT ?")
          .bind(like, limit)
          .all<MediaItemRow>();
    return result.results.map(mapMediaItem);
  }

  async createSeason(season: SeasonRecord) {
    await this.db
      .prepare(
        `INSERT INTO seasons
           (id, media_id, season_number, name, overview, poster_path,
            episode_count, air_date, is_special, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        season.id, season.mediaId, season.seasonNumber, season.name, season.overview,
        season.posterPath, season.episodeCount, season.airDate,
        season.isSpecial ? 1 : 0, season.createdAt, season.updatedAt,
      )
      .run();
  }

  async findSeasonsByMediaId(mediaId: string) {
    const result = await this.db
      .prepare("SELECT * FROM seasons WHERE media_id = ? ORDER BY season_number")
      .bind(mediaId)
      .all<SeasonRow>();
    return result.results.map(mapSeason);
  }

  async createEpisode(episode: EpisodeRecord) {
    await this.db
      .prepare(
        `INSERT INTO episodes
           (id, media_id, season_id, season_number, episode_number, name, overview,
            still_path, air_date, runtime_minutes, is_special, external_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        episode.id, episode.mediaId, episode.seasonId, episode.seasonNumber,
        episode.episodeNumber, episode.name, episode.overview, episode.stillPath,
        episode.airDate, episode.runtimeMinutes, episode.isSpecial ? 1 : 0,
        episode.externalId, episode.createdAt, episode.updatedAt,
      )
      .run();
  }

  async findEpisodesByMediaId(mediaId: string, seasonNumber?: number) {
    const result =
      seasonNumber !== undefined
        ? await this.db
            .prepare("SELECT * FROM episodes WHERE media_id = ? AND season_number = ? ORDER BY episode_number")
            .bind(mediaId, seasonNumber)
            .all<EpisodeRow>()
        : await this.db
            .prepare("SELECT * FROM episodes WHERE media_id = ? ORDER BY season_number, episode_number")
            .bind(mediaId)
            .all<EpisodeRow>();
    return result.results.map(mapEpisode);
  }

  async findEpisodeById(id: string) {
    const row = await this.db.prepare("SELECT * FROM episodes WHERE id = ?").bind(id).first<EpisodeRow>();
    return row ? mapEpisode(row) : null;
  }

  async createMediaUnit(unit: MediaUnitRecord) {
    await this.db.prepare(`INSERT INTO media_units (id, media_id, parent_id, kind, position, title, overview, image_path, release_date, external_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(unit.id, unit.mediaId, unit.parentId, unit.kind, unit.position, unit.title, unit.overview, unit.imagePath, unit.releaseDate, unit.externalId, unit.createdAt, unit.updatedAt).run();
  }

  async findMediaUnits(mediaId: string) {
    const result = await this.db.prepare("SELECT * FROM media_units WHERE media_id = ? ORDER BY parent_id, position").bind(mediaId).all<MediaUnitRow>();
    return result.results.map(mapMediaUnit);
  }

  async findMediaUnitById(id: string) {
    const row = await this.db.prepare("SELECT * FROM media_units WHERE id = ?").bind(id).first<MediaUnitRow>();
    return row ? mapMediaUnit(row) : null;
  }

  async upsertUnitActivity(activity: UnitActivityRecord) {
    await this.db.prepare(`INSERT INTO unit_activity (id, user_id, unit_id, media_id, completed, completed_at, rating, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, unit_id) DO UPDATE SET completed=excluded.completed, completed_at=excluded.completed_at, rating=excluded.rating, notes=excluded.notes, updated_at=excluded.updated_at`)
      .bind(activity.id, activity.userId, activity.unitId, activity.mediaId, activity.completed ? 1 : 0, activity.completedAt, activity.rating, activity.notes, activity.createdAt, activity.updatedAt).run();
    return (await this.findUnitActivity(activity.userId, activity.unitId))!;
  }

  async findUnitActivity(userId: string, unitId: string) {
    const row = await this.db.prepare("SELECT * FROM unit_activity WHERE user_id = ? AND unit_id = ?").bind(userId, unitId).first<UnitActivityRow>();
    return row ? mapUnitActivity(row) : null;
  }

  async findUnitActivitiesForMedia(userId: string, mediaId: string) {
    const result = await this.db.prepare("SELECT * FROM unit_activity WHERE user_id = ? AND media_id = ?").bind(userId, mediaId).all<UnitActivityRow>();
    return result.results.map(mapUnitActivity);
  }

  async upsertUserMedia(record: UserMediaRecord) {
    await this.db
      .prepare(
        `INSERT INTO user_media
           (id, user_id, media_id, status, is_favorite, rating, notes,
            watched_at, rewatch_count, progress_episodes, progress_value, progress_total,
            progress_unit, platform, started_at, purchase_library, visibility, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(user_id, media_id) DO UPDATE SET
           status=excluded.status, is_favorite=excluded.is_favorite,
           rating=excluded.rating, notes=excluded.notes,
           watched_at=excluded.watched_at, rewatch_count=excluded.rewatch_count,
           progress_episodes=excluded.progress_episodes, progress_value=excluded.progress_value,
           progress_total=excluded.progress_total, progress_unit=excluded.progress_unit,
           platform=excluded.platform, started_at=excluded.started_at, purchase_library=excluded.purchase_library, visibility=excluded.visibility,
           updated_at=excluded.updated_at`,
      )
      .bind(
        record.id, record.userId, record.mediaId, record.status,
        record.isFavorite ? 1 : 0, record.rating, record.notes,
        record.watchedAt, record.rewatchCount, record.progressEpisodes,
        record.progressValue, record.progressTotal, record.progressUnit, record.platform,
        record.startedAt, record.purchaseLibrary,
        record.visibility, record.createdAt, record.updatedAt,
      )
      .run();
    return (await this.findUserMedia(record.userId, record.mediaId))!;
  }

  async findUserMedia(userId: string, mediaId: string) {
    const row = await this.db
      .prepare("SELECT * FROM user_media WHERE user_id = ? AND media_id = ?")
      .bind(userId, mediaId)
      .first<UserMediaRow>();
    return row ? mapUserMedia(row) : null;
  }

  async findUserLibrary(userId: string, filters: LibraryFilters = {}) {
    const conditions: string[] = ["um.user_id = ?"];
    const binds: (string | number)[] = [userId];

    if (filters.type) {
      conditions.push("mi.type = ?");
      binds.push(filters.type);
    }
    if (filters.status) {
      conditions.push("um.status = ?");
      binds.push(filters.status);
    }
    if (filters.isFavorite !== undefined) {
      conditions.push("um.is_favorite = ?");
      binds.push(filters.isFavorite ? 1 : 0);
    }
    if (filters.cursor) {
      conditions.push("um.created_at < ?");
      binds.push(filters.cursor);
    }

    const limit = filters.limit ?? 50;
    const where = conditions.join(" AND ");

    const result = await this.db
      .prepare(
        `SELECT um.*, mi.type as mi_type, mi.title as mi_title, mi.overview as mi_overview,
                mi.poster_path as mi_poster_path, mi.backdrop_path as mi_backdrop_path,
                mi.air_status as mi_air_status, mi.runtime_minutes as mi_runtime_minutes,
                mi.release_date as mi_release_date, mi.year as mi_year,
                mi.language as mi_language, mi.country as mi_country,
                mi.source as mi_source, mi.source_id as mi_source_id,
                mi.total_episodes as mi_total_episodes, mi.total_seasons as mi_total_seasons,
                mi.extended_data_json as mi_extended_data_json,
                mi.created_at as mi_created_at, mi.updated_at as mi_updated_at
         FROM user_media um
         INNER JOIN media_items mi ON mi.id = um.media_id
         WHERE ${where}
         ORDER BY um.updated_at DESC
         LIMIT ?`,
      )
      .bind(...binds, limit)
      .all<UserMediaRow & { mi_type: MediaType; mi_title: string; mi_overview: string | null; mi_poster_path: string | null; mi_backdrop_path: string | null; mi_air_status: string | null; mi_runtime_minutes: number | null; mi_release_date: string | null; mi_year: number | null; mi_language: string | null; mi_country: string | null; mi_source: string; mi_source_id: string | null; mi_total_episodes: number | null; mi_total_seasons: number | null; mi_extended_data_json?: string | null; mi_created_at: string; mi_updated_at: string }>();

    return result.results.map((row) => ({
      item: mapUserMedia(row),
      media: mapMediaItem({
        id: row.media_id,
        type: row.mi_type,
        title: row.mi_title,
        overview: row.mi_overview,
        poster_path: row.mi_poster_path,
        backdrop_path: row.mi_backdrop_path,
        air_status: row.mi_air_status,
        runtime_minutes: row.mi_runtime_minutes,
        release_date: row.mi_release_date,
        year: row.mi_year,
        language: row.mi_language,
        country: row.mi_country,
        source: row.mi_source,
        source_id: row.mi_source_id,
        total_episodes: row.mi_total_episodes,
        total_seasons: row.mi_total_seasons,
        extended_data_json: row.mi_extended_data_json ?? null,
        created_at: row.mi_created_at,
        updated_at: row.mi_updated_at,
      }),
    }));
  }

  async findDashboardEntries(userId: string, kind: DashboardKind, limit: number, offset: number, query?: string | null) {
    const types = mediaTypesForDashboardKind(kind);
    const typePlaceholders = types.map(() => "?").join(", ");
    const animeClassificationClause = "(mi.extended_data_json LIKE '%\"category\":\"anime\"%' OR mi.extended_data_json LIKE '%\"anime\":%')";
    const typeClause = kind === "anime"
      ? `(mi.type IN (${typePlaceholders}) OR ${animeClassificationClause})`
      : (kind === "shows" || kind === "movies")
        ? `(mi.type IN (${typePlaceholders}) AND NOT ${animeClassificationClause})`
        : `mi.type IN (${typePlaceholders})`;
    const trimmedQuery = query?.trim();
    const searchClause = trimmedQuery ? "AND mi.title LIKE ?" : "";
    const searchBinds = trimmedQuery ? [`%${trimmedQuery}%`] : [];
    const result = await this.db
      .prepare(
        `SELECT
           mi.id AS media_id, mi.type, mi.title, mi.overview, mi.poster_path,
           mi.backdrop_path, mi.air_status, mi.release_date, mi.year,
           um.status, um.is_favorite, um.rating, um.progress_episodes, um.updated_at,
           um.progress_value, um.progress_total, um.progress_unit, um.platform, um.started_at, um.purchase_library,
           (SELECT COUNT(*) FROM episodes total_ep
             WHERE total_ep.media_id = mi.id AND total_ep.is_special = 0) AS total_regular_episodes,
           (SELECT next_ep.id FROM episodes next_ep
             WHERE next_ep.media_id = mi.id AND next_ep.is_special = 0
               AND NOT EXISTS (
                 SELECT 1 FROM episode_activity ea
                 WHERE ea.user_id = um.user_id AND ea.episode_id = next_ep.id AND ea.watched = 1
               )
             ORDER BY next_ep.season_number, next_ep.episode_number LIMIT 1) AS next_episode_id,
           (SELECT next_ep.name FROM episodes next_ep
             WHERE next_ep.media_id = mi.id AND next_ep.is_special = 0
               AND NOT EXISTS (
                 SELECT 1 FROM episode_activity ea
                 WHERE ea.user_id = um.user_id AND ea.episode_id = next_ep.id AND ea.watched = 1
               )
             ORDER BY next_ep.season_number, next_ep.episode_number LIMIT 1) AS next_episode_name,
           (SELECT next_ep.season_number FROM episodes next_ep
             WHERE next_ep.media_id = mi.id AND next_ep.is_special = 0
               AND NOT EXISTS (
                 SELECT 1 FROM episode_activity ea
                 WHERE ea.user_id = um.user_id AND ea.episode_id = next_ep.id AND ea.watched = 1
               )
             ORDER BY next_ep.season_number, next_ep.episode_number LIMIT 1) AS next_season_number,
           (SELECT next_ep.episode_number FROM episodes next_ep
             WHERE next_ep.media_id = mi.id AND next_ep.is_special = 0
               AND NOT EXISTS (
                 SELECT 1 FROM episode_activity ea
                 WHERE ea.user_id = um.user_id AND ea.episode_id = next_ep.id AND ea.watched = 1
               )
             ORDER BY next_ep.season_number, next_ep.episode_number LIMIT 1) AS next_episode_number,
           (SELECT next_ep.air_date FROM episodes next_ep
             WHERE next_ep.media_id = mi.id AND next_ep.is_special = 0
               AND NOT EXISTS (
                 SELECT 1 FROM episode_activity ea
                 WHERE ea.user_id = um.user_id AND ea.episode_id = next_ep.id AND ea.watched = 1
               )
             ORDER BY next_ep.season_number, next_ep.episode_number LIMIT 1) AS next_episode_air_date
         FROM user_media um
         JOIN media_items mi ON mi.id = um.media_id
         WHERE um.user_id = ? AND ${typeClause} ${searchClause}
         ORDER BY um.updated_at DESC, mi.title COLLATE NOCASE
         LIMIT ? OFFSET ?`,
      )
      .bind(userId, ...types, ...searchBinds, limit, offset)
      .all<DashboardRow>();

    return result.results.map(mapDashboardRow);
  }

  async removeUserMedia(userId: string, mediaId: string) {
    await this.db.prepare("DELETE FROM user_media WHERE user_id = ? AND media_id = ?").bind(userId, mediaId).run();
  }

  async updateUserMediaProgress(userId: string, mediaId: string, progressEpisodes: number, now: string) {
    await this.db
      .prepare("UPDATE user_media SET progress_episodes = ?, updated_at = ? WHERE user_id = ? AND media_id = ?")
      .bind(progressEpisodes, now, userId, mediaId)
      .run();
  }

  async upsertEpisodeActivity(record: EpisodeActivityRecord) {
    await this.db
      .prepare(
        `INSERT INTO episode_activity
           (id, user_id, episode_id, media_id, watched, watched_at, rewatch_count, rating, notes, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(user_id, episode_id) DO UPDATE SET
           watched=excluded.watched, watched_at=excluded.watched_at,
           rewatch_count=excluded.rewatch_count, rating=excluded.rating,
           notes=excluded.notes, updated_at=excluded.updated_at`,
      )
      .bind(
        record.id, record.userId, record.episodeId, record.mediaId,
        record.watched ? 1 : 0, record.watchedAt, record.rewatchCount, record.rating, record.notes,
        record.createdAt, record.updatedAt,
      )
      .run();
    return (await this.findEpisodeActivity(record.userId, record.episodeId))!;
  }

  async updateUserMediaDetailProgress(userId: string, mediaId: string, value: number | null, total: number | null, unit: string | null, platform: string | null, startedAt: string | null, purchaseLibrary: string | null, now: string) {
    await this.db.prepare("UPDATE user_media SET progress_value = ?, progress_total = ?, progress_unit = ?, platform = ?, started_at = ?, purchase_library = ?, updated_at = ? WHERE user_id = ? AND media_id = ?")
      .bind(value, total, unit, platform, startedAt, purchaseLibrary, now, userId, mediaId).run();
    return this.findUserMedia(userId, mediaId);
  }

  async upsertEpisodeActivities(records: EpisodeActivityRecord[]) {
    if (records.length === 0) return;
    await this.db.batch(records.map((record) => this.db.prepare(
      `INSERT INTO episode_activity
         (id, user_id, episode_id, media_id, watched, watched_at, rewatch_count, rating, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, episode_id) DO UPDATE SET
         watched = excluded.watched, watched_at = excluded.watched_at,
         rewatch_count = excluded.rewatch_count, rating = excluded.rating,
         notes = excluded.notes, updated_at = excluded.updated_at`,
    ).bind(record.id, record.userId, record.episodeId, record.mediaId, record.watched ? 1 : 0, record.watchedAt, record.rewatchCount, record.rating, record.notes, record.createdAt, record.updatedAt)));
  }

  async findEpisodeActivity(userId: string, episodeId: string) {
    const row = await this.db
      .prepare("SELECT * FROM episode_activity WHERE user_id = ? AND episode_id = ?")
      .bind(userId, episodeId)
      .first<EpisodeActivityRow>();
    return row ? mapEpisodeActivity(row) : null;
  }

  async findEpisodeActivitiesForMedia(userId: string, mediaId: string) {
    const result = await this.db
      .prepare("SELECT * FROM episode_activity WHERE user_id = ? AND media_id = ?")
      .bind(userId, mediaId)
      .all<EpisodeActivityRow>();
    return result.results.map(mapEpisodeActivity);
  }

  async createActivityEvent(event: ActivityEventRecord) {
    try {
      await this.db
        .prepare(
          "INSERT INTO activity_events (id, user_id, type, media_id, episode_id, data_json, created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(event.id, event.userId, event.type, event.mediaId, event.episodeId, event.dataJson, event.createdAt)
        .run();
    } catch (error) {
      console.warn("Activity event write failed:", error);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Row mappers
// ─────────────────────────────────────────────────────────────
function mapMediaItem(row: MediaItemRow): MediaItemRecord {
  return {
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
    extendedDataJson: row.extended_data_json ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSeason(row: SeasonRow): SeasonRecord {
  return {
    id: row.id,
    mediaId: row.media_id,
    seasonNumber: row.season_number,
    name: row.name,
    overview: row.overview,
    posterPath: row.poster_path,
    episodeCount: row.episode_count,
    airDate: row.air_date,
    isSpecial: row.is_special === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEpisode(row: EpisodeRow): EpisodeRecord {
  return {
    id: row.id,
    mediaId: row.media_id,
    seasonId: row.season_id,
    seasonNumber: row.season_number,
    episodeNumber: row.episode_number,
    name: row.name,
    overview: row.overview,
    stillPath: row.still_path,
    airDate: row.air_date,
    runtimeMinutes: row.runtime_minutes,
    isSpecial: row.is_special === 1,
    externalId: row.external_id,
    extendedDataJson: row.extended_data_json ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUserMedia(row: UserMediaRow): UserMediaRecord {
  return {
    id: row.id,
    userId: row.user_id,
    mediaId: row.media_id,
    status: row.status,
    isFavorite: row.is_favorite === 1,
    rating: row.rating,
    notes: row.notes,
    watchedAt: row.watched_at,
    rewatchCount: row.rewatch_count,
    progressEpisodes: row.progress_episodes,
    progressValue: row.progress_value,
    progressTotal: row.progress_total,
    progressUnit: row.progress_unit,
    platform: row.platform,
    startedAt: row.started_at ?? null,
    purchaseLibrary: row.purchase_library ?? null,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEpisodeActivity(row: EpisodeActivityRow): EpisodeActivityRecord {
  return {
    id: row.id,
    userId: row.user_id,
    episodeId: row.episode_id,
    mediaId: row.media_id,
    watched: row.watched === 1,
    watchedAt: row.watched_at,
    rewatchCount: row.rewatch_count,
    rating: row.rating,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDashboardRow(row: DashboardRow): DashboardEntry {
  return {
    mediaId: row.media_id,
    type: row.type,
    title: row.title,
    overview: row.overview,
    posterPath: row.poster_path,
    backdropPath: row.backdrop_path,
    airStatus: row.air_status,
    releaseDate: row.release_date,
    year: row.year,
    status: row.status,
    isFavorite: row.is_favorite === 1,
    rating: row.rating,
    progressEpisodes: row.progress_episodes,
    progressValue: row.progress_value,
    progressTotal: row.progress_total,
    progressUnit: row.progress_unit,
    platform: row.platform,
    startedAt: row.started_at ?? null,
    purchaseLibrary: row.purchase_library ?? null,
    updatedAt: row.updated_at,
    totalRegularEpisodes: row.total_regular_episodes,
    nextEpisode: row.next_episode_id && row.next_season_number !== null && row.next_episode_number !== null
      ? {
          id: row.next_episode_id,
          name: row.next_episode_name,
          seasonNumber: row.next_season_number,
          episodeNumber: row.next_episode_number,
          airDate: row.next_episode_air_date,
        }
      : null,
  };
}

function mapMediaUnit(row: MediaUnitRow): MediaUnitRecord {
  return { id: row.id, mediaId: row.media_id, parentId: row.parent_id, kind: row.kind, position: row.position, title: row.title, overview: row.overview, imagePath: row.image_path, releaseDate: row.release_date, externalId: row.external_id, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapUnitActivity(row: UnitActivityRow): UnitActivityRecord {
  return { id: row.id, userId: row.user_id, unitId: row.unit_id, mediaId: row.media_id, completed: row.completed === 1, completedAt: row.completed_at, rating: row.rating, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at };
}
