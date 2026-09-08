// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeD1Database } from "../../src/personal-server/d1-adapter";
import { applyPendingMigrations } from "../../src/personal-server/migrations";

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
});

describe("personal-server migrations", () => {
  it("creates a fresh schema and records each migration once", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tuvu-migrations-"));
    const database = new NodeD1Database(join(directory, "fresh.sqlite"));
    cleanups.push(() => {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    });

    const migrationsDirectory = resolve("migrations");
    const firstRun = await applyPendingMigrations(
      database,
      migrationsDirectory,
    );
    expect(firstRun).toHaveLength(16);
    await expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM media_items")
        .first<number>("count"),
    ).resolves.toBe(0);
    await expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM d1_migrations")
        .first<number>("count"),
    ).resolves.toBe(16);

    await expect(
      applyPendingMigrations(database, migrationsDirectory),
    ).resolves.toEqual([]);
  });
});
