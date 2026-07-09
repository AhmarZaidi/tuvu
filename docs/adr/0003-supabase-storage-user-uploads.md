# ADR 0003: Supabase Storage for User Uploads

## Status

Accepted

## Context

Tuvu needs object storage for avatars, profile banners, and optional cached media
image variants. These files do not belong in D1. Cloudflare R2 would fit the
deployment target, but it requires billing setup on the Cloudflare account before
it can be created.

Supabase Storage is usable on the Free plan for this personal app if uploads are
kept small and media-image caching is treated as optional. Current Supabase docs
list 1 GB of Storage Size and 5 GB of Egress on the Free plan, and Storage upload
limits cap Free projects at 50 MB per file.

## Decision

Use Supabase Storage for user-uploaded avatars/banners and optional cached media
image variants. D1 remains the primary application database and stores upload
metadata, ownership, validation status, object path, bucket name, visibility, and
derived public/signed URL hints.

Uploads should be mediated by Tuvu's Worker API in v1. The Worker validates the
authenticated D1 session, checks file type and size, generates object paths, and
uses a server-side Supabase service role key or scoped signed upload flow. The
service role key must never be exposed to the browser.

## Consequences

- No Cloudflare R2 binding is needed in `wrangler.jsonc`.
- Supabase project URL, anon key, and service role key must be configured before
  Phase 2 upload work.
- Avatar uploads should be capped well below Supabase's Free project file limit,
  for example 2 MB; banners should be capped around 5 MB.
- Optional provider image cache should be size-bounded and evictable so the app
  stays under the 1 GB Free storage quota and 5 GB egress quota.
- If image cache traffic grows, prefer provider URLs or revisit R2/paid storage.
