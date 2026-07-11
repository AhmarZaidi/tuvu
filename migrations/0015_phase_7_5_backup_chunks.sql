CREATE TABLE IF NOT EXISTS user_backup_chunks (
  id TEXT PRIMARY KEY,
  backup_id TEXT NOT NULL REFERENCES user_backups(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  payload_chunk TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(backup_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_user_backup_chunks_backup ON user_backup_chunks(backup_id, chunk_index);
