import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { NodeD1Database } from "./d1-adapter";

const createLedger = `
  CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )
`;

export async function applyPendingMigrations(
  database: NodeD1Database,
  migrationsDirectory: string,
) {
  await database.exec(createLedger);
  const appliedRows = await database
    .prepare("SELECT name FROM d1_migrations")
    .all<{ name: string }>();
  const applied = new Set(appliedRows.results.map((row) => row.name));
  const pending = readdirSync(migrationsDirectory)
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()
    .filter((name) => !applied.has(name));

  for (const name of pending) {
    const sql = readFileSync(join(migrationsDirectory, name), "utf8");
    await database.exec("BEGIN IMMEDIATE");
    try {
      await database.exec(sql);
      await database
        .prepare("INSERT INTO d1_migrations (name) VALUES (?)")
        .bind(name)
        .run();
      await database.exec("COMMIT");
    } catch (error) {
      await database.exec("ROLLBACK");
      throw new Error(
        `Migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  return pending;
}
