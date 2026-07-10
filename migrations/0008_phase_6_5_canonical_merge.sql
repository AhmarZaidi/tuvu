-- Phase 6.5: canonical merge, source records, and metadata refresh tracking.

CREATE TABLE media_merge_aliases (
  id TEXT PRIMARY KEY,
  source_media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  target_media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'merged' CHECK(status IN ('candidate','merged','rejected')),
  confidence TEXT NOT NULL,
  reason_json TEXT,
  merged_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_media_id)
);

CREATE TABLE media_source_records (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL,
  source_id TEXT,
  raw_title TEXT,
  raw_type TEXT,
  raw_year INTEGER,
  normalized_title TEXT,
  cache_key TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_kind, source_id)
);

CREATE TABLE metadata_refresh_jobs (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE media_metadata_freshness (
  media_id TEXT PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
  details_hydrated_at TEXT,
  episode_guide_hydrated_at TEXT,
  credits_hydrated_at TEXT,
  availability_hydrated_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_media_merge_aliases_target ON media_merge_aliases(target_media_id, status);
CREATE INDEX idx_media_source_records_media ON media_source_records(media_id);
CREATE INDEX idx_media_source_records_norm ON media_source_records(raw_type, normalized_title, raw_year);
CREATE INDEX idx_metadata_refresh_jobs_media ON metadata_refresh_jobs(media_id, status, updated_at);

INSERT OR IGNORE INTO media_source_records (id, media_id, source_kind, source_id, raw_title, raw_type, raw_year, normalized_title, cache_key, raw_json, created_at, updated_at)
SELECT
  'msr_' || id,
  id,
  source,
  source_id,
  title,
  type,
  year,
  lower(trim(title)),
  NULL,
  NULL,
  created_at,
  updated_at
FROM media_items
WHERE source IS NOT NULL;
