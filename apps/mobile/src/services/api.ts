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
      throw new Error(`Connection to ${base} timed out. Ensure the backend server is running.`);
    }
    throw err;
  }
}

export const api = {
  async checkHealth(): Promise<HealthStatus> {
    return apiRequest<HealthStatus>('/api/health');
  },

  async getDashboard(kind: 'shows' | 'movies' | 'anime'): Promise<DashboardResponse> {
    return apiRequest<DashboardResponse>(`/api/library/dashboard/${kind}`);
  },

  async getMediaDetails(id: string): Promise<any> {
    return apiRequest<any>(`/api/media/${id}`);
  },

  async getExploreData(): Promise<any> {
    return apiRequest<any>('/api/explore');
  },

  async search(query: string, type?: string): Promise<{ results: DashboardEntry[] }> {
    const queryParams = new URLSearchParams({ q: query });
    if (type) queryParams.append('type', type);
    return apiRequest<{ results: DashboardEntry[] }>(`/api/explore/search?${queryParams.toString()}`);
  },

  async getProfileStats(): Promise<any> {
    return apiRequest<any>('/api/profile/stats');
  },
};
