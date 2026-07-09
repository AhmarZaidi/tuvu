# ADR 0003: R2 for User Uploads

## Status

Accepted

## Context

Tuvu needs storage for avatars, profile banners, and possible cached media image
variants. These files do not belong in D1.

## Decision

Use Cloudflare R2 for user-uploaded objects. D1 stores object metadata, owner
relationships, validation status, and public/private visibility.

## Consequences

- Upload APIs must validate file type and size before storing objects.
- Object keys should be generated server-side.
- R2 can later support cached image variants if provider terms allow it.
