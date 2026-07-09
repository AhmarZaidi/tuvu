# Supabase Storage Setup

Tuvu uses Cloudflare D1 as the primary application database and Supabase Storage
for avatar, banner, and optional cached media image objects.

## Free-Tier Fit

Supabase's current Free plan is acceptable for Tuvu's personal deployment if
uploads are bounded:

- Storage Size: 1 GB included on the Free plan.
- Egress: 5 GB included on the Free plan.
- Free project max file size: 50 MB.
- Storage image transformations are unavailable on the Free plan.

Tuvu should use smaller app-level limits than Supabase's maximum:

- Avatars: 2 MB max.
- Profile banners: 5 MB max.
- Optional media image cache: bounded, evictable, and disabled if it risks the
  storage or egress quota.

## Buckets

Create these buckets in the Supabase dashboard:

| Bucket | Visibility | Purpose |
| --- | --- | --- |
| `tuvu-avatars` | Public or signed-read | User avatar images. |
| `tuvu-media-cache` | Public or signed-read | Optional cached provider image variants. |

For staging, use `tuvu-avatars-staging` and `tuvu-media-cache-staging` if you
want separate objects.

## Variables

Add these to `.dev.vars` locally:

```sh
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_AVATARS_BUCKET=tuvu-avatars
SUPABASE_STORAGE_MEDIA_CACHE_BUCKET=tuvu-media-cache
```

For deployed Workers, store secrets with Wrangler:

```sh
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Bucket names are non-secret and live in `wrangler.jsonc`.

## Security Direction for Phase 2

Phase 2 should keep uploads behind the Worker API:

1. Validate the user's D1-backed session.
2. Validate MIME type, size, and image dimensions.
3. Generate a server-owned object path.
4. Upload to Supabase Storage using server-side credentials or a short-lived
   signed upload URL.
5. Store upload metadata in D1.

Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.
