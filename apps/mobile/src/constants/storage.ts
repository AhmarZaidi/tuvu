import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase | null {
  try {
    if (!db) {
      db = SQLite.openDatabaseSync('tuvu_local.db');
      db.execSync(`
        CREATE TABLE IF NOT EXISTS app_kv (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    }
    return db;
  } catch (e) {
    console.warn('[Storage] SQLite initialization failed:', e);
    return null;
  }
}

export function getStoredServerUrl(): string | null {
  try {
    const database = getDb();
    if (!database) return null;
    const row = database.getFirstSync<{ value: string }>(
      'SELECT value FROM app_kv WHERE key = ?',
      ['server_url']
    );
    return row?.value || null;
  } catch {
    return null;
  }
}

export function saveStoredServerUrl(url: string): void {
  try {
    const database = getDb();
    if (!database) return;
    database.runSync(
      'INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)',
      ['server_url', url]
    );
  } catch (e) {
    console.warn('[Storage] Failed to save server_url:', e);
  }
}
