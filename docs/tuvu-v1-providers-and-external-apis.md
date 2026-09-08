# Tuvu V1 providers and external APIs — consolidated handoff

> Status date: 2026-08-29  
> Purpose: portable source of truth for another implementation agent or application.  
> Scope: provider decisions, outbound API architecture, implemented control plane, planned provider registry, compliance constraints, degraded behavior, provenance, caching, tests, and unresolved release gates.

This document consolidates the provider-related decisions currently spread across the Tuvu project plan, ADRs, provider research, runtime code, migrations, contracts, tests, and acceptance evidence. It does not replace those source files inside this repository. When copying the design to another application, preserve the decisions and revalidate the external facts, licenses, quotas, and endpoints before production use.

## 1. How to read this document

Statements are classified as follows:

- **Tuvu decision** — settled product or architecture behavior. Change only through an explicit plan/ADR decision.
- **Implemented** — present in the current Tuvu codebase and backed by tests or acceptance evidence.
- **Researched** — checked against primary provider sources on the stated date, but not necessarily implemented.
- **Planned** — named in the V1 plan but not yet provider-spiked or implemented.
- **Blocked/disabled** — outbound use is prohibited until the stated conditions are satisfied.
- **Unknown/reverify** — must be resolved before enabling the provider in production.

The most important distinction is:

> T05 selected and researched six audiovisual providers. T06 implemented their configuration, credential, health, Ping, caching, circuit, and security control plane. General provider discovery, search, details, normalization, hydration, images, credits, and availability adapters are not yet implemented.

Do not treat a provider’s presence in a registry, settings screen, project plan, or allowlist as evidence that its metadata integration is complete or legally approved.

## 2. Executive inventory

### 2.1 Researched audiovisual providers

| Provider | Product decision | Code may call it? | Seeded runtime state | Implemented today | Intended metadata role |
|---|---|---:|---:|---|---|
| TMDB | Conditionally enabled | Yes | Disabled | Configuration, encrypted credentials, mode, health, bounded Ping | Primary shows, anime, and movies discovery/details/images/credits/external IDs/videos/relations/availability |
| TVmaze | Enabled | Yes | Enabled | Keyless configuration, health, bounded Ping | Show/episode schedules, airstamps, runtimes, networks/web channels, cast/crew, aliases, exact-ID lookup |
| Wikidata/Wikimedia | Enabled for bounded enrichment | Yes | Enabled | Keyless configuration, health, bounded Ping | Exact-ID facts, cross-identifiers, official links, and licensed remote media |
| TheTVDB | Disabled | No | Disabled | Visible disabled definition only; outbound calls forbidden | Manual TVDB ID/fields until project authorization and licensing evidence exist |
| Jikan/MAL-derived | Disabled | No | Disabled | Visible disabled definition only; outbound calls forbidden | Manual MAL ID/fields only; no scraping-derived calls |
| AniList | Disabled | No | Disabled | Visible disabled definition only; outbound calls forbidden | Manual AniList ID/fields only unless written competing-tracker authorization is obtained |

### 2.2 Planned later-domain providers

These are product-plan candidates, not approved or implemented integrations.

| Domain | Candidate providers | Planned role | Current status |
|---|---|---|---|
| Written works | Google Books | Editions, ISBN, pages, preview/sale/access | Planned; dedicated terms/field/fixture spike required |
| Written works | Open Library | Work/Edition/author/subject reconciliation | Planned; low-volume identifying access only |
| Written works/comics | Comic Vine or an approved alternative | Supplemental comics metadata | Candidate only; not a settled enabled provider |
| Games | IGDB via Twitch | Primary identity, releases, platforms, companies, media, age ratings | Planned; credential and commercial/terms review required |
| Games | RAWG | Stores, images, ratings, requirements augment | Planned; key, backlinks, terms, and allowance review required |
| Game estimates | Admin/manual; optional HowLongToBeat-derived adapter | Main story, main-plus-extras, completionist estimates | Manual is authoritative; unofficial automation is explicitly disabled |
| Music | MusicBrainz | Artists, Release Groups, Releases, Recordings, identifiers, relations | Planned; identifying low-rate access |
| Music artwork | Cover Art Archive | MBID-linked artwork metadata and remote references | Planned; per-item copyright remains relevant |
| Music augment | ListenBrainz, TheAudioDB | Optional enrichment | Planned candidate; capability/attribution/terms spike first |
| Lyrics | LRCLIB | Optional on-demand lookup | Planned candidate; client-cache-only and copyright review required |
| Reconciliation | Wikidata, Wikipedia, Wikimedia Commons | Cross-domain IDs, facts, official sites, encyclopedic/media augment | Audiovisual boundary researched; later-domain adapters still require field-specific work |
| News | GDELT, configured Guardian/NewsData/NewsAPI, Google News RSS discovery | Best-effort headline, excerpt, and link results | Planned; each source requires its own production-use review |
| Subtitles | OpenSubtitles | Optional availability metadata | Planned; no subtitle body storage |
| Community/open-source | Consumet, anime-api, AniPlaylist, similar services | Possible metadata capability | Disabled pending proof of lawful, stable, non-scraping operation |
| Reference only | OMDb | No settled role | Appears in project references only; do not infer approval |

