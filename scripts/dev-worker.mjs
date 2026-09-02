import { spawn } from "node:child_process";

const lan = process.argv.includes("--lan");
const port = 8787;
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

console.log("[Tuvu Dev] Starting TMDB Anti-Censorship Proxy...");
const proxy = spawn(process.execPath, ["scripts/tmdb-proxy.mjs"], {
  stdio: "inherit",
});

console.log("[Tuvu Dev] Starting Wrangler Dev Worker...");
const wranglerArgs = ["dev", "--local", "--port", String(port)];
if (lan) {
  wranglerArgs.push("--ip", "0.0.0.0");
}

const wrangler = spawn(npxCommand, ["wrangler", ...wranglerArgs], {
  stdio: "inherit",
});

function cleanup() {
  try {
    proxy.kill();
    wrangler.kill();
  } catch {}
  process.exit();
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
wrangler.on("exit", (code) => {
  try {
    proxy.kill();
  } catch {}
  process.exit(code ?? 0);
});
