import type {
  MediaItemRecord,
  SeasonRecord,
  EpisodeRecord,
  UserMediaRecord,
  EpisodeActivityRecord,
  ActivityEventRecord,
  MediaUnitRecord,
  UnitActivityRecord,
  LibraryFilters,
  MediaRepository,
} from "@worker/media-repository";
import type { MediaType } from "@shared/media";
import type { DashboardKind } from "@shared/dashboard";

export class MemoryMediaRepository implements MediaRepository {
  private mediaItems = new Map<string, MediaItemRecord>();
  private seasons = new Map<string, SeasonRecord>();
  private episodes = new Map<string, EpisodeRecord>();
  private userMedia = new Map<string, UserMediaRecord>();
  private episodeActivities = new Map<string, EpisodeActivityRecord>();
  private activityEvents: ActivityEventRecord[] = [];
  private mediaUnits = new Map<string, MediaUnitRecord>();
  private unitActivities = new Map<string, UnitActivityRecord>();

  async createMedia(item: MediaItemRecord) {
    this.mediaItems.set(item.id, item);
  }

  async updateMediaPoster(mediaId: string, posterPath: string, now: string) {
    const existing = this.mediaItems.get(mediaId);
    if (existing) {
      this.mediaItems.set(mediaId, { ...existing, posterPath, updatedAt: now });
    }
  }

  async findMediaById(id: string) {
    return this.mediaItems.get(id) ?? null;
  }

  async searchMedia(query: string, type?: MediaType, limit = 20) {
    const lower = query.toLowerCase();
    return [...this.mediaItems.values()]
      .filter((m) => m.title.toLowerCase().includes(lower) && (!type || m.type === type))
      .slice(0, limit);
  }

  // ── Seasons ─────────────────────────────────────────────────
  async createSeason(season: SeasonRecord) {
    this.seasons.set(season.id, season);
  }

  async findSeasonsByMediaId(mediaId: string) {
    return [...this.seasons.values()]
      .filter((s) => s.mediaId === mediaId)
      .sort((a, b) => a.seasonNumber - b.seasonNumber);
  }

  // ── Episodes ─────────────────────────────────────────────────
  async createEpisode(episode: EpisodeRecord) {
    this.episodes.set(episode.id, episode);
  }

  async findEpisodesByMediaId(mediaId: string, seasonNumber?: number) {
    return [...this.episodes.values()]
      .filter((e) => e.mediaId === mediaId && (seasonNumber === undefined || e.seasonNumber === seasonNumber))
      .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
  }

  async findEpisodeById(id: string) {
    return this.episodes.get(id) ?? null;
  }

  // ── User Media ───────────────────────────────────────────────
  private userMediaKey(userId: string, mediaId: string) {
    return `${userId}:${mediaId}`;
  }

  async upsertUserMedia(record: UserMediaRecord) {
    this.userMedia.set(this.userMediaKey(record.userId, record.mediaId), record);
    return record;
  }

  async findUserMedia(userId: string, mediaId: string) {
    return this.userMedia.get(this.userMediaKey(userId, mediaId)) ?? null;
  }