## 3. Non-negotiable architecture

### 3.1 Trust boundary

**Tuvu decision:** clients never call metadata providers directly. Web and Android call Tuv’s typed `/api/v1` surface. The Worker owns outbound requests, credential selection, rate control, validation, normalization, provenance, caching, and error translation.

Consequences:

1. Provider credentials never enter browser bundles, Android bundles, client storage, URLs, analytics, logs, or API responses.
2. All outbound URLs are constructed by reviewed adapter code.
3. Runtime configuration may adjust only supported settings inside the adapter’s compiled trust boundary.
4. A new host, protocol, credential audience, parsing contract, or materially different endpoint requires reviewed code and tests.
5. Runtime configuration is not an arbitrary proxy.
6. Only HTTPS is allowed.
7. Redirects must remain inside the approved boundary or be rejected.
8. Responses must meet adapter MIME, schema, and size rules before use.

**Implemented:** `packages/providers/src/index.ts` defines fixed provider hosts, base paths, Ping paths, credential audiences, minimum intervals, concurrency, and a one-MiB declared-response ceiling. `apps/worker/src/providers.ts` enforces the runtime boundary.

### 3.2 Demand-driven growth

**Tuvu decision:** Tuvu does not crawl or mirror entire external catalogs.

- Search checks the local Catalog first.
- If local results are insufficient, it queries only the selected media type’s primary provider.
- Additional provider expansion is explicit and bounded.
- Search results remain temporary **Discovery References**.
- A result enters Catalog promotion/hydration only after the User selects it.
- Background refresh targets tracked, listed, upcoming, or recently viewed records.
- Manual Catalog Candidates remain available whenever automation is unavailable.

### 3.3 Identity and matching

**Tuvu decision:** Tuvu Domain IDs are opaque UUIDv7 values. Provider IDs are namespace-qualified evidence, never primary keys.

- Exact provider IDs and strong cross-provider identifiers may establish or reconcile identity.
- Exact external identity may deduplicate automatically.
- Title similarity, fuzzy scores, and heuristic encyclopedia matches are suggestions only.
- Ambiguous matches require Owner/Admin review.
- Explicit Catalog Selections remain authoritative until deliberately revised.
- Provider refresh may add observations but cannot silently overwrite an Admin-governed selection.
- Manual records begin as private Catalog Candidates and require exact matching or explicit Admin promotion to enter the shared Catalog.

### 3.4 Field-level provider strategy

Each media domain must maintain a field-coverage matrix:

1. Query the primary provider.
2. Enrich missing or stale high-value fields only through exact IDs or other strong identity evidence.
3. Retain competing observations rather than flattening them into unattributed values.
4. Apply provider-specific locale, region, attribution, retention, and redistribution rules.
5. Use a manual value as the last fallback.

Unsupported fields remain nullable/manual; they are not silently removed from product intent.

## 4. Credential and authorization model

### 4.1 Scopes and modes

Credentialed providers retain two separately encrypted scopes even though V1 has one Owner:

- **Instance Credential** — primary application credential.
- **Personal Credential** — private secondary credential owned by the V1 Owner.

The selected **Credential Mode** is:

- `instance` — use only Instance.
- `personal` — use only Personal.
- `automatic` — try Instance first; retry Personal exactly once only when the Instance attempt returns explicit rate-limit or invalid-credential evidence.

Automatic mode must not retry Personal for not-found, restricted content, malformed data, generic temporary failure, timeout, or arbitrary parsing errors.

Keyless providers are runtime-managed but Instance-only. They do not expose a fake Personal credential workflow.

### 4.2 Encryption and secret handling

**Implemented:** provider credentials use versioned AES-GCM encryption with:

- a fresh nonce for every encryption;
- authenticated additional data containing provider, scope, Owner where applicable, and key version;
- a Worker master key supplied as a deployment secret;
- rotation support when the stored key version is no longer current.

Plaintext is write-only:

- save/replace returns only secret-free presence, masked metadata, and update time;
- list and Ping responses never contain plaintext;
- logs and operational telemetry must not include credentials, authorization headers, or secret-bearing URLs;
- credentials are excluded from Owner/User Backup and Full Instance Backup;
- Account Erasure deletes both Personal and Instance credentials.

Replacing or deleting an Instance Credential requires Sensitive Confirmation. Personal credential changes use normal authorization and action-specific confirmation.

### 4.3 V2 boundary

Existing Personal credentials remain private. Before future Users may consume an existing Instance Credential, every provider requires an explicit sharing/terms/privacy review. Do not infer permission from the fact that V1’s sole Owner controls both scopes.

## 5. Runtime provider configuration and API

### 5.1 Current application API surface

All routes require an authenticated Tuvu session; mutations also use the application’s normal CSRF/sensitive-confirmation controls.

