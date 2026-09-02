// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findWranglerDatabase,
  loadPersonalServerConfig,
  parseDevVars,
} from "../../src/personal-server/config";
import { serveStaticAsset } from "../../src/personal-server/static-assets";

const directories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "tuvu-personal-server-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  directories
    .splice(0)
    .forEach((directory) =>
      rmSync(directory, { recursive: true, force: true }),
    );
});

describe("personal-server configuration", () => {
  it("parses quoted values without exposing comments or blank lines", () => {
    expect(
      parseDevVars(`
# local values
APP_NAME="Tuvu Home"
TOKEN='secret=value'
EMPTY=
`),
    ).toEqual({ APP_NAME: "Tuvu Home", TOKEN: "secret=value", EMPTY: "" });
  });

  it("finds exactly one populated Wrangler D1 database", () => {
    const root = temporaryDirectory();
    const state = join(
      root,
      ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
    );
    mkdirSync(state, { recursive: true });
    writeFileSync(join(state, "metadata.sqlite"), "metadata");
    const database = join(state, "database.sqlite");
    writeFileSync(database, "database");
    expect(findWranglerDatabase(root)).toBe(database);
  });

  it("loads Wrangler vars, secrets, paths, and process overrides", () => {
    const root = temporaryDirectory();
    const state = join(
      root,
      ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
    );
    mkdirSync(state, { recursive: true });
    writeFileSync(join(state, "database.sqlite"), "database");
    mkdirSync(join(root, "dist/client"), { recursive: true });
    mkdirSync(join(root, "migrations"), { recursive: true });
    writeFileSync(join(root, "dist/client/index.html"), "<main>Tuvu</main>");
    writeFileSync(
      join(root, "wrangler.jsonc"),
      JSON.stringify({ vars: { APP_NAME: "Config name" } }),
    );
    writeFileSync(join(root, ".dev.vars"), "APP_NAME=Secret name\nTOKEN=local");

    const config = loadPersonalServerConfig(root, {
      APP_NAME: "Process name",
      TUVU_PORT: "9000",
    });
    expect(config.port).toBe(9000);
    expect(config.workerEnv.APP_NAME).toBe("Process name");
    expect(config.workerEnv.TOKEN).toBe("local");
    expect(config.databasePath).toBe(join(state, "database.sqlite"));
  });

  it("selects a private SQLite path for a fresh installation", () => {
    const root = temporaryDirectory();
    mkdirSync(join(root, "dist/client"), { recursive: true });
    mkdirSync(join(root, "migrations"), { recursive: true });
    writeFileSync(join(root, "dist/client/index.html"), "Tuvu");
    const config = loadPersonalServerConfig(root, {});
    expect(config.databasePath).toBe(
      join(root, ".tuvu-runtime", "tuvu.sqlite"),
    );
  });
});

describe("personal-server static assets", () => {
  it("serves files and falls back to the SPA entry point", async () => {
    const root = temporaryDirectory();
    mkdirSync(join(root, "assets"), { recursive: true });
    writeFileSync(join(root, "index.html"), '<div id="root"></div>');
    writeFileSync(join(root, "assets/app.js"), "console.log('Tuvu')");

    const asset = serveStaticAsset(
      new Request("http://localhost/assets/app.js"),
      root,
    );
    expect(asset.headers.get("cache-control")).toContain("immutable");
    await expect(asset.text()).resolves.toContain("Tuvu");

    const fallback = serveStaticAsset(
      new Request("http://localhost/library/show/1"),
      root,
    );
    await expect(fallback.text()).resolves.toContain('id="root"');
  });

  it("rejects traversal outside the asset root", () => {
    const root = temporaryDirectory();
    writeFileSync(join(root, "index.html"), "Tuvu");
    const response = serveStaticAsset(
      new Request("http://localhost/%2e%2e%5cprivate.txt"),
      root,
    );
    expect(response.status).toBe(400);
  });
});
