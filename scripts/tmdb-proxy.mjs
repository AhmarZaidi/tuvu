import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

let cachedIps = [];
async function getRealIp() {
  if (cachedIps.length > 0) return cachedIps[Math.floor(Math.random() * cachedIps.length)];
  try {
    const res = await fetch('https://cloudflare-dns.com/dns-query?name=api.themoviedb.org&type=A', {
      headers: { 'accept': 'application/dns-json' }
    });
    const data = await res.json();
    cachedIps = data.Answer.map(a => a.data);
    return cachedIps[0];
  } catch {
    return '3.175.86.37';
  }
}

let relayServer = null;
let relayPort = 0;

async function getRelayPort() {
  if (relayPort > 0) return relayPort;
  const ip = await getRealIp();

  return new Promise((resolve) => {
    relayServer = net.createServer((clientSocket) => {
      const remoteSocket = net.connect(443, ip);

      let isFirst = true;
      clientSocket.on('data', (chunk) => {
        if (isFirst && chunk.length > 5) {
          isFirst = false;
          // Split ClientHello at byte 5 to evade Jio DPI SNI inspection
          const part1 = chunk.subarray(0, 5);
          const part2 = chunk.subarray(5);
          remoteSocket.write(part1);
          setTimeout(() => {
            remoteSocket.write(part2);
          }, 10);
        } else {
          remoteSocket.write(chunk);
        }
      });

      remoteSocket.on('data', (chunk) => clientSocket.write(chunk));
      clientSocket.on('error', () => remoteSocket.destroy());
      remoteSocket.on('error', () => clientSocket.destroy());
      clientSocket.on('close', () => remoteSocket.end());
      remoteSocket.on('close', () => clientSocket.end());
    });

    relayServer.listen(0, '127.0.0.1', () => {
      relayPort = relayServer.address().port;
      resolve(relayPort);
    });
  });
}

const proxyServer = http.createServer(async (req, res) => {
  try {
    const port = await getRelayPort();
    const headers = { ...req.headers };
    delete headers.host;
    headers['Host'] = 'api.themoviedb.org';
    headers['Accept'] = headers['accept'] || 'application/json';
    headers['User-Agent'] = headers['user-agent'] || 'Tuvu/1.0';

    const upstreamReq = https.request({
      host: '127.0.0.1',
      port,
      path: req.url,
      method: req.method,
      servername: 'api.themoviedb.org',
      rejectUnauthorized: true,
      headers,
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 200, upstreamRes.headers);
      upstreamRes.pipe(res);
    });

    upstreamReq.on('error', (err) => {
      console.error('TMDB Upstream Error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, status_message: 'Failed to reach TMDB via anti-censorship relay.' }));
    });

    req.pipe(upstreamReq);
  } catch (err) {
    console.error('TMDB Proxy Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, status_message: 'Internal proxy error.' }));
  }
});

const PROXY_PORT = 8792;
proxyServer.listen(PROXY_PORT, '127.0.0.1', () => {
  console.log(`[Tuvu TMDB Anti-Censorship Proxy] Listening on http://127.0.0.1:${PROXY_PORT}`);
});