| Method and path | Purpose | Important response/security behavior |
|---|---|---|
| `GET /api/v1/providers` | List provider configuration and per-scope health | Secret-free projection only |
| `PATCH /api/v1/admin/providers/{code}` | Change supported runtime settings | May change enabled state, approved base URL, or bounded rate policy; cannot expand adapter trust |
| `POST /api/v1/providers/{code}/credentials/{scope}` | Save or replace credential | Body contains `credential` up to 4,096 characters; plaintext is never returned |
| `DELETE /api/v1/providers/{code}/credentials/{scope}` | Delete credential | Returns updated secret-free provider projection |
| `PUT /api/v1/providers/{code}/mode` | Select `instance`, `personal`, or `automatic` | Keyless/scope invariants still apply |
| `POST /api/v1/providers/{code}/ping/{scope}` | Run bounded scope health validation | Scope may be `instance`, `personal`, or `automatic`; at most two attempts are returned |

The public provider projection contains:

- code, name, code-enabled flag, runtime-enabled flag, and keyless flag;
- approved HTTPS base URL and supported capability labels;
- attribution and documentation URL;
- documented limit display, source URL, and verification timestamp;
- minimum interval and maximum concurrency;
- credential mode;
- secret-free Instance/Personal credential summaries;
- per-scope health/circuit/retry/success/error/latency state;
- configuration version.

Generated types live in `packages/contracts` and `packages/api-client`; clients should use the typed repository/client, never ad hoc `fetch` calls.

### 5.2 Stored runtime model

The Postgres provider control plane uses these conceptual tables:

- `provider_definitions` — registry configuration, capabilities, attribution, documented limits, runtime enablement, rate/cache policies, and version.
- `provider_credentials` — encrypted versioned Instance or Personal credential records.
- `provider_user_preferences` — per-provider credential mode.
- `provider_scope_state` — health, retry, quota/circuit observations, and timestamps per scope.
- `provider_ping_leases` — coalesces concurrent Ping work across isolates/processes.
- `provider_cache_entries` — normalized/cache metadata, validators, freshness, negative state, optional short-lived raw payload, and conflict retention.

RLS is forced. Personal rows are Owner-scoped; Instance rows are accessible only through the intended authenticated/worker policies. The exact schema is in `packages/database/src/schema.ts` and migrations `0006_foundation.sql` and `0007_foundation.sql`.

### 5.3 Health, Ping, circuits, and errors

Provider Health is separate for each credential scope:

- `healthy`
- `rate_limited`
- `invalid`
- `unavailable`
- `degraded`
- `unknown`

Documented limits and observed health must remain visually and structurally separate. A documentation statement is not live quota telemetry. Exact remaining quota is shown only when reliable response headers expose it.

Ping behavior:

- uses the cheapest adapter-defined validation endpoint;
- is cached/rate-limited to at most once per 60 seconds per provider and scope;
- coalesces concurrent attempts with a lease;
- never fans out merely because a Settings page loads;
- uses a five-second upstream deadline;
- returns only normalized attempt state, latency, error code, and optional retry time;
- obeys Automatic mode’s one permitted fallback.

Normalized provider operation errors are:

- `invalid_credentials`
- `rate_limited`
- `not_found`
- `restricted`
- `temporary`
- `malformed`
- `disabled`
- `ambiguous`

`Retry-After` is authoritative when present. Circuits and backoff prevent repeated calls to a failing scope. A provider failure must never make already-saved Catalog or Owner data disappear.

## 6. Caching, retention, provenance, and degraded behavior

### 6.1 Cache layers

- Web uses a bounded non-sensitive IndexedDB cache.
- Android uses SQLite as its offline domain authority plus a bounded native image cache.
- Any edge/shared cache is limited to credential-safe responses and keyed by provider, endpoint/request identity, locale, region, Adult Content Preference, and authorization/credential scope.
- ETag and Last-Modified validators should be used where supported.
- Fresh, stale, and negative cache states are explicit.
- Provider terms can always impose a shorter duration than Tuv’s default.

Seeded audiovisual defaults:

| Provider | Fresh | Stale | Negative | Successful raw payload maximum |
|---|---:|---:|---:|---:|
| TMDB | 6 hours | 7 days | 5 minutes | 7 days, subject to provider rules |
| TVmaze | 6 hours | 7 days | 5 minutes | 7 days, subject to CC BY-SA/provider rules |
| TheTVDB | 6 hours | 7 days | 5 minutes | Disabled; values are dormant defaults only |
| Jikan | 6 hours | 7 days | 5 minutes | Disabled; values are dormant defaults only |
| AniList | 6 hours | 7 days | 5 minutes | Disabled; values are dormant defaults only |
| Wikidata/Wikimedia | 7 days | 30 days | 30 minutes | 7 days, with item-specific licensing |

These are application policies, not permission to exceed a provider’s stricter terms.

### 6.2 Raw and normalized retention

**Tuvu decision:** retain normalized observations with provenance rather than keeping complete provider responses indefinitely.

- Successful raw payloads expire within seven days.
- Raw payloads retained for unresolved identity/metadata conflict expire within 30 days.
- A provider may require shorter retention or prohibit a category entirely.
- Remote artwork is referenced, not mirrored for archival purposes.
- News result bodies are not stored in Postgres or D1.
- Lyrics are not persisted, synchronized, backed up, indexed, or bulk exported.
- Subtitle bodies are not stored.

### 6.3 Required provenance

Every retained provider-derived field or observation needs enough evidence to audit its origin:

