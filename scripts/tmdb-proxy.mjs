import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_TMDB_IP = "3.175.86.37";

export function createTmdbProxy() {
  let cachedIps = [];
  let relayServer;
  let relayPort = 0;
  let proxyServer;
  const relaySockets = new Set();

  async function getRealIp() {
    if (cachedIps.length > 0) {
      return cachedIps[Math.floor(Math.random() * cachedIps.length)];
    }
    try {
      const response = await fetch(
        "https://cloudflare-dns.com/dns-query?name=api.themoviedb.org&type=A",
        { headers: { accept: "application/dns-json" } },
      );
      if (!response.ok)
        throw new Error(`DNS-over-HTTPS returned ${response.status}`);
      const data = await response.json();
      cachedIps = (data.Answer ?? [])
        .map((answer) => answer.data)
        .filter((address) => typeof address === "string");
      return cachedIps[0] ?? DEFAULT_TMDB_IP;
    } catch {
      return DEFAULT_TMDB_IP;
    }
  }

  async function getRelayPort() {
    if (relayPort > 0) return relayPort;
    const ip = await getRealIp();

    await new Promise((resolve, reject) => {
      const candidate = net.createServer((clientSocket) => {
        const remoteSocket = net.connect(443, ip);
        relaySockets.add(clientSocket);
        relaySockets.add(remoteSocket);

        let isFirst = true;
        clientSocket.on("data", (chunk) => {
          if (isFirst && chunk.length > 5) {
            isFirst = false;
            // Split ClientHello at byte 5 to evade Jio DPI SNI inspection.
            remoteSocket.write(chunk.subarray(0, 5));
            setTimeout(() => {
              if (!remoteSocket.destroyed)
                remoteSocket.write(chunk.subarray(5));
            }, 10);
          } else {
            remoteSocket.write(chunk);
          }
        });

        remoteSocket.on("data", (chunk) => clientSocket.write(chunk));
        clientSocket.on("error", () => remoteSocket.destroy());
        remoteSocket.on("error", () => clientSocket.destroy());
        clientSocket.on("close", () => {
          relaySockets.delete(clientSocket);
          remoteSocket.end();
        });
        remoteSocket.on("close", () => {
          relaySockets.delete(remoteSocket);
          clientSocket.end();
        });
      });
      candidate.once("error", reject);
      candidate.listen(0, "127.0.0.1", () => {
        candidate.off("error", reject);
        const address = candidate.address();
        if (!address || typeof address === "string") {
          candidate.close();
          reject(new Error("Could not determine the TMDB relay port"));
          return;
        }
        relayServer = candidate;
        relayPort = address.port;
        resolve();
      });
    });
    return relayPort;
  }

  function buildProxyServer() {
    return http.createServer(async (request, response) => {
      try {
        const port = await getRelayPort();
        const headers = { ...request.headers };
        delete headers.host;
        headers.Host = "api.themoviedb.org";
        headers.Accept = headers.accept || "application/json";
        headers["User-Agent"] = headers["user-agent"] || "Tuvu/1.0";

        const upstreamRequest = https.request(
          {
            host: "127.0.0.1",
            port,
            path: request.url,
            method: request.method,
            servername: "api.themoviedb.org",
            rejectUnauthorized: true,
            headers,
          },
          (upstreamResponse) => {
            response.writeHead(
              upstreamResponse.statusCode || 200,
              upstreamResponse.headers,
            );
            upstreamResponse.pipe(response);
          },
        );

        upstreamRequest.on("error", (error) => {
          console.error("TMDB Upstream Error:", error.message);
          if (!response.headersSent) {
            response.writeHead(502, { "Content-Type": "application/json" });
          }
          response.end(
            JSON.stringify({
              success: false,
              status_message: "Failed to reach TMDB via anti-censorship relay.",
            }),
          );
        });
        request.pipe(upstreamRequest);
      } catch (error) {
        console.error("TMDB Proxy Error:", error);
        if (!response.headersSent) {
          response.writeHead(500, { "Content-Type": "application/json" });
        }
        response.end(
          JSON.stringify({
            success: false,
            status_message: "Internal proxy error.",
          }),
        );
      }
    });
  }

  return {
    async listen(port = 8792, host = "127.0.0.1") {
      if (proxyServer?.listening) return;
      proxyServer = buildProxyServer();
      await new Promise((resolve, reject) => {
        proxyServer.once("error", reject);
        proxyServer.listen(port, host, () => {
          proxyServer.off("error", reject);
          resolve();
        });
      });
      console.log(
        `[Tuvu TMDB Anti-Censorship Proxy] Listening on http://${host}:${port}`,
      );
    },

    async close() {
      for (const socket of relaySockets) socket.destroy();
      relaySockets.clear();

      const servers = [proxyServer, relayServer].filter(
        (server) => server?.listening,
      );
      await Promise.all(
        servers.map(
          (server) =>
            new Promise((resolve, reject) => {
              server.close((error) => (error ? reject(error) : resolve()));
              server.closeAllConnections?.();
            }),
        ),
      );
      proxyServer = undefined;
      relayServer = undefined;
      relayPort = 0;
    },
  };
}

if (
  path.basename(fileURLToPath(import.meta.url)) === "tmdb-proxy.mjs" &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const proxy = createTmdbProxy();
  const shutdown = async () => {
    await proxy.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  await proxy.listen();
}
