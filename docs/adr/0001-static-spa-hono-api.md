# ADR 0001: Static SPA plus Hono API

## Status

Accepted

## Context

Tuvu is a personal media tracker that should be fast, inexpensive to operate,
and friendly to Cloudflare Workers limits. The UI is mostly authenticated app
state and does not require server-side rendering for normal navigation.

## Decision

Serve a Vite-built React SPA through Workers Static Assets and route `/api/*`
through a small Hono Worker. Configure Static Assets for SPA fallback and run the
Worker first only for API routes.

## Consequences

- The client can use route-level code splitting later without server rendering.
- API code stays small and bounded.
- SEO for deep app pages is not a v1 priority.
- Auth, import, and metadata secrets remain on the Worker side.