- provider code;
- namespace-qualified provider record ID;
- source URL without embedded secrets;
- observation/fetch time;
- locale and region used;
- payload/content hash where appropriate;
- field-level source mapping;
- attribution/license details where required;
- cache/freshness state;
- Catalog Selection or Admin decision if that observation became authoritative.

Provider ratings retain their native scale and vote count. They never populate or overwrite a User Rating.

### 6.4 Refresh cadence

The product-plan default refresh policy is:

- ongoing or near-release entries: every 6 hours;
- other tracked upcoming entries: daily;
- tracked released entries: weekly;
- completed/ended entries: monthly;
- untracked entries: only when viewed and stale;
- availability observations: normally every 30 days, unless provider terms or release proximity require less.

Refresh work is coalesced, bounded, cancelable between provider/Entry batches, and may not invalidate observations already accepted before cancellation.

### 6.5 Degraded behavior

When a provider is disabled, missing credentials, rate-limited, invalid, unavailable, malformed, or ambiguous:

- render local Catalog, library, tracking, settings, and previously saved observations first;
- show a specific normalized status and retry guidance;
- use stale data only when policy allows and label it appropriately;
- offer manual Catalog Candidate/field entry where applicable;
- never silently switch identity based on a fuzzy result;
- never erase a valid existing selection because refresh failed;
- never expose provider secrets while explaining the failure.

## 7. Detailed researched provider decisions

All external facts in this section were checked against primary sources on **2026-08-29**, except where explicitly marked as a repository-era fact requiring revalidation. Provider terms and quotas are unstable; reverify them before production enablement.

### 7.1 TMDB — conditionally enabled primary audiovisual source

**Decision:** adapter code may call TMDB, but runtime enablement requires both a valid application credential and an applicable non-commercial permission basis or written commercial agreement.

**Intended role:** demand-driven shows, anime, and movie search/details; images; credits; external IDs; videos; relations/recommendations; certification/release facts; regional watch-provider availability.

**Authentication:** use an application Bearer Read Access Token where possible; v3 API key is also supported. Credentials remain server-side.

**Approved runtime boundary:** `https://api.themoviedb.org/3`; compiled host `api.themoviedb.org`; Ping `/authentication`; credential audience `api.themoviedb.org`; minimum interval 50 ms; maximum concurrency 2; declared response maximum 1 MiB.

**Representative planned requests:**

```http
GET /3/search/tv?query={q}&include_adult={preference}&language={locale}&page={page}
GET /3/search/movie?query={q}&include_adult={preference}&language={locale}&page={page}
GET /3/find/{externalId}?external_source={namespace}&language={locale}
GET /3/tv/{id}?append_to_response=external_ids,aggregate_credits,content_ratings,images,videos,watch/providers,recommendations
GET /3/movie/{id}?append_to_response=external_ids,credits,release_dates,images,videos,watch/providers,recommendations
```

**Limits and behavior:** TMDB documents an approximate anti-scraping ceiling around 40 requests/second and says limits may change; HTTP `429` is authoritative. The Tuvu gateway is intentionally more conservative.

**Attribution/compliance:** non-commercial API use requires attribution. Commercial use requires a written arrangement. Display the approved TMDB logo and the notice: “This product uses the TMDB API but is not endorsed or certified by TMDB.” Region, image delivery, and cache rules must be honored.

**Manual fallback:** Owner-created Catalog Candidate and manual fields. No credential means no request.

**Release gate:** the repository’s prior interpretation of a six-month cache ceiling and purge-on-termination requirement must be reverified directly with TMDB before production; the Terms page could not be freshly fetched by automated verification on 2026-08-29.

Primary sources:

- <https://developer.themoviedb.org/docs/authentication-application>
- <https://developer.themoviedb.org/docs/rate-limiting>
- <https://developer.themoviedb.org/docs/faq>
- <https://www.themoviedb.org/api-terms-of-use>

### 7.2 TVmaze — enabled keyless show augment

**Decision:** enabled as a keyless Instance provider.

**Intended role:** show and episode schedules, airstamps, runtimes, networks/web channels, cast/crew, aliases, next-episode facts, and exact IMDb/TVDB lookup. It augments rather than replaces the primary cross-media identity strategy.

**Approved runtime boundary:** `https://api.tvmaze.com`; compiled host `api.tvmaze.com`; Ping `/shows/1`; minimum interval 500 ms; maximum concurrency 1; declared response maximum 1 MiB.

**Representative planned requests:**

```http
GET /search/shows?q={q}
GET /lookup/shows?thetvdb={id}
GET /shows/{id}/episodes?specials=1
```

**Limits and caching:** at least 20 calls per 10 seconds per IP; stricter temporary limits may apply. Pause after `429`. API output is cached upstream for 60 minutes. Individual image URLs are immutable and may be cached indefinitely, subject to attribution and content rights.

**License/attribution:** TVmaze data is CC BY-SA. Tuvu must link/credit TVmaze and preserve ShareAlike obligations for adapted/redistributed data.

**Fallback:** nullable/manual fields when absent; ambiguous identities require review.

Primary sources:

- <https://www.tvmaze.com/api>
- <https://www.tvmaze.com/api/plans>

