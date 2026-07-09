import type {
  MediaItemRecord,
  SeasonRecord,
  EpisodeRecord,
  UserMediaRecord,
  EpisodeActivityRecord,
  ActivityEventRecord,
  LibraryFilters,
  MediaRepository,
} from "@worker/media-repository";
import type { MediaType } from "@shared/media";

export class MemoryMediaRepository implements MediaRepository {
  private mediaItems = new Map<string, MediaItemRecord>();
  private seasons = new Map<string, SeasonRecord>();
  private episodes = new Map<string, EpisodeRecord>();
  private userMedia = new Map<string, UserMediaRecord>();
  private episodeActivities = new Map<string, EpisodeActivityRecord>();
  private activityEvents: ActivityEventRecord[] = [];

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
