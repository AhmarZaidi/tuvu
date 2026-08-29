import net from "node:net";
import https from "node:https";

/**
 * In-memory cache for resolved TMDB IP addresses via DNS-over-HTTPS.
 */
let cachedTmdbIps: string[] = [];
let lastDohResolveTime = 0;
const DOH_CACHE_TTL = 1000 * 60 * 15; // 15 minutes

// Known anycast fallback IPs for api.themoviedb.org on AWS CloudFront
const FALLBACK_TMDB_IPS = [
  "3.175.86.37",
  "3.175.86.50",
  "3.175.86.67",
  "3.175.86.103",
  "13.224.245.47",
];

/**
 * Resolve api.themoviedb.org using DNS over HTTPS (Cloudflare or Google DoH)
 * to bypass carrier-level DNS spoofing / hijacking.
 */
export async function resolveTmdbRealIp(): Promise<string> {
  const now = Date.now();
  if (cachedTmdbIps.length > 0 && now - lastDohResolveTime < DOH_CACHE_TTL) {
    return cachedTmdbIps[Math.floor(Math.random() * cachedTmdbIps.length)];
  }

  // 1. Try Cloudflare DoH
  try {
    const cfRes = await fetch("https://cloudflare-dns.com/dns-query?name=api.themoviedb.org&type=A", {
      headers: { "accept": "application/dns-json" },
    });
    if (cfRes.ok) {
      const data = (await cfRes.json()) as { Answer?: Array<{ type: number; data: string }> };
      const ips = (data.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
      if (ips.length > 0) {
        cachedTmdbIps = ips;
        lastDohResolveTime = now;
        return ips[0];
      }
    }
  } catch {}

  // 2. Try Google DoH
  try {
    const gRes = await fetch("https://dns.google/resolve?name=api.themoviedb.org&type=A");
    if (gRes.ok) {
      const data = (await gRes.json()) as { Answer?: Array<{ type: number; data: string }> };
      const ips = (data.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
      if (ips.length > 0) {
        cachedTmdbIps = ips;
        lastDohResolveTime = now;
        return ips[0];
      }
    }
  } catch {}

  // 3. Fallback to known anycast CloudFront IPs
  return FALLBACK_TMDB_IPS[Math.floor(Math.random() * FALLBACK_TMDB_IPS.length)];
}

/**
 * In-process ephemeral TCP relay on localhost.
 * Splits the initial TLS ClientHello packet into two TCP segments (5 bytes + remainder with 10ms gap).
 * Carrier DPI firewalls (like Reliance Jio in India) do not reassemble out-of-order or segmented
 * TCP streams at line rate, completely bypassing the SNI inspection block.
 */
let relayServer: net.Server | null = null;
let relayPort = 0;
let relayStartPromise: Promise<number> | null = null;

export async function getLocalAntiCensorshipRelayPort(): Promise<number> {
  if (relayPort > 0) return relayPort;
  if (relayStartPromise) return relayStartPromise;

  relayStartPromise = new Promise<number>((resolve, reject) => {
    try {
      const server = net.createServer((clientSocket) => {
        resolveTmdbRealIp().then((realIp) => {
          const remoteSocket = net.connect(443, realIp);

          let isFirstPacket = true;
          clientSocket.on("data", (chunk) => {
            if (isFirstPacket && chunk.length > 5) {
              isFirstPacket = false;
              // Split TLS Record header (first 5 bytes) from the handshake payload containing SNI
              const header = chunk.subarray(0, 5);
              const payload = chunk.subarray(5);
              remoteSocket.write(header);
              setTimeout(() => {
                remoteSocket.write(payload);
              }, 10);
            } else {
              remoteSocket.write(chunk);
            }
          });

          remoteSocket.on("data", (chunk) => clientSocket.write(chunk));
          clientSocket.on("error", () => remoteSocket.destroy());
          remoteSocket.on("error", () => clientSocket.destroy());
          clientSocket.on("close", () => remoteSocket.end());
          remoteSocket.on("close", () => clientSocket.end());
        }).catch(() => {
          clientSocket.destroy();
        });
      });

      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as net.AddressInfo;
        relayPort = addr.port;
        relayServer = server;
        resolve(relayPort);
      });

      server.on("error", (err) => {
        relayStartPromise = null;
        reject(err);
      });
    } catch (err) {
      relayStartPromise = null;
      reject(err);
    }
  });

  return relayStartPromise;
}

/**
 * Execute an HTTPS request to api.themoviedb.org through the local anti-censorship relay.
 */
async function fetchViaRelay(url: URL, init: RequestInit = {}): Promise<Response> {
  const port = await getLocalAntiCensorshipRelayPort();
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});

  return new Promise((resolve, reject) => {
    const req = https.request({
      host: "127.0.0.1",
      port,
      path: url.pathname + url.search,
      method,
      servername: "api.themoviedb.org",
      rejectUnauthorized: true,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "Host": "api.themoviedb.org",
        "Accept": headers.get("Accept") || "application/json",
        "User-Agent": headers.get("User-Agent") || "Tuvu/1.0",
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const bodyBuffer = Buffer.concat(chunks);
        const resHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (v) {
            if (Array.isArray(v)) {
              v.forEach((val) => resHeaders.append(k, val));
            } else {
              resHeaders.set(k, v);
            }
          }
        }
        const webResponse = new Response(bodyBuffer, {
          status: res.statusCode || 200,
          statusText: res.statusMessage || "OK",
          headers: resHeaders,
        });
        resolve(webResponse);
      });
    });

    req.on("error", reject);

    if (init.body) {
      if (typeof init.body === "string") {
        req.write(init.body);
      } else if (Buffer.isBuffer(init.body)) {
        req.write(init.body);
      }
    }
    req.end();
  });
}

/**
 * Resilient TMDB fetcher:
 * 1. Respects any custom TMDB base URL / proxy specified in environment or settings.
 * 2. In local dev, uses the local anti-censorship proxy (port 8792) with ClientHello segmentation to bypass carrier SNI filtering.
 * 3. Falls back to standard fetch if running on edge (or if proxy is unavailable).
 */
export async function resilientTmdbFetch(
  targetUrl: URL,
  init: RequestInit = {},
  customBaseUrl?: string | null
): Promise<Response> {
  // If user or environment has configured a custom proxy endpoint (e.g. Supabase Edge Function or Cloudflare Worker)
  if (customBaseUrl && customBaseUrl.trim()) {
    const base = customBaseUrl.trim().replace(/\/+$/, "");
    const subPath = targetUrl.pathname.startsWith("/3/") ? targetUrl.pathname.slice(3) : targetUrl.pathname;
    const targetEndpoint = base.endsWith("/3") ? `${base}${subPath}${targetUrl.search}` : `${base}${targetUrl.pathname}${targetUrl.search}`;
    return fetch(targetEndpoint, init);
  }

  // 1. Try the local anti-censorship proxy (running on port 8792) in local dev
  try {
    const localProxyUrl = new URL(`http://127.0.0.1:8792${targetUrl.pathname}${targetUrl.search}`);
    const res = await fetch(localProxyUrl.toString(), {
      ...init,
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok || res.status === 401 || res.status === 404) {
      return res;
    }
  } catch {}

  // 2. Try in-process relay if supported
  try {
    return await fetchViaRelay(targetUrl, init);
  } catch {
    // 3. Fallback to native fetch (works on Cloudflare Edge in production)
    return fetch(targetUrl.toString(), init);
  }
}
