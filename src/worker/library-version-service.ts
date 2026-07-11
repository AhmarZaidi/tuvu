export async function getUserLibraryVersion(db: D1Database | undefined, userId: string): Promise<number> {
  if (!db) return 1;
  try {
    const row = await db.prepare("SELECT version FROM user_library_versions WHERE user_id = ?").bind(userId).first<{ version: number }>();
    if (row?.version) return row.version;

    const now = new Date().toISOString();
    await db.prepare("INSERT OR IGNORE INTO user_library_versions (user_id, version, updated_at) VALUES (?, 1, ?)")
      .bind(userId, now)
      .run();
    return 1;
  } catch (error) {
    console.warn("Library version lookup failed:", error);
    return 1;
  }
}

export async function bumpUserLibraryVersion(db: D1Database | undefined, userId: string): Promise<number | null> {
  if (!db) return null;
  try {
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO user_library_versions (user_id, version, updated_at)
      VALUES (?, 2, ?)
      ON CONFLICT(user_id) DO UPDATE SET version = version + 1, updated_at = excluded.updated_at
    `)
      .bind(userId, now)
      .run();
    return getUserLibraryVersion(db, userId);
  } catch (error) {
    console.warn("Library version bump failed:", error);
    return null;
  }
}
