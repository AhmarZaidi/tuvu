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
  title?: string | null;
  overview: string | null;
  synopsis?: string | null;
  stillPath: string | null;
  stillUrl?: string | null;
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
    const norm = (item.title || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    try {
      await this.db
        .prepare(
          `INSERT INTO media_items
             (id, media_type_code, canonical_title, normalized_title, type, title, overview, synopsis,
              poster_path, poster_url, backdrop_path, backdrop_url, air_status, status,
              runtime_minutes, release_date, year, original_language, primary_country,
              canonical_provider_code, canonical_provider_id, extended_data_json, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          item.id,
          item.type,
          item.title,
          norm,
          item.type,
          item.title,
          item.overview,
          item.overview,
          item.posterPath,
          item.posterPath,
          item.backdropPath,
          item.backdropPath,
          item.airStatus,
          item.airStatus,
          item.runtimeMinutes,
          item.releaseDate,
          item.year,
          item.language,
          item.country,
          item.source,
          item.sourceId,
          item.extendedDataJson ?? "{}",
          item.createdAt,
          item.updatedAt,
        )
        .run();
      return;
    } catch (e1) {
      try {
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
        return;
      } catch (e2) {
        await this.db
          .prepare(
            `INSERT INTO media_items
               (id, media_type_code, canonical_title, normalized_title, type, title, poster_path, poster_url, release_date, year, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            item.id, item.type, item.title, norm, item.type, item.title, item.posterPath, item.posterPath, item.releaseDate, item.year, item.createdAt, item.updatedAt
          )
          .run();
      }
    }
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
    try {
      const result = type
        ? await this.db
            .prepare("SELECT * FROM media_items WHERE (type = ? OR media_type_code = ?) AND (title LIKE ? OR canonical_title LIKE ?) LIMIT ?")
            .bind(type, type, like, like, limit)
            .all<MediaItemRow>()
        : await this.db
            .prepare("SELECT * FROM media_items WHERE (title LIKE ? OR canonical_title LIKE ?) LIMIT ?")
            .bind(like, like, limit)
            .all<MediaItemRow>();
      return result.results.map(mapMediaItem);
    } catch {
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
    try {
      await this.db.prepare(`INSERT INTO media_units (id, media_id, parent_id, unit_kind, position, title, synopsis, image_url, release_date, external_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(unit.id, unit.mediaId, unit.parentId, unit.kind, unit.position, unit.title, unit.overview, unit.imagePath, unit.releaseDate, unit.externalId, unit.createdAt, unit.updatedAt).run();
    } catch {
      await this.db.prepare(`INSERT INTO media_units (id, media_id, parent_id, kind, position, title, overview, image_path, release_date, external_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(unit.id, unit.mediaId, unit.parentId, unit.kind, unit.position, unit.title, unit.overview, unit.imagePath, unit.releaseDate, unit.externalId, unit.createdAt, unit.updatedAt).run();
    }
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
    try {
      const userMediaId = (await this.findUserMedia(activity.userId, activity.mediaId))?.id ?? activity.id;
      await this.db.prepare(
        `INSERT INTO unit_activity (id, user_id, user_media_id, unit_id, completed_count, last_completed_at, rating, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, unit_id) DO UPDATE SET completed_count=excluded.completed_count, last_completed_at=excluded.last_completed_at, rating=excluded.rating, notes=excluded.notes, updated_at=excluded.updated_at`
      ).bind(
        activity.id, activity.userId, userMediaId, activity.unitId,
        activity.completed ? 1 : 0, activity.completedAt, activity.rating, activity.notes, activity.createdAt, activity.updatedAt
      ).run();
    } catch {
      await this.db.prepare(
        `INSERT INTO unit_activity (id, user_id, unit_id, media_id, completed, completed_at, rating, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, unit_id) DO UPDATE SET completed=excluded.completed, completed_at=excluded.completed_at, rating=excluded.rating, notes=excluded.notes, updated_at=excluded.updated_at`
      ).bind(
        activity.id, activity.userId, activity.unitId, activity.mediaId,
        activity.completed ? 1 : 0, activity.completedAt, activity.rating, activity.notes, activity.createdAt, activity.updatedAt
      ).run();
    }
    return (await this.findUnitActivity(activity.userId, activity.unitId))!;
  }

  async findUnitActivity(userId: string, unitId: string) {
    try {
      const row = await this.db.prepare("SELECT * FROM unit_activity WHERE user_id = ? AND unit_id = ?").bind(userId, unitId).first<any>();
      return row ? mapUnitActivity(row) : null;
    } catch {
      return null;
    }
  }

  async findUnitActivitiesForMedia(userId: string, mediaId: string) {
    try {
      const result = await this.db.prepare(
        `SELECT ua.*, COALESCE(um.media_id, mu.media_id, ?) as media_id
         FROM unit_activity ua
         LEFT JOIN user_media um ON um.id = ua.user_media_id
         LEFT JOIN media_units mu ON mu.id = ua.unit_id
         WHERE ua.user_id = ? AND (um.media_id = ? OR mu.media_id = ?)`
      ).bind(mediaId, userId, mediaId, mediaId).all<any>();
      return result.results.map(mapUnitActivity);
    } catch {
      try {
        const result = await this.db.prepare("SELECT * FROM unit_activity WHERE user_id = ? AND media_id = ?").bind(userId, mediaId).all<any>();
        return result.results.map(mapUnitActivity);
      } catch {
        return [];
      }
    }
  }

  async upsertUserMedia(record: UserMediaRecord) {
    try {
      await this.db
        .prepare(
          `INSERT INTO user_media
             (id, user_id, media_id, status, is_favorite, rating, notes,
              completed_at, rewatch_count, progress_episodes, progress_value, progress_total,
              progress_unit, platform, started_at, purchase_library, visibility, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(user_id, media_id) DO UPDATE SET
             status=excluded.status, is_favorite=excluded.is_favorite,
             rating=excluded.rating, notes=excluded.notes,
             completed_at=excluded.completed_at, rewatch_count=excluded.rewatch_count,
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
    } catch {
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
      conditions.push("(mi.type = ? OR mi.media_type_code = ?)");
      binds.push(filters.type, filters.type);
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
        `SELECT
           mi.*,
           um.id AS user_media_id,
           um.user_id AS user_media_user_id,
           um.media_id AS user_media_media_id,
           um.status,
           um.is_favorite,
           um.rating,
           um.notes,
           um.watched_at,
           um.completed_at,
           um.rewatch_count,
           um.progress_episodes,
           um.progress_value,
           um.progress_total,
           um.progress_unit,
           um.platform,
           um.started_at,
           um.purchase_library,
           um.visibility,
           um.created_at AS user_media_created_at,
           um.updated_at AS user_media_updated_at
         FROM user_media um
         INNER JOIN media_items mi ON mi.id = um.media_id
         WHERE ${where}
         ORDER BY um.updated_at DESC
         LIMIT ?`,
      )
      .bind(...binds, limit)
      .all<any>();

    return result.results.map((row) => ({
      item: mapUserMedia(row),
      media: mapMediaItem(row),
    }));
  }

  async findDashboardEntries(userId: string, kind: DashboardKind, limit: number, offset: number, query?: string | null) {
    const types = mediaTypesForDashboardKind(kind);
    const typePlaceholders = types.map(() => "?").join(", ");
    const animeClassificationClause = "(COALESCE(mi.extended_data_json, '') LIKE '%\"category\":\"anime\"%' OR COALESCE(mi.extended_data_json, '') LIKE '%\"anime\":%')";
    const typeMatches = `COALESCE(mi.type, mi.media_type_code) IN (${typePlaceholders})`;
    const typeClause = kind === "anime"
      ? `(${typeMatches} OR ${animeClassificationClause})`
      : (kind === "shows" || kind === "movies")
        ? `(${typeMatches} AND NOT ${animeClassificationClause})`
        : typeMatches;
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
    try {
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
    } catch {
      const userMediaId = (await this.findUserMedia(record.userId, record.mediaId))?.id ?? record.id;
      await this.db
        .prepare(
          `INSERT INTO episode_activity
             (id, user_id, user_media_id, episode_id, media_id, watched, last_watched_at, watched_count, rating, notes, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(user_id, episode_id) DO UPDATE SET
             watched=excluded.watched, last_watched_at=excluded.last_watched_at,
             watched_count=excluded.watched_count, rating=excluded.rating,
             notes=excluded.notes, updated_at=excluded.updated_at`,
        )
        .bind(
          record.id, record.userId, userMediaId, record.episodeId, record.mediaId,
          record.watched ? 1 : 0, record.watchedAt, record.rewatchCount, record.rating, record.notes,
          record.createdAt, record.updatedAt,
        )
        .run();
    }
    return (await this.findEpisodeActivity(record.userId, record.episodeId))!;
  }

  async updateUserMediaDetailProgress(userId: string, mediaId: string, value: number | null, total: number | null, unit: string | null, platform: string | null, startedAt: string | null, purchaseLibrary: string | null, now: string) {
    await this.db.prepare("UPDATE user_media SET progress_value = ?, progress_total = ?, progress_unit = ?, platform = ?, started_at = ?, purchase_library = ?, updated_at = ? WHERE user_id = ? AND media_id = ?")
      .bind(value, total, unit, platform, startedAt, purchaseLibrary, now, userId, mediaId).run();
    return this.findUserMedia(userId, mediaId);
  }

  async upsertEpisodeActivities(records: EpisodeActivityRecord[]) {
    if (records.length === 0) return;
    try {
      await this.db.batch(records.map((record) => this.db.prepare(
        `INSERT INTO episode_activity
           (id, user_id, episode_id, media_id, watched, watched_at, rewatch_count, rating, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, episode_id) DO UPDATE SET
           watched = excluded.watched, watched_at = excluded.watched_at,
           rewatch_count = excluded.rewatch_count, rating = excluded.rating,
           notes = excluded.notes, updated_at = excluded.updated_at`,
      ).bind(record.id, record.userId, record.episodeId, record.mediaId, record.watched ? 1 : 0, record.watchedAt, record.rewatchCount, record.rating, record.notes, record.createdAt, record.updatedAt)));
    } catch {
      for (const record of records) {
        await this.upsertEpisodeActivity(record);
      }
    }
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
          "INSERT INTO activity_events (id, user_id, event_type, media_id, episode_id, data_json, occurred_at, created_at) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(event.id, event.userId, event.type, event.mediaId, event.episodeId, event.dataJson, event.createdAt, event.createdAt)
        .run();
    } catch {
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
}

// ─────────────────────────────────────────────────────────────
// Row mappers
// ─────────────────────────────────────────────────────────────
function mapMediaItem(row: any): MediaItemRecord {
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

function mapEpisode(row: any): EpisodeRecord {
  const title = row.title ?? row.name ?? (row.episode_number != null ? `Episode ${row.episode_number}` : null);
  const overview = row.overview ?? row.synopsis ?? null;
  const stillPath = row.still_path ?? row.still_url ?? null;
  const airDate = row.air_date ?? row.release_date ?? null;
  return {
    id: row.id,
    mediaId: row.media_id,
    seasonId: row.season_id,
    seasonNumber: row.season_number,
    episodeNumber: row.episode_number,
    name: title,
    title: title,
    overview,
    synopsis: overview,
    stillPath,
    stillUrl: stillPath,
    airDate,
    runtimeMinutes: row.runtime_minutes ?? null,
    isSpecial: row.is_special === 1,
    externalId: row.external_id ?? null,
    extendedDataJson: row.extended_data_json ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUserMedia(row: any): UserMediaRecord {
  return {
    id: row.user_media_id ?? row.id,
    userId: row.user_media_user_id ?? row.user_id,
    mediaId: row.user_media_media_id ?? row.media_id,
    status: row.status,
    isFavorite: row.is_favorite === 1,
    rating: row.rating,
    notes: row.notes,
    watchedAt: row.watched_at ?? row.completed_at ?? null,
    rewatchCount: row.rewatch_count ?? 0,
    progressEpisodes: row.progress_episodes ?? 0,
    progressValue: row.progress_value ?? null,
    progressTotal: row.progress_total ?? null,
    progressUnit: row.progress_unit ?? null,
    platform: row.platform ?? null,
    startedAt: row.started_at ?? null,
    purchaseLibrary: row.purchase_library ?? null,
    visibility: row.visibility ?? "private",
    createdAt: row.user_media_created_at ?? row.created_at,
    updatedAt: row.user_media_updated_at ?? row.updated_at,
  };
}

function mapEpisodeActivity(row: any): EpisodeActivityRecord {
  return {
    id: row.id,
    userId: row.user_id,
    episodeId: row.episode_id,
    mediaId: row.media_id,
    watched: row.watched === 1,
    watchedAt: row.watched_at ?? row.last_watched_at ?? null,
    rewatchCount: row.rewatch_count ?? row.watched_count ?? 0,
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

function mapMediaUnit(row: any): MediaUnitRecord {
  return {
    id: row.id,
    mediaId: row.media_id,
    parentId: row.parent_id ?? null,
    kind: row.kind ?? row.unit_kind ?? "chapter",
    position: row.position ?? 1,
    title: row.title ?? "",
    overview: row.overview ?? row.synopsis ?? null,
    imagePath: row.image_path ?? row.image_url ?? null,
    releaseDate: row.release_date ?? null,
    externalId: row.external_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUnitActivity(row: any): UnitActivityRecord {
  return {
    id: row.id,
    userId: row.user_id,
    unitId: row.unit_id,
    mediaId: row.media_id ?? "",
    completed: row.completed === 1 || (row.completed_count != null && row.completed_count > 0),
    completedAt: row.completed_at ?? row.last_completed_at ?? null,
    rating: row.rating,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
