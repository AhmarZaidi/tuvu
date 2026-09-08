import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { networkInterfaces } from "node:os";
import { Readable } from "node:stream";
import type { ExecutionContext as HonoExecutionContext } from "hono";
import { createTmdbProxy } from "../../scripts/tmdb-proxy.mjs";
import { createApp } from "../worker/app";
import { loadPersonalServerConfig, type PersonalServerConfig } from "./config";
import { NodeD1Database } from "./d1-adapter";
import { applyPendingMigrations } from "./migrations";
import { serveStaticAsset } from "./static-assets";

type NodeRequestInit = RequestInit & { duplex?: "half" };

class PersonalExecutionContext implements HonoExecutionContext {
  private readonly pending = new Set<Promise<unknown>>();
  readonly props = {};

  waitUntil(promise: Promise<unknown>) {
    const tracked = Promise.resolve(promise).finally(() =>
      this.pending.delete(tracked),
    );
    this.pending.add(tracked);
  }

  passThroughOnException() {}

  async drain() {
    await Promise.allSettled(this.pending);
  }
}

function createAssetFetcher(staticDirectory: string): Fetcher {
  return {
    fetch(input, init) {
      return Promise.resolve(
        serveStaticAsset(new Request(input, init), staticDirectory),
      );
    },
    connect() {
      throw new Error("TCP sockets are unavailable through the ASSETS binding");
    },
  };
}

function workerEnv(
  values: Record<string, string>,
  database: NodeD1Database,
  staticDirectory: string,
): Env {
  const environment = values.ENVIRONMENT;
  if (
    environment !== "development" &&
    environment !== "staging" &&
    environment !== "production"
  ) {
    throw new Error(`Invalid ENVIRONMENT: ${environment}`);
  }
  return {
    DB: database,
    ASSETS: createAssetFetcher(staticDirectory),
    ENVIRONMENT: environment,
    PUBLIC_APP_URL: values.PUBLIC_APP_URL || "",
    APP_NAME: values.APP_NAME || "Tuvu",
    TMDB_API_KEY: values.TMDB_API_KEY || "",
    RAWG_API_KEY: values.RAWG_API_KEY || "",
    OPEN_LIBRARY_CONTACT_EMAIL: values.OPEN_LIBRARY_CONTACT_EMAIL || "",
    TWITCH_IGDB_CLIENT_ID: values.TWITCH_IGDB_CLIENT_ID || "",
    TWITCH_IGDB_CLIENT_SECRET: values.TWITCH_IGDB_CLIENT_SECRET || "",
    GOOGLE_BOOKS_API_KEY: values.GOOGLE_BOOKS_API_KEY || "",
    MAL_JIKAN_API_ENDPOINT: values.MAL_JIKAN_API_ENDPOINT || "",
    SUPABASE_URL: values.SUPABASE_URL || "",
    SUPABASE_ANON_KEY: values.SUPABASE_ANON_KEY || "",
    SUPABASE_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY || "",
    SUPABASE_STORAGE_AVATARS_BUCKET:
      values.SUPABASE_STORAGE_AVATARS_BUCKET || "",
    SUPABASE_STORAGE_MEDIA_CACHE_BUCKET:
      values.SUPABASE_STORAGE_MEDIA_CACHE_BUCKET || "",
  };
}

function requestUrl(request: IncomingMessage, config: PersonalServerConfig) {
  const authority = request.headers.host || `127.0.0.1:${config.port}`;
  return new URL(request.url || "/", `http://${authority}`).toString();
}

function webRequest(request: IncomingMessage, config: PersonalServerConfig) {
  const method = request.method || "GET";
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(name, item));
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  const init: NodeRequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }
  return new Request(requestUrl(request, config), init);
}

async function writeResponse(response: Response, output: ServerResponse) {
  output.statusCode = response.status;
  output.statusMessage = response.statusText;
  const getSetCookie = Reflect.get(response.headers, "getSetCookie");
  if (typeof getSetCookie === "function") {
    const cookies = Reflect.apply(
      getSetCookie,
      response.headers,
      [],
    ) as string[];
    if (cookies.length > 0) output.setHeader("Set-Cookie", cookies);
  }
  response.headers.forEach((value, name) => {
    if (name.toLowerCase() !== "set-cookie") output.setHeader(name, value);
  });

  if (!response.body) {
    output.end();
    return;
  }
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output.write(Buffer.from(value));
  }
  output.end();
}

export function createPersonalServer(config = loadPersonalServerConfig()) {
  const database = new NodeD1Database(config.databasePath);
  const env = workerEnv(config.workerEnv, database, config.staticDirectory);
  const app = createApp();
  const tmdbProxy = createTmdbProxy();
  const server = createServer(async (request, response) => {
    try {
      const input = webRequest(request, config);
      if (!new URL(input.url).pathname.startsWith("/api/")) {
        await writeResponse(
          serveStaticAsset(input, config.staticDirectory),
          response,
        );
        return;
      }
      const context = new PersonalExecutionContext();
      const result = await app.fetch(input, env, context);
      await writeResponse(result, response);
      void context.drain().catch((error) => {
        console.error(
          JSON.stringify({
            message: "personal-server background task failed",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "personal-server request failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "application/json" });
      }
      response.end(JSON.stringify({ error: "Internal server error" }));
    }
  });

  return {
    config,
    database,
    server,
    async listen() {
      const applied = await applyPendingMigrations(
        database,
        config.migrationsDirectory,
      );
      if (applied.length > 0) {
        console.log(
          `[Tuvu Personal Server] Applied migrations: ${applied.join(", ")}`,
        );
      }
      await tmdbProxy.listen();
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(config.port, config.host, () => {
            server.off("error", reject);
            resolve();
          });
        });
      } catch (error) {
        await tmdbProxy.close();
        throw error;
      }
    },
    async close() {
      try {
        if (server.listening) {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeAllConnections();
          });
        }
        await tmdbProxy.close();
      } finally {
        database.close();
      }
    },
  };
}

export function listeningUrls(config: PersonalServerConfig) {
  const urls = new Set<string>();
  urls.add(`http://127.0.0.1:${config.port}`);
  if (config.host === "0.0.0.0" || config.host === "::") {
    for (const entries of Object.values(networkInterfaces())) {
      for (const address of entries ?? []) {
        if (address.family === "IPv4" && !address.internal) {
          urls.add(`http://${address.address}:${config.port}`);
        }
      }
    }
  } else {
    urls.add(`http://${config.host}:${config.port}`);
  }
  return [...urls];
}
