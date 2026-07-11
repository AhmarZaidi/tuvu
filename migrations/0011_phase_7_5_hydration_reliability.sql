-- Phase 7.5.3: richer hydration job states and user-scoped provider credential shell.

CREATE TABLE metadata_refresh_jobs_next (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','failed','paused','stale')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  context_json TEXT
);

INSERT INTO metadata_refresh_jobs_next (id, media_id, provider, scope, status, attempts, last_error, created_at, updated_at, context_json)
SELECT id, media_id, provider, scope, status, attempts, last_error, created_at, updated_at, context_json
FROM metadata_refresh_jobs;

DROP TABLE metadata_refresh_jobs;
ALTER TABLE metadata_refresh_jobs_next RENAME TO metadata_refresh_jobs;

CREATE INDEX idx_metadata_refresh_jobs_media ON metadata_refresh_jobs(media_id, status, updated_at);
CREATE INDEX idx_metadata_refresh_jobs_queue ON metadata_refresh_jobs(status, created_at);

CREATE TABLE user_provider_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  label TEXT,
  encrypted_secret_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled','invalid')),
  last_validated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, provider, label)
);
