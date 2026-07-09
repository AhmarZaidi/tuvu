# Environment Variables

Tuvu keeps deploy-time secrets out of source control. Use `.dev.vars` for local
Worker development and `wrangler secret put` for Cloudflare environments.

## Public/non-secret values

| Name | Required | Description |
| --- | --- | --- |
| `APP_NAME` | Yes | Display name used by the Worker and future emails. |
| `PUBLIC_APP_URL` | Yes | Canonical app URL for callbacks and links. |

## Secrets for Later Phases

| Name | Phase | Description |
| --- | --- | --- |
| `TMDB_API_KEY` | Phase 6 | TMDB metadata API key. |
| `RAWG_API_KEY` | Phase 6 | RAWG games API key. |
| `OPEN_LIBRARY_CONTACT_EMAIL` | Phase 6 | Contact email included in Open Library User-Agent/config. |
| `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` | Phase 2 | OAuth provider credentials. |

Do not commit `.env`, `.dev.vars`, export files, OAuth secrets, API keys, or
Cloudflare resource credentials.