### 7.3 TheTVDB — disabled

**Decision:** no automated outbound calls until a Tuvu project credential and the exact applicable license, retention, attribution, export, and media-rights terms are recorded and approved.

**Dormant compiled boundary:** `https://api4.thetvdb.com/v4`; host `api4.thetvdb.com`; Ping `/user`; credential audience `api4.thetvdb.com`; code-enabled is false.

**Known constraints:** project API key required; an end-user subscriber PIN may apply depending on the approved model. `/login` returns a bearer token documented as lasting one month. Project-specific licensing and direct-link attribution apply. The API license does not itself grant rights to images, trailers, or programming. No stable public numeric quota or sufficiently general retention/export grant has been accepted for Tuvu.

**Fallback:** allow a manual TVDB external ID and manual fields without triggering a request.

**Enablement checklist:**

1. Obtain Tuvu-specific project authorization and credential.
2. Record commercial/non-commercial status and authorized users.
3. Record numeric/request limits and retry headers.
4. Record normalized-data retention, export, and backup permissions.
5. Record mandatory attribution placement.
6. Separately establish image, trailer, and programming rights.
7. Build fixtures, adapter schemas, allowlisted endpoints, failure tests, and a sanitized live smoke.

Primary sources:

- <https://thetvdb.github.io/v4-api/>
- <https://thetvdb.com/api-information>
- <https://thetvdb.com/tos>

### 7.4 Jikan / MyAnimeList-derived API — disabled

**Decision:** no automated calls. Keyless technical accessibility is not permission.

Jikan describes itself as an unofficial API that scrapes MyAnimeList and is unaffiliated with MyAnimeList. That fails Tuv’s no-scraping/upstream-permission gate. An official MAL application would be a separate provider decision and authorization exercise.

**Dormant compiled boundary:** `https://api.jikan.moe/v4`; host `api.jikan.moe`; Ping `/top/anime?limit=1`; code-enabled is false.

Repository research recorded 3 requests/second, 60/minute, and 24-hour upstream caching, but these numbers must be reverified before any reconsideration. They do not alter the disabled decision.

**Fallback:** manual MAL ID and manual anime facts; no request is triggered.

Primary sources:

- <https://github.com/jikan-me/jikan-rest>
- <https://docs.api.jikan.moe/>

### 7.5 AniList — disabled

**Decision:** no calls without specific written authorization for Tuv’s competing-tracker use.

AniList’s public metadata API uses GraphQL POST. Its terms prohibit competing, non-complementary anime/manga tracking services without permission and prohibit backup/data-hoarding patterns. Tuvu is a tracker, so technical accessibility does not permit use.

**Dormant compiled boundary:** `https://graphql.anilist.co`; Ping `/`; code-enabled is false.

**Limits:** nominally 90 requests/minute; current official documentation reports a degraded 30/minute limit and exposes quota headers plus `Retry-After`. This remains operational context only, not enablement.

**Fallback:** manual AniList ID and manual anime facts.

Primary sources:

- <https://docs.anilist.co/guide/graphql/>
- <https://docs.anilist.co/guide/terms-of-use>
- <https://docs.anilist.co/guide/rate-limiting>

### 7.6 Wikidata, Wikipedia, and Wikimedia Commons — enabled bounded enrichment

**Decision:** keyless exact-ID enrichment is enabled. Broad fuzzy scraping is not.

**Intended role:** cross-identifiers, factual/identity fields, official sites, encyclopedic links, and remote media whose exact file license has been checked. Ambiguous title-only matches require Owner review.

**Implemented Ping boundary:** `https://www.wikidata.org/wiki/Special:EntityData`; host `www.wikidata.org`; Ping `/Q42.json`; minimum interval 250 ms; maximum concurrency 1; declared response maximum 1 MiB.

**Representative planned request:**

```http
GET https://www.wikidata.org/wiki/Special:EntityData/{QID}.json
```

**Operational requirements:** use a descriptive, contactable User-Agent; batch exact IDs; use compression; keep concurrency low; use `maxlag` where applicable; honor `Retry-After`; apply exponential backoff.

**Licensing:** Wikidata structured data is CC0. Wikipedia text and Commons media retain page/file-specific licenses and attribution obligations. Never assume “Wikimedia” means every returned asset is freely reusable without checking its source license.

Primary sources:

- <https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy/en>
- <https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines/en>
- <https://www.wikidata.org/wiki/Wikidata:Data_access>
- <https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use/en#7._Licensing_of_Content>

## 8. Planned providers: known constraints, not approval

Facts in this section were checked on 2026-08-29 where a primary source is linked. Every provider still needs a durable field-by-field and legal/technical spike comparable to T05 before its code-enabled flag may become true.

### 8.1 Google Books

- Planned role: Editions/ISBNs, page counts, descriptions, covers, preview/sale/access metadata.
- Public requests use an API key or OAuth token.
- Preview, sale, and access fields are location-dependent; Region must be explicit.
- Do not infer redistribution rights for descriptions/covers from API accessibility.
- Planned pattern: `GET https://www.googleapis.com/books/v1/volumes?q={q|isbn:ISBN}&country={region}&startIndex={offset}&maxResults=20&key={key}`.
- Source: <https://developers.google.com/books/docs/v1/using>

