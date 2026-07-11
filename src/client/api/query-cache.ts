export type QueryScope = "dashboard" | "media-detail" | "explore-rows" | "explore-search" | "profile" | "settings";
type QueryKeyValue = string | number | boolean | null | undefined;
export type QueryKeyParts = readonly [QueryScope, ...QueryKeyValue[]];

type QueryCacheRecord<T> = {
  value: T;
  savedAt: number;
  ttlMs: number;
};

type QueryCacheOptions = {
  ttlMs: number;
  persist?: boolean;
};

const storagePrefix = "tuvu-query:";

export const queryKeys = {
  dashboard: (userId: string, version: number, kind: string): QueryKeyParts => ["dashboard", userId, version, kind],
  mediaDetail: (userId: string, version: number, mediaId: string): QueryKeyParts => ["media-detail", userId, version, mediaId],
  exploreRows: (userId: string, version: number): QueryKeyParts => ["explore-rows", userId, version],
  exploreSearch: (userId: string, version: number, query: string, types: readonly string[]): QueryKeyParts => ["explore-search", userId, version, query.toLowerCase(), types.join(",")],
  profile: (userId: string, version: number, username?: string | null): QueryKeyParts => ["profile", userId, version, username ?? "me"],
  settings: (userId: string, version: number): QueryKeyParts => ["settings", userId, version],
} as const;

export class QueryCache {
  private readonly memory = new Map<string, QueryCacheRecord<unknown>>();

  get<T>(parts: QueryKeyParts): T | null {
    const key = queryKey(parts);
    const memory = this.memory.get(key) as QueryCacheRecord<T> | undefined;
    if (memory && !isExpired(memory)) return memory.value;
    if (memory) this.memory.delete(key);

    const stored = readStored<T>(key);
    if (!stored) return null;
    if (isExpired(stored)) {
      removeStored(key);
      return null;
    }
    this.memory.set(key, stored);
    return stored.value;
  }

  set<T>(parts: QueryKeyParts, value: T, options: QueryCacheOptions): void {
    const key = queryKey(parts);
    const record: QueryCacheRecord<T> = { value, savedAt: Date.now(), ttlMs: options.ttlMs };
    this.memory.set(key, record);
    if (options.persist) writeStored(key, record);
  }

  delete(parts: QueryKeyParts): void {
    const key = queryKey(parts);
    this.memory.delete(key);
    removeStored(key);
  }

  invalidatePrefix(parts: QueryKeyParts): void {
    const prefix = queryKey(parts);
    for (const key of [...this.memory.keys()]) {
      if (key === prefix || key.startsWith(`${prefix}|`)) this.memory.delete(key);
    }
    removeStoredPrefix(prefix);
  }

  clear(): void {
    this.memory.clear();
    removeStoredPrefix("");
  }
}

export const queryCache = new QueryCache();

export function queryKey(parts: ReadonlyArray<QueryKeyValue>): string {
  return parts.map((part) => encodeURIComponent(String(part ?? ""))).join("|");
}

function isExpired(record: QueryCacheRecord<unknown>) {
  return Date.now() - record.savedAt > record.ttlMs;
}

function readStored<T>(key: string): QueryCacheRecord<T> | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storagePrefix + key);
    return raw ? JSON.parse(raw) as QueryCacheRecord<T> : null;
  } catch {
    return null;
  }
}

function writeStored<T>(key: string, record: QueryCacheRecord<T>) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storagePrefix + key, JSON.stringify(record));
  } catch {
    // Memory cache still keeps the current navigation smooth when storage is full.
  }
}

function removeStored(key: string) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(storagePrefix + key);
  } catch {}
}

function removeStoredPrefix(prefix: string) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const match = storagePrefix + prefix;
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith(storagePrefix)) continue;
      if (!prefix || key === match || key.startsWith(`${match}|`)) sessionStorage.removeItem(key);
    }
  } catch {}
}
