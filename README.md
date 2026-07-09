# Tuvu

Tuvu is a personal, Cloudflare-hosted media tracker inspired by TV Time. Phase 0
sets up the static React SPA, Hono Worker API, strict TypeScript, Wrangler
configuration, and project decision records.

## Requirements

- Node.js 22 or newer
- npm 11 or newer
- A Cloudflare account for remote deployment
- Wrangler is installed as a project dev dependency after `npm install`

## Local Setup

```sh
npm install
cp .dev.vars.example .dev.vars
npm run worker:types
```

For Windows PowerShell, copy the vars example with:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

## Development

Run the Vite client only:

```sh
npm run dev
```

Run the Worker with built static assets and `/api/health`:

```sh
npm run dev:worker
```

Then open `http://localhost:8787/api/health`.

## Quality Gates

```sh
npm run typecheck
npm test
npm run build
npm run bundle:report
```

The bundle report is written to `reports/bundle-stats.html`.

## Cloudflare Resources

Create the remote resources before first production deployment:

```sh
npx wrangler d1 create tuvu
npx wrangler r2 bucket create tuvu-user-uploads
```

Replace the placeholder production IDs in `wrangler.jsonc` with the created D1
database ID. Store secrets with Wrangler, never in source control:

```sh
npx wrangler secret put TMDB_API_KEY
```

Provider keys are introduced in later phases, but the variable names are already
documented in [docs/env.md](docs/env.md).

## Architecture Records

- [ADR 0001: Static SPA plus Hono API](docs/adr/0001-static-spa-hono-api.md)
- [ADR 0002: D1 as the Primary Database](docs/adr/0002-d1-primary-database.md)
- [ADR 0003: R2 for User Uploads](docs/adr/0003-r2-user-uploads.md)
- [ADR 0004: TMDB, RAWG, and Open Library Providers](docs/adr/0004-metadata-providers.md)
- [ADR 0005: Passkeys plus OAuth Authentication](docs/adr/0005-passkeys-oauth-auth.md)