### 8.2 Open Library

- Planned role: Work/Edition/author/subject and ISBN reconciliation.
- Intended for low-volume, human-facing use, not as an unrestricted third-party bulk backend.
- Current guidance: 1 request/second without identification and 3/second with an identifying User-Agent/contact.
- Batch and cache within terms; consider bulk data only through the explicitly published bulk mechanisms.
- Planned patterns: search plus `/works/{workId}/editions.json`.
- Source: <https://openlibrary.org/developers/api>

### 8.3 IGDB via Twitch

- Planned role: primary game identity, releases, platforms, companies, media, age ratings.
- Requires a Twitch application token plus `Client-ID` and Bearer headers.
- Current documented boundary: 4 requests/second and at most 8 open requests.
- A commercial/non-commercial and media-rights review is still required.
- Planned patterns include the Twitch token endpoint and `POST https://api.igdb.com/v4/games`.
- Source: <https://api-docs.igdb.com/>

### 8.4 RAWG

- Planned role: stores, images, ratings, requirements, and other game augmentation.
- Requires an API key.
- Current free-plan advertisement: 20,000 requests/month and required backlinks on pages using the data.
- Exact production plan, attribution, caching, redistribution, and image rights need a dedicated review.
- Source: <https://rawg.io/apidocs>

### 8.5 HowLongToBeat-derived automation

- Tuvu stores provenance-bearing main-story, main-plus-extras, and completionist estimates.
- Admin/manual values are supported and remain the fallback.
- The referenced adapter is unofficial and disabled until a lawful, stable, Worker-compatible request method and acceptable terms are proven.
- Inability to automate it does not block the game milestone.
- Candidate reference: <https://github.com/Berkanktk/HowLongToBeatAPI>

### 8.6 MusicBrainz

- Planned role: primary Person/Organization/Artist identities, Release Groups, Releases, Recordings, credits, identifiers, and relations.
- Automated clients must use an identifying User-Agent with contact information.
- Current public limit is an average maximum of 1 request/second per IP unless separately agreed.
- Source: <https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting>

### 8.7 Cover Art Archive

- Planned role: release/release-group MBID artwork metadata and remote artwork references.
- The API may return metadata and redirects to images; copyright remains specific to the item.
- Tuv’s general rule is to store identity, URL/path, dimensions, language, provenance, attribution, and selection—not mirror general provider artwork.
- Source: <https://musicbrainz.org/doc/Cover_Art_Archive/API>

### 8.8 ListenBrainz and TheAudioDB

- Optional enrichment candidates only.
- Before enablement, record exact capabilities, credential model, permitted application type, attribution, caching/redistribution, quota, and field provenance.
- ListenBrainz reference: <https://listenbrainz.readthedocs.io/>

### 8.9 LRCLIB

- Optional, on-demand lyrics lookup only.
- Keyless, but requests should carry an identifying client header.
- Current guidance requests sequential calls spaced about 200–500 ms and honoring `429`/`Retry-After`.
- Tuvu policy: client cache only; no database persistence, synchronization, backup, search indexing, bulk export, or redistribution until copyright/attribution review permits it.
- Planned pattern: `GET https://lrclib.net/api/get?track_name={track}&artist_name={artist}&album_name={album}&duration={seconds}`.
- Source: <https://lrclib.net/docs>

### 8.10 News sources

**Tuvu decision:** news is best-effort and non-authoritative. Clients request it through the provider gateway. Only headline, short excerpt, publisher, time, and outbound link should be normalized. No full article body enters Postgres, D1, backup, or search. Client cache duration is 1–6 hours.

Candidates:

- GDELT as broad discovery;
- configured Guardian, NewsData, or NewsAPI sources;
- Google News RSS as discovery/fallback, subject to terms.

Known constraints:

- Guardian Open Platform requires a key; its current non-commercial developer tier states 1 request/second and 500 requests/day. Dedicated production-use review is mandatory: <https://open-platform.theguardian.com/access/>.
- NewsAPI’s free Developer plan is for development/testing, not production: <https://newsapi.org/pricing>.
- Do not assume the other candidates share one license or caching model.

Representative GDELT pattern:

```http
GET https://api.gdeltproject.org/api/v2/doc/doc?query={quotedTitle}&mode=ArtList&format=json&maxrecords=20&sort=HybridRel
```

### 8.11 OpenSubtitles

- Optional availability metadata only; do not store subtitle bodies.
- Requires credential, exact terms, attribution, and metadata-only capability review.
- Current official API documentation states 1 request/second.
- Source: <https://ai.opensubtitles.com/docs>

### 8.12 Community/open-source endpoints

Consumet, anime-api, AniPlaylist, and similar endpoints remain disabled until a spike proves:

- the upstream access is authorized;
- it does not scrape or bypass protection;
- service and schema are stable enough for a bounded adapter;
- attribution, retention, redistribution, and commercial-use terms are acceptable;
- Cloudflare Worker use is supported;
- sanitized fixtures and failure cases exist.

An open-source client or keyless endpoint is not automatically a lawful data source.

## 9. Testing and production evidence requirements

### 9.1 Existing evidence

