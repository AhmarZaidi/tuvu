// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeD1Database } from "../../src/personal-server/d1-adapter";

const cleanups: Array<() => void> = [];

function createDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "tuvu-d1-adapter-"));
  const database = new NodeD1Database(join(directory, "test.sqlite"));
  cleanups.push(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return database;
}

afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
});

describe("NodeD1Database", () => {
  it("supports D1 prepare, bind, run, all, first, and raw operations", async () => {
    const database = createDatabase();
    await database.exec(
      "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
    );

    const inserted = await database
      .prepare("INSERT INTO items (name) VALUES (?)")
      .bind("Sanders")
      .run();
    expect(inserted.meta.changes).toBe(1);
    expect(inserted.meta.changed_db).toBe(true);

    const all = await database
      .prepare("SELECT id, name FROM items ORDER BY id")
      .all<{ id: number; name: string }>();
    expect(all.results).toEqual([{ id: 1, name: "Sanders" }]);

    await expect(
      database.prepare("SELECT name FROM items WHERE id = ?").bind(1).first(),
    ).resolves.toEqual({ name: "Sanders" });
    await expect(
      database
        .prepare("SELECT name FROM items WHERE id = ?")
        .bind(1)
        .first<string>("name"),
    ).resolves.toBe("Sanders");
    await expect(
      database.prepare("SELECT id, name FROM items").raw({ columnNames: true }),
    ).resolves.toEqual([
      ["id", "name"],
      [1, "Sanders"],
    ]);
  });

  it("executes batches atomically", async () => {
    const database = createDatabase();
    await database.exec(
      "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL)",
    );

    await expect(
      database.batch([
        database.prepare("INSERT INTO items (name) VALUES (?)").bind("one"),
        database.prepare("INSERT INTO items (name) VALUES (?)").bind("one"),
      ]),
    ).rejects.toThrow();

    const result = await database
      .prepare("SELECT COUNT(*) AS count FROM items")
      .first<number>("count");
    expect(result).toBe(0);
  });
});
