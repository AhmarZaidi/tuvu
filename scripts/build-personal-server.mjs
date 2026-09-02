import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outDirectory = path.join(projectRoot, "dist", "server");

fs.rmSync(outDirectory, { recursive: true, force: true });
fs.mkdirSync(outDirectory, { recursive: true });

await build({
  entryPoints: [path.join(projectRoot, "src", "personal-server", "index.ts")],
  outfile: path.join(outDirectory, "index.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  sourcemap: true,
  tsconfig: path.join(projectRoot, "tsconfig.json"),
  logLevel: "info",
});
