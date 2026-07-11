CREATE TABLE IF NOT EXISTS user_stats_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_kind TEXT NOT NULL,
  library_version INTEGER NOT NULL,
  total_tracked INTEGER NOT NULL DEFAULT 0,
  status_counts_json TEXT NOT NULL DEFAULT '{}',
  section_counts_json TEXT NOT NULL DEFAULT '{}',
  profile_stats_json TEXT NOT NULL DEFAULT '{}',
  recalculated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, snapshot_kind)
);

CREATE INDEX IF NOT EXISTS idx_user_stats_snapshots_user_kind ON user_stats_snapshots(user_id, snapshot_kind, library_version);

CREATE TABLE IF NOT EXISTS user_backups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'complete' CHECK(status IN ('complete','failed','deleted')),
  payload_json TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_backups_user_created ON user_backups(user_id, created_at DESC);
