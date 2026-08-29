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
    extendedDataJson?: string | null;
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

export type HydrationProgress = {
  status: 'refreshing' | 'needs_retry' | 'complete' | 'idle';
  totalEpisodes: number;
  hydratedEpisodes: number;
  percent: number;
  queuedJobs: number;
  runningJobs: number;
  failedJobs: number;
  activeJobs: number;
  lastUpdatedAt?: string | null;
};

export type ConflictItem = {
  section: string;
  label: string;
  current: string;
  incoming: string;
};

export type MediaNewsArticle = {
  title: string;
  url: string;
  publishedAt: string;
  sourceName: string;
  excerpt?: string;
  imageUrl?: string;
};

export type ExploreRow = {
  id: string;
  title: string;
  subtitle: string;
  results: ExploreResult[];
};

export type ExploreResult = {
  id?: string;
  mediaId?: string;
  localMediaId?: string | null;
  provider: string;
  providerId: string;
  type: 'show' | 'movie' | 'anime' | 'game' | 'book';
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  year: number | null;
  userStatus?: string;
  alreadyTracked?: boolean;
};

let cachedCsrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  cachedCsrfToken = token;
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const base = config.getApiBase();
  const url = `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'x-tuvu-client': 'mobile',
      ...(options.headers as Record<string, string> || {}),
    };

    if (cachedCsrfToken) {
      headers['x-csrf-token'] = cachedCsrfToken;
    }

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
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

export type MeResponse = {
  user: { id: string; username: string; displayName: string; email: string | null; role: string };
  profile: { bio: string; visibility: string; avatarUrl: string | null; bannerUrl: string | null };
  appearance?: { theme?: 'light' | 'dark' | 'system' };
  libraryVersion: number;
  csrfToken: string;
};

export type ProviderCredentialStatus = {
  id: string | null;
  provider: string;
  name?: string;
  category?: string;
  description?: string;
  keyless?: boolean;
  label: string | null;
  status: string;
  lastValidatedAt: string | null;
  updatedAt: string | null;
  configured: boolean;
  configurationSource?: 'personal' | 'app' | 'keyless' | 'disabled' | 'none';
  connectionStatus?: string | null;
  lastTestedAt?: string | null;
  configuredFields?: string[];
  hasSavedPersonalCredentials?: boolean;
  fields?: Array<{ key: string; label: string; placeholder: string; secure?: boolean }>;
  attribution?: string;
  docUrl?: string;
  appFallback?: {
    configured: boolean;
    message: string;
  };
};

export type ProviderPingResponse = {
  ping: {
    provider: string;
    ok: boolean;
    status: string;
    latencyMs: number;
    message: string;
    scope?: string;
  };
};

export type UserBackup = {
  id: string;
  label: string | null;
  status: string;
  byteSize: number;
  createdAt: string;
  updatedAt: string;
};

export type StorageStats = {
  libraryItems: number;
  userUploads: number;
  userUploadBytes: number;
  globalMediaItems: number;
  backups: number;
  backupBytes: number;
  databaseBytes: number | null;
  supabaseBytes: number | null;
};

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
    return apiRequest<any>(`/api/episodes/media/${mediaId}/seasons/${seasonNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ watched }),
    });
  },

  async triggerMediaRefresh(mediaId: string): Promise<{ queued: boolean; jobId: string }> {
    return apiRequest<{ queued: boolean; jobId: string }>(`/api/merge/${mediaId}/refresh`, {
      method: 'POST',
    });
  },

  async getHydrationStatus(mediaId: string): Promise<{ job: any; progress: HydrationProgress }> {
    return apiRequest<{ job: any; progress: HydrationProgress }>(`/api/merge/${mediaId}/refresh-status`);
  },

  async getMediaConflicts(mediaId: string): Promise<{ conflicts: ConflictItem[] }> {
    return apiRequest<{ conflicts: ConflictItem[] }>(`/api/merge/${mediaId}/conflicts`);
  },

  async resolveMediaConflicts(
    mediaId: string,
    resolutions: Record<string, 'accept' | 'keep'>
  ): Promise<{ resolved: boolean; remainingConflicts: ConflictItem[] }> {
    return apiRequest<{ resolved: boolean; remainingConflicts: ConflictItem[] }>(`/api/merge/${mediaId}/conflicts/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolutions }),
    });
  },

  async getMediaNews(mediaId: string, refresh = false): Promise<{ articles: MediaNewsArticle[]; warning?: string | null }> {
    return apiRequest<{ articles: MediaNewsArticle[]; warning?: string | null }>(`/api/media/${mediaId}/news${refresh ? '?refresh=1' : ''}`);
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

  async addToLibrary(mediaId: string, status?: string): Promise<any> {
    const payload: any = { mediaId };
    if (status) payload.status = status;
    return apiRequest<any>(`/api/library/${mediaId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getExploreData(): Promise<{ rows: ExploreRow[] }> {
    return apiRequest<{ rows: ExploreRow[] }>('/api/explore');
  },

  async getExploreTypeData(type: string): Promise<{ results: ExploreResult[]; rows?: ExploreRow[] }> {
    return apiRequest<{ results: ExploreResult[]; rows?: ExploreRow[] }>(`/api/explore/type/${type}`);
  },

  async addExploreResult(item: any): Promise<{ media: { id: string; type: string }; alreadyTracked: boolean }> {
    return apiRequest<{ media: { id: string; type: string }; alreadyTracked: boolean }>('/api/explore/add', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },

  async search(query: string, type?: string): Promise<{ results: ExploreResult[] }> {
    const queryParams = new URLSearchParams({ q: query });
    if (type && type.trim()) {
      queryParams.append('types', type.trim());
      queryParams.append('type', type.trim());
    }
    return apiRequest<{ results: ExploreResult[] }>(`/api/explore/search?${queryParams.toString()}`);
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

  async getMe(): Promise<MeResponse> {
    const res = await apiRequest<MeResponse>('/api/me');
    if (res?.csrfToken) {
      cachedCsrfToken = res.csrfToken;
    }
    return res;
  },

  async updateProfile(payload: {
    displayName?: string;
    username?: string;
    bio?: string;
    visibility?: string;
    avatarUrl?: string;
    bannerUrl?: string;
  }): Promise<any> {
    return apiRequest<any>('/api/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async uploadProfileMedia(kind: 'avatar' | 'banner', uri: string, mimeType?: string, fileName?: string): Promise<any> {
    const base = config.getApiBase();
    const url = `${base}/api/uploads/profile`;

    const cleanUri = uri.split('?')[0];
    const ext = cleanUri.split('.').pop()?.toLowerCase() || 'jpg';
    const detectedType = mimeType || (
      ext === 'png' ? 'image/png' :
      ext === 'webp' ? 'image/webp' :
      ext === 'gif' ? 'image/gif' :
      'image/jpeg'
    );
    const safeName = fileName || `${kind}.${ext === 'jpeg' ? 'jpg' : ext}`;

    const form = new FormData();
    form.append('kind', kind);
    form.append('file', {
      uri,
      name: safeName,
      type: detectedType,
    } as any);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'x-tuvu-client': 'mobile',
    };
    if (cachedCsrfToken) {
      headers['x-csrf-token'] = cachedCsrfToken;
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      for (const [k, v] of Object.entries(headers)) {
        xhr.setRequestHeader(k, v);
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const json = JSON.parse(xhr.responseText);
            resolve(json?.data ?? json);
          } catch {
            resolve(xhr.responseText);
          }
        } else {
          let msg = `Upload failed (${xhr.status})`;
          try {
            const j = JSON.parse(xhr.responseText);
            if (j?.error?.message) msg = j.error.message;
          } catch {}
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => {
        reject(new Error('Upload network request failed.'));
      };
      xhr.ontimeout = () => {
        reject(new Error('Upload request timed out.'));
      };
      xhr.send(form);
    });
  },

  async removeProfileMedia(kind: 'avatar' | 'banner'): Promise<any> {
    return apiRequest<any>(`/api/uploads/profile/${kind}`, {
      method: 'DELETE',
    });
  },

  async deleteAccount(): Promise<any> {
    return apiRequest<any>('/api/me', {
      method: 'DELETE',
    });
  },

  async logout(): Promise<any> {
    return apiRequest<any>('/api/auth/logout', {
      method: 'POST',
    });
  },

  async getAppearanceSettings(): Promise<{ appearance: { theme: 'light' | 'dark' | 'system'; gradientIntensity?: number } }> {
    return apiRequest<{ appearance: { theme: 'light' | 'dark' | 'system'; gradientIntensity?: number } }>('/api/settings/appearance');
  },

  async updateAppearanceSettings(theme: 'light' | 'dark' | 'system', gradientIntensity?: number): Promise<any> {
    return apiRequest<any>('/api/settings/appearance', {
      method: 'PUT',
      body: JSON.stringify({ theme, ...(gradientIntensity !== undefined ? { gradientIntensity } : {}) }),
    });
  },

  async getProviderSettings(): Promise<{ providers: ProviderCredentialStatus[] }> {
    return apiRequest<{ providers: ProviderCredentialStatus[] }>('/api/settings/providers');
  },

  async updateProviderSettings(provider: string, secrets: Record<string, string>, label = 'Default'): Promise<any> {
    return apiRequest<any>(`/api/settings/providers/${provider}`, {
      method: 'PUT',
      body: JSON.stringify({ label, secrets }),
    });
  },

  async disableProvider(provider: string): Promise<any> {
    return apiRequest<any>(`/api/settings/providers/${provider}`, {
      method: 'DELETE',
    });
  },

  async pingProvider(provider: string, scope: 'user' | 'app' = 'user'): Promise<ProviderPingResponse> {
    return apiRequest<ProviderPingResponse>(`/api/settings/providers/${provider}/ping?scope=${scope}`, {
      method: 'POST',
      body: JSON.stringify({ scope }),
    });
  },

  async getBackups(): Promise<{ backups: UserBackup[] }> {
    return apiRequest<{ backups: UserBackup[] }>('/api/settings/backups');
  },

  async createBackup(): Promise<{ backup: UserBackup }> {
    return apiRequest<{ backup: UserBackup }>('/api/settings/backups', {
      method: 'POST',
    });
  },

  async exportBackup(id: string): Promise<{ backup: { id: string; label: string | null; byteSize: number; payload: unknown } }> {
    return apiRequest<{ backup: { id: string; label: string | null; byteSize: number; payload: unknown } }>(`/api/settings/backups/${id}/export`);
  },

  async getStorageSettings(): Promise<{ storage: StorageStats }> {
    return apiRequest<{ storage: StorageStats }>('/api/settings/storage');
  },
};
