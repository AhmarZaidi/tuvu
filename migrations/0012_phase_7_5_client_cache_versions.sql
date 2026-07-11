CREATE TABLE IF NOT EXISTS user_library_versions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO user_library_versions (user_id, version, updated_at)
SELECT id, 1, COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
FROM users;
