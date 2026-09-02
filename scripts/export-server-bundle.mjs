import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outDir = path.join(projectRoot, "dist-server");
const includeState = !process.argv.includes("--skip-state");
const includeSecrets = !process.argv.includes("--skip-secrets");
const rootLock = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package-lock.json"), "utf8"),
);

console.log("\n========================================");
console.log("  📦 Packaging Tuvu Backend Server Bundle");
console.log("========================================\n");

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 1. Copy backend code
console.log("Copying src/...");
copyRecursive(path.join(projectRoot, "src"), path.join(outDir, "src"));

console.log("Copying migrations/...");
copyRecursive(
  path.join(projectRoot, "migrations"),
  path.join(outDir, "migrations"),
);

console.log("Copying scripts/...");
copyRecursive(path.join(projectRoot, "scripts"), path.join(outDir, "scripts"));

console.log("Copying built client assets...");
copyRecursive(
  path.join(projectRoot, "dist", "client"),
  path.join(outDir, "dist", "client"),
);

console.log("Copying built personal-server runtime...");
copyRecursive(
  path.join(projectRoot, "dist", "server"),
  path.join(outDir, "dist", "server"),
);

// 2. Copy config files
console.log("Copying configuration files...");
for (const configFile of ["wrangler.jsonc", "tsconfig.json"]) {
  const source = path.join(projectRoot, configFile);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, path.join(outDir, configFile));
  }
}
if (includeSecrets && fs.existsSync(path.join(projectRoot, ".dev.vars"))) {
  fs.copyFileSync(
    path.join(projectRoot, ".dev.vars"),
    path.join(outDir, ".dev.vars"),
  );
}
if (
  includeSecrets &&
  fs.existsSync(path.join(projectRoot, ".dev.providers.local"))
) {
  fs.copyFileSync(
    path.join(projectRoot, ".dev.providers.local"),
    path.join(outDir, ".dev.providers.local"),
  );
}
if (fs.existsSync(path.join(projectRoot, ".dev.vars.example"))) {
  fs.copyFileSync(
    path.join(projectRoot, ".dev.vars.example"),
    path.join(outDir, ".dev.vars.example"),
  );
}

// 3. Copy D1 SQLite Database State (Full existing database!)
if (includeState) {
  console.log("Copying local D1 SQLite database state...");
  copyRecursive(
    path.join(projectRoot, ".wrangler"),
    path.join(outDir, ".wrangler"),
  );
} else {
  console.log("Skipping local D1 state (--skip-state).");
}

// 4. Create optimized package.json for backend
const rootPkg = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
);

function lockedVersion(packageName) {
  const version = rootLock.packages?.[`node_modules/${packageName}`]?.version;
  if (!version) {
    throw new Error(
      `Cannot package ${packageName}: no installed version in package-lock.json`,
    );
  }
  return version;
}

const serverDependencies = Object.fromEntries(
  Object.keys(rootPkg.dependencies || {}).map((packageName) => [
    packageName,
    lockedVersion(packageName),
  ]),
);
const wranglerVersion = lockedVersion("wrangler");
const esbuildVersion =
  rootLock.packages?.["node_modules/wrangler/node_modules/esbuild"]?.version ??
  rootLock.packages?.["node_modules/esbuild"]?.version;
const workerdVersion = lockedVersion("workerd");

if (!esbuildVersion) {
  throw new Error(
    "Cannot package Wrangler: esbuild is missing from package-lock.json",
  );
}

const serverPkg = {
  name: "tuvu-server",
  version: rootPkg.version || "1.0.0",
  private: true,
  type: "module",
  engines: {
    node: ">=24",
  },
  scripts: {
    start: "node dist/server/index.mjs",
    server: "node dist/server/index.mjs",
    "server:wrangler": "node scripts/dev-worker.mjs --lan",
  },
  dependencies: serverDependencies,
  devDependencies: {
    wrangler: wranglerVersion,
  },
  allowScripts: {
    [`esbuild@${esbuildVersion}`]: true,
    [`workerd@${workerdVersion}`]: true,
  },
};
fs.writeFileSync(
  path.join(outDir, "package.json"),
  JSON.stringify(serverPkg, null, 2) + "\n",
  "utf8",
);

// 5. Create quick start script for Termux / Linux
const startSh = `#!/usr/bin/env bash
# Tuvu Node/SQLite personal-server launcher.
# Requires Node.js 24 or newer. It does not start Wrangler/workerd.
echo "========================================"
echo "  Starting Tuvu Backend"
echo "========================================"
exec npm run server
`;
fs.writeFileSync(path.join(outDir, "start.sh"), startSh, {
  encoding: "utf8",
  mode: 0o755,
});

// Fail the export locally if a file required to resolve Worker imports is absent.
for (const requiredPath of [
  "tsconfig.json",
  "src/shared/auth.ts",
  "src/shared/constants.ts",
  "src/shared/media.ts",
  "src/worker/index.ts",
  "dist/client/index.html",
  "dist/server/index.mjs",
]) {
  if (!fs.existsSync(path.join(outDir, requiredPath))) {
    throw new Error(`Incomplete server bundle: missing ${requiredPath}`);
  }
}

console.log("\n========================================");
console.log("  ✅ SERVER BUNDLE CREATED SUCCESSFULLY!");
console.log("========================================");
console.log(`  Location: ${outDir}`);
console.log("  Includes:");
console.log(
  `    ${includeState ? "✓" : "–"} Local SQLite D1 state${includeState ? "" : " omitted"}`,
);
console.log(
  `    ${includeSecrets ? "✓" : "–"} Local secrets${includeSecrets ? "" : " omitted"}`,
);
console.log("    ✓ Built client assets");
console.log("    ✓ Node/SQLite personal-server runtime");
console.log("    ✓ TMDB Anti-Censorship Proxy");
console.log("    ✓ Node HTTP server (port 8787 on 0.0.0.0)");
console.log("========================================\n");
