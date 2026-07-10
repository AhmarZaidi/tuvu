-- Phase 5: TV Time import jobs, audit items, warnings, and rollback ownership.

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'tv_time',
  status TEXT NOT NULL CHECK(status IN ('created','dry_run','uploaded','committing','committed','rolled_back','failed')),
  file_names_json TEXT NOT NULL,
  counts_json TEXT,
  error_message TEXT,
  committed_at TEXT,
  rolled_back_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE import_job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK(item_kind IN ('show','movie')),
  chunk_index INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','committed','skipped','failed')),
  media_id TEXT REFERENCES media_items(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(job_id, item_key)
);

CREATE TABLE import_warnings (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  item_key TEXT,
  severity TEXT NOT NULL CHECK(severity IN ('info','warning','error')),
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE import_created_records (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(job_id, table_name, record_id)
);

CREATE INDEX idx_import_jobs_user ON import_jobs(user_id, created_at DESC);
CREATE INDEX idx_import_items_job ON import_job_items(job_id, chunk_index);
CREATE INDEX idx_import_warnings_job ON import_warnings(job_id, severity);
CREATE INDEX idx_import_created_records_job ON import_created_records(job_id, table_name);