  async findUserLibrary(userId: string, filters: LibraryFilters = {}) {
    let entries = [...this.userMedia.values()].filter((um) => um.userId === userId);

    if (filters.type) {
      const typeFilter = filters.type;
      entries = entries.filter((um) => {
        const media = this.mediaItems.get(um.mediaId);
        return media?.type === typeFilter;
      });
    }
    if (filters.status) {
      entries = entries.filter((um) => um.status === filters.status);
    }
    if (filters.isFavorite !== undefined) {
      entries = entries.filter((um) => um.isFavorite === filters.isFavorite);
    }
    if (filters.cursor) {
      entries = entries.filter((um) => um.createdAt < filters.cursor!);
    }

    entries = entries.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1)).slice(0, filters.limit ?? 50);

    return entries
      .map((um) => {
        const media = this.mediaItems.get(um.mediaId);
        if (!media) return null;
        return { item: um, media };
      })
      .filter((x): x is { item: UserMediaRecord; media: MediaItemRecord } => x !== null);
  }

  async createMediaUnit(unit: MediaUnitRecord) { this.mediaUnits.set(unit.id, unit); }
  async findMediaUnits(mediaId: string) { return [...this.mediaUnits.values()].filter((unit) => unit.mediaId === mediaId).sort((a, b) => (a.parentId ?? "").localeCompare(b.parentId ?? "") || a.position - b.position); }
  async findMediaUnitById(id: string) { return this.mediaUnits.get(id) ?? null; }
  async upsertUnitActivity(activity: UnitActivityRecord) { this.unitActivities.set(`${activity.userId}:${activity.unitId}`, activity); return activity; }
  async findUnitActivity(userId: string, unitId: string) { return this.unitActivities.get(`${userId}:${unitId}`) ?? null; }
  async findUnitActivitiesForMedia(userId: string, mediaId: string) { return [...this.unitActivities.values()].filter((activity) => activity.userId === userId && activity.mediaId === mediaId); }

  async findDashboardEntries(userId: string, kind: DashboardKind, limit: number, offset: number, query?: string | null) {
    const normalizedQuery = query?.trim().toLowerCase();
    const allowedTypes: MediaType[] = kind === "shows" ? ["show", "anime"] : [kind.slice(0, -1) as MediaType];
    const rows = [...this.userMedia.values()]
      .filter((item) => item.userId === userId)
      .map((item) => ({ item, media: this.mediaItems.get(item.mediaId) }))
      .filter((row): row is { item: UserMediaRecord; media: MediaItemRecord } => Boolean(row.media && allowedTypes.includes(row.media.type)))
      .filter((row) => !normalizedQuery || row.media.title.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => b.item.updatedAt.localeCompare(a.item.updatedAt) || a.media.title.localeCompare(b.media.title))
      .slice(offset, offset + limit);

    return rows.map(({ item, media }) => {
      const episodes = [...this.episodes.values()]
        .filter((episode) => episode.mediaId === media.id && !episode.isSpecial)
        .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
      const watched = new Set(
        [...this.episodeActivities.values()]
          .filter((activity) => activity.userId === userId && activity.watched)
          .map((activity) => activity.episodeId),
      );
      const next = episodes.find((episode) => !watched.has(episode.id)) ?? null;
      return {
        mediaId: media.id,
        type: media.type,
        title: media.title,
        overview: media.overview,
        posterPath: media.posterPath,
        backdropPath: media.backdropPath,
        airStatus: media.airStatus,
        releaseDate: media.releaseDate,
        year: media.year,
        status: item.status,
        isFavorite: item.isFavorite,
        rating: item.rating,
        progressEpisodes: item.progressEpisodes,
        progressValue: item.progressValue,
        progressTotal: item.progressTotal,
        progressUnit: item.progressUnit,
        platform: item.platform,
        startedAt: item.startedAt,
        purchaseLibrary: item.purchaseLibrary,
        updatedAt: item.updatedAt,
        totalRegularEpisodes: episodes.length,
        nextEpisode: next
          ? { id: next.id, name: next.name, seasonNumber: next.seasonNumber, episodeNumber: next.episodeNumber, airDate: next.airDate }
          : null,
      };
    });
  }

  async removeUserMedia(userId: string, mediaId: string) {
    this.userMedia.delete(this.userMediaKey(userId, mediaId));
  }

  async updateUserMediaProgress(userId: string, mediaId: string, progressEpisodes: number, now: string) {
    const key = this.userMediaKey(userId, mediaId);
    const existing = this.userMedia.get(key);
    if (existing) {
      this.userMedia.set(key, { ...existing, progressEpisodes, updatedAt: now });
    }
  }

  // ── Episode Activity ─────────────────────────────────────────
  private activityKey(userId: string, episodeId: string) {
    return `${userId}:${episodeId}`;
  }

  async upsertEpisodeActivity(record: EpisodeActivityRecord) {
    this.episodeActivities.set(this.activityKey(record.userId, record.episodeId), record);
    return record;
  }

  async updateUserMediaDetailProgress(userId: string, mediaId: string, value: number | null, total: number | null, unit: string | null, platform: string | null, startedAt: string | null, purchaseLibrary: string | null, now: string) {
    const key = this.userMediaKey(userId, mediaId);
    const existing = this.userMedia.get(key);
    if (!existing) return null;
    const updated = { ...existing, progressValue: value, progressTotal: total, progressUnit: unit, platform, startedAt, purchaseLibrary, updatedAt: now };
    this.userMedia.set(key, updated);
    return updated;
  }

  async upsertEpisodeActivities(records: EpisodeActivityRecord[]) {
    for (const record of records) this.episodeActivities.set(this.activityKey(record.userId, record.episodeId), record);
  }

  async findEpisodeActivity(userId: string, episodeId: string) {
    return this.episodeActivities.get(this.activityKey(userId, episodeId)) ?? null;
  }

  async findEpisodeActivitiesForMedia(userId: string, mediaId: string) {
    return [...this.episodeActivities.values()].filter((a) => a.userId === userId && a.mediaId === mediaId);
  }

  // ── Activity Events ──────────────────────────────────────────
  async createActivityEvent(event: ActivityEventRecord) {
    this.activityEvents.push(event);
  }

  // ── Test Helpers ─────────────────────────────────────────────
  getActivityEvents() {
    return [...this.activityEvents];
  }
}