T05 research/smoke evidence:

- TVmaze synthetic search: HTTP 200; JSON array; raw body omitted.
- Wikidata public entity `Q42`, labels only: HTTP 200; expected entity object; raw body omitted.
- TMDB: not called without transient `TUV_T05_TMDB_TOKEN`.
- TheTVDB, Jikan, and AniList: not called because disabled.
- No production credential was committed or retained.

T06 control-plane evidence covers:

- configuration, enable/disable, credential save/replace/delete, mode, health, Ping, circuit/backoff, conditional caching, attribution, and degraded UI;
- both credential scopes and Automatic fallback;
- encryption/AAD, write-only responses, redacted telemetry, SSRF/allowlist rejection, rotation, and secret exclusion;
- keyless Instance-only behavior;
- coalescing, `Retry-After`, negative cache, freshness, and raw-payload retention;
- automated database, Worker, web unit, web E2E, build, secret, binding, fixture, and budget checks;
- a passing local manual Provider Settings journey without cloud deployment.

### 9.2 Required spike evidence for every new provider

Before adding a provider to production, produce a tracked report and machine-readable matrix containing:

1. Provider and exact production endpoint families.
2. Primary official sources and verification date.
3. Application eligibility and commercial/non-commercial constraints.
4. Authentication, credential audiences, token lifetime, and rotation.
5. Numeric/documented quotas, concurrency, headers, `Retry-After`, and observed throttling.
6. Cache headers and permitted cache/retention/export durations.
7. Attribution, license propagation, backlink, branding, and termination/purge duties.
8. Rights for images, trailers, audio, lyrics, subtitles, and article content separately from metadata.
9. Field-by-field coverage including nullable/missing behavior.
10. Locale, language, country, Region, adult-content, and release behavior.
11. Identity keys and exact reconciliation routes.
12. Worker compatibility, redirects, MIME types, size ceilings, and schema limits.
13. Sanitized normalized success, not-found, malformed, rate-limited, invalid-credential, restricted, and ambiguous fixtures.
14. A live smoke that is opt-in, credential-safe, rate-limited, and records no raw response or secret.
15. Explicit result: enabled, conditionally enabled, disabled, or manual fallback.

Production provider calls should normally be fixture-backed in CI. Live tests require an explicit non-production credential and must never run against production implicitly.

## 10. Observability and privacy

Permitted provider telemetry includes:

- request/trace ID;
- route template;
- pseudonymous User ID where necessary;
- status and elapsed/CPU time;
- subrequest count and cache result;
- provider code and credential scope label;
- stable normalized error code;
- job/message ID, circuit state, and retry time.

Never log:

- credentials or authorization headers;
- secret-bearing URLs or full query strings;
- provider raw request/response bodies;
- search text;
- private notes or other private content;
- backup contents.

Operational events should remain first-party and content-minimized. Errors and security/Admin events may be retained at full sampling; high-volume successes may be sampled.

## 11. Implementation map

### Primary decisions and research

- `docs/project_plan.md` — provider strategy, registry, request patterns, milestones, and primary references.
- `docs/acceptance/evidence/T05/provider-research.md` — durable audiovisual legal/technical report.
- `packages/providers/research/audiovisual-provider-matrix.json` — machine-readable T05 decisions.
- `docs/acceptance/T05.md` and `docs/acceptance/evidence/T05/provider-smoke.json` — T05 acceptance/smoke evidence.
- `docs/acceptance/T06.md` and `docs/acceptance/evidence/T06/provider-report.json` — T06 implementation evidence.

### Runtime implementation

- `packages/providers/src/index.ts` — credential vault, runtime definitions, base-URL validation, gateway/Ping behavior.
- `packages/database/src/schema.ts` — provider tables and constraints.
- `packages/database/migrations/0006_foundation.sql` — provider control-plane schema and seeded audiovisual definitions.
- `packages/database/migrations/0007_foundation.sql` — Ping leases and corrected 7/30-day raw retention constraint.
- `apps/worker/src/providers.ts` — runtime service, credential selection, health, caching, circuits, and provider calls.
- `apps/worker/src/app.ts` — authenticated provider routes and authorization behavior.
- `packages/contracts/src/index.ts` — Zod/OpenAPI request/response contracts.
- `packages/api-client/src/index.ts` and `packages/api-client/src/generated.ts` — typed client.
- `apps/web/src/provider-settings.tsx` — Provider Settings UI and degraded behavior.

### Tests and fixtures

- `packages/providers/test/credential-vault.test.ts`
- `apps/worker/test/providers.test.ts`
- `apps/worker/test/provider-routes.test.ts`
- `packages/database/test/providers-migration.test.ts`
- `apps/web/test/provider-settings.test.tsx`
- `apps/web/e2e/provider-settings.spec.ts`
- `packages/test-fixtures/fixtures/providers/audiovisual/`
- `scripts/t05-provider-smoke.ps1`
- `scripts/t06-manual.ps1`

### Directly relevant ADRs

