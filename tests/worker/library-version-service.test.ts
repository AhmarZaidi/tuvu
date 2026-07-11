import { describe, expect, it } from "vitest";
import { bumpUserLibraryVersion, getUserLibraryVersion } from "@worker/library-version-service";

class FakeD1 {
  versions = new Map<string, number>();
  nextUserId: string | null = null;

  prepare(sql: string) {
    const db = this;
    return {
      bind(...values: unknown[]) {
        return {
          async first<T>() {
            if (sql.includes("SELECT version FROM user_library_versions")) {
              const version = db.versions.get(String(values[0]));
              return (version ? { version } : null) as T | null;
            }
            return null as T | null;
          },
          async run() {
            const userId = String(values[0]);
            if (sql.includes("VALUES (?, 2")) {
              db.versions.set(userId, (db.versions.get(userId) ?? 1) + 1);
            } else if (sql.includes("INSERT OR IGNORE")) {
              db.versions.set(userId, db.versions.get(userId) ?? 1);
            }
            return {};
          },
        };
      },
    };
  }
}

describe("library version service", () => {
  it("creates a default version lazily and bumps after mutations", async () => {
    const db = new FakeD1() as unknown as D1Database;

    await expect(getUserLibraryVersion(db, "usr_1")).resolves.toBe(1);
    await expect(bumpUserLibraryVersion(db, "usr_1")).resolves.toBe(2);
    await expect(bumpUserLibraryVersion(db, "usr_1")).resolves.toBe(3);
    await expect(getUserLibraryVersion(db, "usr_1")).resolves.toBe(3);
  });

  it("falls back safely when D1 is unavailable", async () => {
    await expect(getUserLibraryVersion(undefined, "usr_1")).resolves.toBe(1);
    await expect(bumpUserLibraryVersion(undefined, "usr_1")).resolves.toBeNull();
  });
});
