import { config } from '../constants/config';

export type HealthStatus = {
  ok: boolean;
  service: string;
  timestamp: string;
};

export type DashboardEntry = {
  mediaId: string;
  type: 'show' | 'movie' | 'anime' | 'game' | 'book';
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  airStatus: string | null;
  releaseDate: string | null;
  year: number | null;
  status: string;
  isFavorite: boolean;
  rating: number | null;
  progressEpisodes: number;
  progressValue: number | null;
  progressTotal: number | null;
  progressUnit: string | null;
  platform: string | null;
  startedAt: string | null;
  purchaseLibrary: string | null;
  updatedAt: string;
  totalRegularEpisodes?: number;
  nextEpisode?: {
    id: string;
    name: string | null;
    seasonNumber: number;
    episodeNumber: number;
    airDate: string | null;
  } | null;
};

export type DashboardSection = {
  id: string;
  label: string;
  entries: DashboardEntry[];
};

export type DashboardResponse = {
  kind: string;
  entries: DashboardEntry[];
  sections: DashboardSection[];
  totalTracked: number;
  statusCounts: Record<string, number>;
  sectionCounts?: Record<string, number>;
  page?: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export type EpisodeWithActivity = {
  id: string;
  mediaId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  overview: string | null;
  stillPath: string | null;
  airDate: string | null;
  runtimeMinutes: number | null;
  isSpecial: boolean;
  activity?: {
    id: string;
    watched: boolean;
    watchedAt: string | null;
    rewatchCount: number;
    rating: number | null;
    notes: string | null;
  } | null;
};

export type TrackableUnit = {
  id: string;
  mediaId: string;
  kind: 'part' | 'chapter' | 'act' | 'mission' | 'quest';
  position: number;
  title: string | null;
  overview: string | null;
  completed?: boolean;
};

export type MediaDetailData = {
  media: {
    id: string;
    type: 'show' | 'movie' | 'anime' | 'game' | 'book';
    title: string;
    originalTitle: string | null;
    tagline: string | null;
    overview: string | null;
    posterPath: string | null;
    backdropPath: string | null;
    airStatus: string | null;
    releaseDate: string | null;
    year: number | null;
    runtimeMinutes: number | null;
    language: string | null;
    country: string | null;
    totalEpisodes: number | null;
    totalSeasons: number | null;
    source: string;
    genres?: string[];
  };
  userMedia?: {
    id: string;
    status: string;
    isFavorite: boolean;
    rating: number | null;
    notes: string | null;
    progressEpisodes: number;
    progressValue: number | null;
    progressTotal: number | null;
    progressUnit: string | null;
    platform: string | null;
  } | null;
};

export type ExploreRow = {
  id: string;
  title: string;
  subtitle: string;
  results: ExploreResult[];
};

export type ExploreResult = {
  id?: string;
  provider: string;
  providerId: string;
  type: 'show' | 'movie' | 'anime' | 'game' | 'book';
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  year: number | null;
  userStatus?: string;
};

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const base = config.getApiBase();
  const url = `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-tuvu-client': 'mobile',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorMsg = `Server error (${response.status})`;
      try {
        const errJson = JSON.parse(errorText);
        if (errJson?.error?.message) {
          errorMsg = errJson.error.message;
        }
      } catch {}
      throw new Error(errorMsg);
    }

    const json = await response.json();
    if (json && typeof json === 'object' && 'data' in json) {
      return json.data as T;
    }
    return json as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Connection to ${base} timed out.`);
    }
    throw err;
  }
}

export const api = {
  async checkHealth(): Promise<HealthStatus> {
    return apiRequest<HealthStatus>('/api/health');
  },

  async getDashboard(kind: string, options: { limit?: number; offset?: number; q?: string } = {}): Promise<DashboardResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    if (options.q) params.set('q', options.q);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<DashboardResponse>(`/api/library/dashboard/${kind}${qs}`);
  },

  async getAllLibrary(params: { type?: string; status?: string; limit?: number; offset?: number } = {}): Promise<{ library: any[] }> {
    const query = new URLSearchParams();
    if (params.type && params.type !== 'all') query.set('type', params.type);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest<{ library: any[] }>(`/api/library${qs}`);
  },

  async getMediaDetails(id: string): Promise<MediaDetailData> {
    return apiRequest<MediaDetailData>(`/api/media/${id}`);
  },

  async getMediaEpisodes(id: string): Promise<{ episodes: EpisodeWithActivity[] }> {
    return apiRequest<{ episodes: EpisodeWithActivity[] }>(`/api/media/${id}/episodes`);
  },

  async getMediaUnits(id: string): Promise<{ units: TrackableUnit[] }> {
    return apiRequest<{ units: TrackableUnit[] }>(`/api/media/${id}/units`);
  },

  async getEpisodeDetails(episodeId: string): Promise<any> {
    return apiRequest<any>(`/api/episodes/${episodeId}`);
  },

  async updateEpisodeActivity(episodeId: string, changes: { watched?: boolean; rating?: number | null; notes?: string | null; rewatchCount?: number }): Promise<any> {
    return apiRequest<any>(`/api/episodes/${episodeId}/activity`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
  },

  async bulkMarkSeason(mediaId: string, seasonNumber: number, watched = true): Promise<any> {
    return apiRequest<any>(`/api/media/${mediaId}/bulk-episodes`, {
      method: 'POST',
      body: JSON.stringify({ seasonNumber, watched }),
    });
  },

  async updateMediaLibrary(mediaId: string, payload: { status?: string; rating?: number | null; isFavorite?: boolean; notes?: string | null }): Promise<any> {
    return apiRequest<any>(`/api/media/${mediaId}/library`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async markMovieWatched(mediaId: string, watched = true, rating?: number | null): Promise<any> {
    return apiRequest<any>(`/api/media/${mediaId}/movie/watched`, {
      method: 'POST',
      body: JSON.stringify({ watched, rating }),
    });
  },

  async addToLibrary(mediaId: string, status: string): Promise<any> {
    return apiRequest<any>('/api/library', {
      method: 'POST',
      body: JSON.stringify({ mediaId, status }),
    });
  },

  async getExploreData(): Promise<{ rows: ExploreRow[] }> {
    return apiRequest<{ rows: ExploreRow[] }>('/api/explore');
  },

  async search(query: string, type?: string): Promise<{ results: DashboardEntry[] }> {
    const queryParams = new URLSearchParams({ q: query });
    if (type) queryParams.append('type', type);
    return apiRequest<{ results: DashboardEntry[] }>(`/api/explore/search?${queryParams.toString()}`);
  },

  async getProfileStats(): Promise<any> {
    return apiRequest<any>('/api/profile/stats');
  },

  async getNavigationSettings(): Promise<{ navigation: { items: string[]; showLabelsMobile?: boolean } }> {
    return apiRequest<{ navigation: { items: string[]; showLabelsMobile?: boolean } }>('/api/settings/navigation');
  },

  async updateNavigationSettings(items: string[], showLabelsMobile = false): Promise<any> {
    return apiRequest<any>('/api/settings/navigation', {
      method: 'PUT',
      body: JSON.stringify({ items, showLabelsMobile }),
    });
  },
};
