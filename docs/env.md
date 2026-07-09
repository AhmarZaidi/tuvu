# Environment Variables

Tuvu keeps deploy-time secrets out of source control. Use `.dev.vars` for local
Worker development and `wrangler secret put` for Cloudflare environments.

## Public/non-secret values

| Name | Required | Description |
| --- | --- | --- |
| `APP_NAME` | Yes | Display name used by the Worker and future emails. |
| `PUBLIC_APP_URL` | Yes | Canonical app URL for callbacks and links. |
| `SUPABASE_STORAGE_AVATARS_BUCKET` | Phase 2 | Supabase Storage bucket for avatars. Suggested: `tuvu-avatars`. |
| `SUPABASE_STORAGE_MEDIA_CACHE_BUCKET` | Phase 6 | Supabase Storage bucket for optional cached media images. Suggested: `tuvu-media-cache`. |

## Secrets for Later Phases

| Name | Phase | Description |
| --- | --- | --- |
| `TMDB_API_KEY` | Phase 6 | TMDB metadata API key. |
| `RAWG_API_KEY` | Phase 6 | RAWG games API key. |
| `OPEN_LIBRARY_CONTACT_EMAIL` | Phase 6 | Contact email included in Open Library User-Agent/config. |
| `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` | Phase 2 | OAuth provider credentials. |
| `SUPABASE_URL` | Phase 2 | Supabase project URL, for example `https://PROJECT_REF.supabase.co`. |
| `SUPABASE_ANON_KEY` | Phase 2 | Supabase publishable/anon key if a signed client upload flow is used. |
| `SUPABASE_SERVICE_ROLE_KEY` | Phase 2 | Server-only Supabase key for Worker-mediated uploads. Never expose this to the browser. |

Do not commit `.env`, `.dev.vars`, export files, OAuth secrets, API keys, or
Cloudflare resource credentials, or Supabase service role keys.
