-- Phase 6: provider response cache and Explore support.

CREATE TABLE provider_cache (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  response_json TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 200,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attribution_json TEXT,
  UNIQUE(provider, cache_key)
);

CREATE INDEX idx_provider_cache_lookup ON provider_cache(provider, cache_key, expires_at);
CREATE INDEX idx_provider_cache_expires ON provider_cache(expires_at);

CREATE INDEX idx_media_external_ids_lookup ON media_external_ids(source, external_id);