- ADR-0001 — provider data scope follows provider terms.
- ADR-0025 — Catalog growth is demand-driven.
- ADR-0026 — raw provider payloads have short retention.
- ADR-0039 — HowLongToBeat automation is not a V1 dependency.
- ADR-0040 — metadata enrichment is field-aware and identity-linked.
- ADR-0041 — AniList and scraping-derived anime sources remain disabled.
- ADR-0042 — runtime credentials and selectable mode.
- ADR-0043 — runtime configuration cannot expand adapter trust.
- ADR-0044 — documented limits are separate from observed health.
- ADR-0051 — news is client-cached and not persisted.
- ADR-0052 — provider artwork is referenced, not mirrored.
- ADR-0053 — bounded client-first caching.
- ADR-0058 — Discovery blends ranks, not provider scores.
- ADR-0072 — deliberate provider expansion in Search.
- ADR-0074 — bounded multisource pagination.
- ADR-0080 — provider refresh and scheduling behavior.
- ADR-0083 through ADR-0085 — provider/provenance/catalog selection boundaries.
- ADR-0091 — cache and credential-aware response boundaries.
- ADR-0100 — local/ephemeral tests and one production environment.
- ADR-0101 — first-party content-minimized observability.
- ADR-0102 — retention/purge policy.
- ADR-0110 — separate interface locale, Metadata Locale, and Region.
- ADR-0124 — V1 retains Instance and Personal credential scopes.
- ADR-0125 — backups exclude credential plaintext while retaining non-secret configuration/provenance where applicable.

## 12. Transfer checklist for another application

When incorporating these decisions elsewhere:

1. Copy the domain vocabulary: Provider, Provider Credential, Credential Mode, Provider Health, Provider Observation, Discovery Reference, Catalog Candidate, Catalog Selection, Metadata Locale, and Region.
2. Preserve the server-only gateway and compiled allowlist boundary.
3. Preserve exact-ID-first reconciliation and review for fuzzy ambiguity.
4. Preserve field-level provenance and Admin-selected values against refresh overwrite.
5. Keep manual fallback usable when every provider is disabled.
6. Recreate the credential vault with fresh nonces, authenticated context, rotation, and write-only projections.
7. Keep Instance and Personal scopes separate even for one Owner.
8. Rebuild the provider control-plane tests before adding metadata adapters.
9. Treat only TMDB, TVmaze, and bounded Wikidata/Wikimedia as code-permitted audiovisual sources—and TMDB only conditionally.
10. Keep TheTVDB, Jikan/MAL, AniList, HLTB-derived automation, and community scraping endpoints disabled until their specific gates pass.
11. Perform a new dated primary-source spike for every later-domain candidate.
12. Never copy Tuv’s seeded quota/cache values as provider permission; they are conservative runtime policy and can be superseded by stricter terms.
13. Use sanitized fixtures in normal CI and opt-in live smokes only.
14. Record exact attribution placement in UI designs before release.
15. Reverify every provider immediately before production enablement and on a scheduled cadence afterward.

## 13. Remaining unknowns and release blockers

Before production provider ingestion is complete, resolve:

- the deployment’s actual commercial/non-commercial status;
- approved production credentials and exact allowed scopes;
- normalized-field retention, export, backup, and redistribution rights;
- exact attribution placement and ShareAlike/license propagation;
- image, video, trailer, lyrics, subtitle, and article rights independently;
- stable quotas, response-size ceilings, caching, and termination/purge duties;
- field-by-field locale, language, Region, and adult-content support;
- availability source coverage for India and any later regions;
- exact allowlisted endpoints and parsers for each implemented capability;
- credentialed TMDB live smoke evidence;
- sanitized fixtures for the real discovery/details/normalization adapters;
- provider-specific monitoring and re-verification cadence.

If any answer is absent, choose disabled or manual fallback. Do not fill a compliance gap with an assumption.

## 14. Source and verification manifest

### Repository sources inspected

- `docs/project_plan.md`
- all provider-relevant ADRs listed above
- `docs/acceptance/T05.md`
- `docs/acceptance/T06.md`
- `docs/acceptance/evidence/T05/provider-research.md`
- `docs/acceptance/evidence/T05/provider-smoke.json`
- `docs/acceptance/evidence/T06/provider-report.json`
- `packages/providers/research/audiovisual-provider-matrix.json`
- `packages/providers/src/index.ts`
- `packages/database/src/schema.ts`
- `packages/database/migrations/0006_foundation.sql`
- `packages/database/migrations/0007_foundation.sql`
- `packages/contracts/src/index.ts`
- `packages/api-client/src/index.ts`
- `apps/worker/src/providers.ts`
- `apps/worker/src/app.ts`
- provider tests, fixtures, and Provider Settings UI listed in section 11

### External verification

- Verification date: **2026-08-29**.
- Sources: only official provider/project documentation linked in sections 7 and 8.
- Exception: TMDB’s Terms page was not retrievable by the automated verifier, so its repository-recorded detailed cache/termination interpretation remains an explicit pre-production revalidation item.

### Final handoff rule

The broad future registry expresses product intent, not permission or implementation. Only the six audiovisual candidates have durable provider research, and only their runtime control-plane/Ping behavior exists today. An agent implementing the next layer should begin with TMDB/TVmaze/Wikidata discovery-and-normalization tracer bullets, keep every disabled source disabled, and generate new evidence before expanding the provider set.
