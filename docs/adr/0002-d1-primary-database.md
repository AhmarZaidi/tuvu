# ADR 0002: D1 as the Primary Database

## Status

Accepted

## Context

Tuvu needs relational data for users, sessions, media, watched history, imports,
lists, comments, and messages. The deployment target is Cloudflare Workers.

## Decision

Use Cloudflare D1 as the primary database and manage schema changes through
migrations. Keep records normalized enough to preserve TV Time import history
without forcing external metadata to be perfect.

## Consequences

- The app can use in-process Worker bindings rather than a separate database
  network connection.
- Query counts and indexes must be designed carefully in later phases.
- Large import files should be parsed in the browser and committed in bounded
  chunks.
