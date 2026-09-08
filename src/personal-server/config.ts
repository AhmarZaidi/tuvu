import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export type PersonalServerConfig = {
  rootDirectory: string;
  host: string;
  port: number;
  databasePath: string;
  migrationsDirectory: string;
  staticDirectory: string;
  workerEnv: Record<string, string>;
};

export function parseDevVars(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [index, sourceLine] of contents.split(/\r?\n/).entries()) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) {
      throw new Error(`Invalid environment assignment on line ${index + 1}`);
    }
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid environment key on line ${index + 1}: ${key}`);
    }
    let value = line.slice(separator + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
      }
    }
    values[key] = value;
  }
  return values;
}

function resolveFrom(rootDirectory: string, configuredPath: string) {
  return isAbsolute(configuredPath)
    ? configuredPath
    : resolve(rootDirectory, configuredPath);
}

export function findWranglerDatabase(rootDirectory: string) {
  const directory = join(
    rootDirectory,
    ".wrangler",
    "state",
    "v3",
    "d1",
    "miniflare-D1DatabaseObject",
  );
  if (!existsSync(directory)) return null;

  const candidates = readdirSync(directory)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => join(directory, name))
    .filter((path) => statSync(path).isFile());

  const [databasePath] = candidates;
  if (candidates.length === 0) return null;
  if (candidates.length !== 1 || !databasePath) {
    throw new Error(
      `Expected one D1 SQLite database in ${directory}, found ${candidates.length}. Set TUVU_DATABASE_PATH to the intended file.`,
    );
  }
  return databasePath;
}

function readWranglerVars(rootDirectory: string) {
  const configPath = join(rootDirectory, "wrangler.jsonc");
  if (!existsSync(configPath)) return {};
  let parsed: { vars?: Record<string, unknown> };
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(
      `The personal-server runtime requires wrangler.jsonc to be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return Object.fromEntries(
    Object.entries(parsed.vars ?? {}).map(([key, value]) => [
      key,
      String(value),
    ]),
  );
}

function parsePort(value: string | undefined) {
  const port = Number(value ?? "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid TUVU_PORT: ${value}`);
  }
  return port;
}

export function loadPersonalServerConfig(
  rootDirectory = process.cwd(),
  processEnv: Readonly<Record<string, string | undefined>> = process.env,
): PersonalServerConfig {
  const root = resolve(rootDirectory);
  const host = processEnv.TUVU_HOST || "0.0.0.0";
  const port = parsePort(processEnv.TUVU_PORT);
  const envFile = resolveFrom(root, processEnv.TUVU_ENV_FILE || ".dev.vars");
  const devVars = existsSync(envFile)
    ? parseDevVars(readFileSync(envFile, "utf8"))
    : {};
  const workerEnv = {
    ...readWranglerVars(root),
    ...devVars,
  };
  for (const key of Object.keys(workerEnv)) {
    const override = processEnv[key];
    if (override !== undefined) workerEnv[key] = override;
  }
  workerEnv.ENVIRONMENT ||= "development";
  workerEnv.APP_NAME ||= "Tuvu";
  workerEnv.PUBLIC_APP_URL ||=
    host === "0.0.0.0" ? `http://127.0.0.1:${port}` : `http://${host}:${port}`;

  const databasePath = processEnv.TUVU_DATABASE_PATH
    ? resolveFrom(root, processEnv.TUVU_DATABASE_PATH)
    : findWranglerDatabase(root) ||
      resolve(root, ".tuvu-runtime", "tuvu.sqlite");
  if (existsSync(databasePath) && !statSync(databasePath).isFile()) {
    throw new Error(`SQLite database not found: ${databasePath}`);
  }
  mkdirSync(dirname(databasePath), { recursive: true });

  const migrationsDirectory = resolveFrom(
    root,
    processEnv.TUVU_MIGRATIONS_DIR || "migrations",
  );
  if (!existsSync(migrationsDirectory)) {
    throw new Error(`Migrations directory not found: ${migrationsDirectory}`);
  }

  const staticDirectory = resolveFrom(
    root,
    processEnv.TUVU_STATIC_DIR || join("dist", "client"),
  );
  if (!existsSync(join(staticDirectory, "index.html"))) {
    throw new Error(
      `Built client not found: ${join(staticDirectory, "index.html")}`,
    );
  }

  return {
    rootDirectory: root,
    host,
    port,
    databasePath,
    migrationsDirectory,
    staticDirectory,
    workerEnv,
  };
}
