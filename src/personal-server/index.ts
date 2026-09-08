import { createPersonalServer, listeningUrls } from "./server";

const runtime = createPersonalServer();

async function shutdown(signal: string) {
  console.log(`[Tuvu Personal Server] Received ${signal}; shutting down...`);
  await runtime.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await runtime.listen();
console.log(`[Tuvu Personal Server] Database: ${runtime.config.databasePath}`);
console.log("[Tuvu Personal Server] Ready:");
for (const url of listeningUrls(runtime.config)) console.log(`  ${url}`);
