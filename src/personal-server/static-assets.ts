import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safePath(staticDirectory: string, pathname: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const root = resolve(staticDirectory);
  const candidate = resolve(root, decoded.replace(/^[/\\]+/, ""));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  return candidate;
}

export function serveStaticAsset(request: Request, staticDirectory: string) {
  const url = new URL(request.url);
  const candidate = safePath(staticDirectory, url.pathname);
  if (!candidate) return new Response("Invalid path", { status: 400 });

  const selected =
    existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : resolve(staticDirectory, "index.html");
  const headers = new Headers({
    "Content-Type":
      contentTypes[extname(selected).toLowerCase()] ||
      "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  if (selected.includes(`${sep}assets${sep}`)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    headers.set("Cache-Control", "no-cache");
  }

  return new Response(
    request.method === "HEAD" ? null : readFileSync(selected),
    {
      status: 200,
      headers,
    },
  );
}
