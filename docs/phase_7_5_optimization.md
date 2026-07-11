# Phase 7.5: Optimization, Consolidation, and Architecture Reset

This document is the working plan for the pre-Phase-8 cleanup. It maps the current app, names the structural problems that are likely to slow future work, and defines a phased optimization plan under `7.5.x`.

The goal is not to remove features. Everything implemented through Phase 7 must continue to work: auth, profile editing, Supabase avatars/banners/covers, manual media creation, TV Time import, merge, provider search, hydration, dashboards, episode/unit tracking, cache behavior, snackbars, mobile/desktop shell, and theme support.

## North Star

- Keep one canonical global media item per real-world media object.
- Keep provider metadata global and reusable.
- Keep tracking, notes, ratings, progress, platform choices, import jobs, and settings user-scoped.
- Prefer local/global database results before provider calls.
- Fetch external metadata only when stale, missing, user-triggered, or needed for import/merge resolution.
- Make each media type first-class in UX while sharing the same underlying primitives where sensible.
- Make UI changes cheap by using design tokens, shared components, and page templates instead of per-page CSS drift.

## Current Code Map

### Client

- `src/client/app.tsx`
  - Main React app, router, auth page, app shell, nav, global search, snackbars, import provider, dashboards, explore, merge, media detail, episode/unit/person pages, settings, import UI, shared components, cache helpers, and API helper.
  - Current risk: too many responsibilities in one 200 KB+ file. This makes UI changes risky and duplicates media-type logic.
- `src/client/styles.css`
  - Global theme styles, shell, nav, modals, dashboards, media detail, import, merge, cards, snackbars, responsive rules.
  - Current risk: colors, spacing, breakpoints, and component variants are mostly hard-coded. Light/system theme has duplicate overrides.
- `src/client/tv-time-parser.ts`
  - Browser parsing for TV Time JSON/CSV/ZIP files using Papa Parse.
- `tests/client/*`
  - Parser and app smoke tests.

### Shared

- `src/shared/media.ts`
  - Media type/status schemas, create/update schemas, episode/unit schemas.
  - Current risk: media type union is static; future types require edits in many places.
- `src/shared/dashboard.ts`
  - Dashboard kinds and section-building logic.
  - Current risk: `shows` still groups `show` plus `anime`, while the product now wants Anime as a separate main page.
- `src/shared/tv-time-import.ts`
  - Import counts and item schemas.
- `src/shared/auth.ts`, `src/shared/api.ts`
  - Auth/profile and health schemas.

### Worker

- `src/worker/app.ts`
  - Hono app, route registration, DB/repository wiring, global API error handler.
- `src/worker/repository.ts`
  - Auth/profile/session/upload repository.
- `src/worker/media-repository.ts`
  - Main D1 media repository and row mappers.
  - Current risk: one repository covers catalog, library, dashboards, episodes, units, and activity. Dashboard SQL contains repeated correlated subqueries.
- `src/worker/library-routes.ts`
  - Library add/remove/status/rating/notes/progress/movie watched/dashboard endpoints.
  - Current risk: stats/count queries are computed on demand and media kind rules are duplicated.
- `src/worker/media-routes.ts`
  - Create media, details, seasons, episodes, units, cover upload.
- `src/worker/episode-routes.ts`, `src/worker/unit-routes.ts`
  - Episode and book/game unit activity.
- `src/worker/import-routes.ts`
  - TV Time import job/chunk/commit/rollback.
  - Current risk: import only supports show/movie and creates placeholder canonical rows before merge.
- `src/worker/merge-routes.ts`
  - Candidate building, manual search, accept merge, refresh enqueue, progress.
- `src/worker/hydration.ts`
  - Provider detail hydration and refresh job processing.
  - Current risk: provider fetching, normalization, scheduling, and D1 writes are coupled. Known hydration failures are hard to diagnose.
- `src/worker/providers.ts`
  - Provider search/explore/detail helpers and provider cache.
  - Current risk: cache helper, provider credentials, normalization, fallback providers, and attribution live together.
- `src/worker/people-routes.ts`
  - TMDB person profile endpoint and provider cache.
- `src/worker/supabase-storage.ts`
  - Avatar/banner/media cover upload.

## Current Database Map

### Auth And Identity

- `users`
- `user_profiles`
- `sessions`
- `auth_passwords`
- `oauth_accounts`
- `webauthn_credentials`
- `auth_challenges`
- `uploads`

### Global Media Catalog

- `media_items`
  - Canonical item for `show`, `movie`, `anime`, `game`, `book`.
  - Has core fields plus `extended_data_json`.
- `media_external_ids`
  - Provider ID mapping.
- `media_source_records`
  - Raw/import/provider source records and cached merge candidates.
- `media_merge_aliases`
  - Canonical source-to-target merge mapping.
- `media_metadata`
  - Structured global metadata.
- `media_images`
  - Structured media image rows.
- `media_genres`
  - Genre tags.
- `media_external_ratings`
  - External scores.
- `people`
- `media_credits`
- `seasons`
- `episodes`
- `media_units`
  - Optional chapters, acts, missions, quests.

### User Tracking

- `user_media`
  - User status, favorite, rating, notes, movie watched date, rewatch count, progress, platform, started date, purchase library.
- `episode_activity`
  - Episode watched state, rewatch count, rating, notes.
- `unit_activity`
  - Book/game unit completion, rating, notes.
- `activity_events`
  - Append-only activity log.

### Import, Provider Cache, And Hydration

- `import_jobs`
- `import_job_items`
- `import_warnings`
- `import_created_records`
- `provider_cache`
- `metadata_refresh_jobs`
- `media_metadata_freshness`

### Social Placeholders Already Present

- `comments`
- `reactions`

## Current Data Flows

### Search And Add

1. Client calls `/api/explore/search`.
2. Worker searches local DB first, then providers.
3. Results are deduped by provider key/title/year and marked as tracked.
4. Adding a provider result creates a global `media_items` row if no external ID match exists, then creates user `user_media`.
5. A refresh job may be queued for details.

Issues:

- Local/import and provider results can still appear separately if merge data is incomplete.
- Media type detection is provider-specific and not centralized.
- Provider results may carry compact metadata JSON but structured metadata tables are not consistently populated.

### Import And Merge

1. Client parses TV Time export locally.
2. Worker creates import job and chunk rows.
3. Commit processes chunks in batches and creates media, seasons, episodes, user tracking, activity, external IDs, and source records.
4. Merge page resolves source records against external IDs and title candidates.
5. Accepting merge moves user tracking/activity to canonical target and queues hydration.

Issues:

- Import is show/movie-only.
- Canonical creation and merge resolution overlap with explore add logic.
- Job progress exists, but provider/hydration failures are not transparent enough.

### Tracking

- Shows/anime use `episode_activity` plus cached `user_media.progress_episodes`.
- Movies use `user_media.status`, `watched_at`, and `rewatch_count`.
- Books/games use `media_units` plus `unit_activity` when units exist, otherwise `user_media.progress_value/progress_total/progress_unit`.
- Games also store richer user choices in `user_media.platform` JSON and newer `started_at`/`purchase_library`.

Issues:

- Status rules exist in both client and Worker.
- Game platform/store state is partly JSON and partly columns.
- Dashboard counts are recalculated per request instead of using a versioned stats cache/materialized table.

### Caching

- Server provider cache: `provider_cache` with provider, cache key, response JSON, status, fetched/expires timestamps.
- Server freshness: `media_metadata_freshness` tracks detail, episode guide, credits, availability hydration.
- Server jobs: `metadata_refresh_jobs`.
- Client memory/session caches:
  - dashboard payloads, filters, scroll position
  - explore rows/search results
  - media detail payload, episodes, units, scroll/collapse state
- Hydration cooldown in `localStorage`.

Issues:

- Client cache invalidation is manual and scattered.
- Server cache policy is provider-specific but not expressed as a shared contract.
- Freshness does not clearly separate `missing`, `stale`, `refreshing`, `failed`, and `complete`.
- Cross-device cache revalidation relies on refetching, not version markers.

### Notices And Errors

- `apiJson` converts server/network errors into friendly global snackbar notices.
- `SnackbarProvider` dedupes identical notices for a short window.
- Media detail still uses a local `Toast`.
- Some components also keep local `error`/`message` strings.

Issues:

- Notice behavior is better than before but not fully consolidated.
- Local toasts and global snackbars compete.
- Long-running operations need persistent job status UI instead of one-off notices.

## Product Direction Changes To Preserve

- Bottom nav currently has seven main pages: Shows, Anime, Movies, Explore, Books, YouTube, Games.
- Anime is now a distinct main media type/page, not a subset of Shows.
- Shows/movies from providers should be reclassified or tagged:
  - anime: animated plus primary/original language Japanese, Chinese, Korean, etc.
  - cartoon: animated plus primary/original language English.
- Later nav should be user-configurable:
  - Explore is always present.
  - User chooses 2 to 6 additional nav media types/pages.
  - Future types like places, food, and music should not require rewriting core tables/components.
- Settings will grow substantially:
  - profile and theme
  - API credentials per user
  - import/export
  - backup/restore
  - storage size reporting
  - nav customization
  - privacy/social controls

## Main Optimization Problems

1. Monolithic client file.
   - `app.tsx` mixes app shell, routing, pages, data fetching, design system, cache helpers, and domain-specific forms.
2. Monolithic stylesheet.
   - `styles.css` has hard-coded colors, repeated light/system rules, and page-specific selectors mixed with shared component styles.
3. Media type rules are duplicated.
   - Client, Worker, shared schemas, provider normalization, dashboard logic, nav, merge filters, routes, and status controls each encode type/status assumptions.
4. Anime split is incomplete.
   - Routes/nav exist, but shared dashboard kind still has `shows`, `movies`, `books`, `games`; Worker dashboard queries still include anime under shows.
5. Canonical media logic is spread across explore, import, merge, and hydration.
6. Provider/hydration strategy is hard to reason about.
   - External calls, TTLs, compact cache records, global metadata updates, and job retries are coupled.
7. Stats/counts are computed ad hoc.
   - Counts should not be based on paginated results and should not recalculate during every item update/import step.
8. Client caching is useful but informal.
   - There is no shared query key model, versioning, or invalidation event bus.
9. Modals/bottom sheets are one component but behavior is not encoded as variants.
10. Manual add/edit flows are too broad in one modal.
11. Settings is underpowered for the upcoming responsibilities.
12. Current schema has useful tables but also ambiguity.
   - `extended_data_json`, `media_metadata`, `media_images`, `media_credits`, and provider raw cache overlap without a clear ownership rule.

## Target Architecture

### Client Target File Structure

```text
src/client/
  app.tsx                         # providers + route tree only
  api/
    client.ts                     # apiJson, API error mapping
    query-cache.ts                # client cache, keys, invalidation
  shell/
    AppShell.tsx
    nav-config.ts
    ProtectedShell.tsx
  design/
    components/
      Button.tsx
      IconButton.tsx
      Modal.tsx
      Sheet.tsx
      Snackbar.tsx
      Tabs.tsx
      SegmentedControl.tsx
      EmptyState.tsx
      Skeleton.tsx
      Poster.tsx
      MediaCard.tsx
    tokens.ts
  features/
    auth/
    profile/
    settings/
    library/
    dashboard/
    explore/
    media-detail/
    import-tv-time/
    merge/
    tracking/
    people/
  domain/
    media-types.ts                # one client mirror of shared media config
    statuses.ts
    formatting.ts
```

Rules:

- `app.tsx` should eventually stay below roughly 250 lines.
- Pages fetch data through hooks in their feature folder.
- Shared visual components live in `design/components`.
- Domain rules come from `shared` or a thin client adapter, not hard-coded arrays in pages.
- Page-level components should not know provider-specific details unless they are in provider attribution UI.

### Worker Target File Structure

```text
src/worker/
  app.ts
  api/
    errors.ts
    pagination.ts
  repositories/
    auth-repository.ts
    media-catalog-repository.ts
    user-library-repository.ts
    tracking-repository.ts
    import-repository.ts
    provider-cache-repository.ts
    stats-repository.ts
  services/
    media-canonical-service.ts
    media-type-classifier.ts
    provider-service.ts
    hydration-service.ts
    import-service.ts
    merge-service.ts
    stats-service.ts
    backup-service.ts
  providers/
    provider-types.ts
    tmdb.ts
    igdb.ts
    rawg.ts
    open-library.ts
    jikan.ts
    youtube.ts
  routes/
    auth-routes.ts
    media-routes.ts
    library-routes.ts
    tracking-routes.ts
    explore-routes.ts
    import-routes.ts
    merge-routes.ts
    people-routes.ts
    settings-routes.ts
```

Rules:

- Routes validate input and call services.
- Services own orchestration and transactions.
- Repositories own SQL and row mapping.
- Providers own external HTTP and provider-specific normalization only.
- Provider cache is used by provider wrappers, not hand-written in each route.
- No route should directly build canonical media if `media-canonical-service` can do it.

## Proposed Database Direction

This is a target map, not a migration to apply all at once.

### Keep

- Existing auth/profile/session/upload tables.
- Existing `media_items` as the canonical catalog table.
- Existing `media_external_ids`, `media_source_records`, and `media_merge_aliases`.
- Existing tracking tables: `user_media`, `episode_activity`, `unit_activity`.
- Existing `provider_cache`, `metadata_refresh_jobs`, `media_metadata_freshness`.
- Existing social placeholders: `comments`, `reactions`, `activity_events`.

### Normalize Ownership

- `media_items`
  - Owns canonical identity and lightweight display fields only.
  - Fields: type, title, normalized title, overview, poster/backdrop, release/year, language/country, source/source_id, totals, updated timestamps.
- `media_metadata`
  - Owns structured global details such as original title, tagline, homepage, trailer, content rating, air info, runtime, page count, budget/sales.
- `media_images`
  - Owns galleries, posters, backdrops, logos, stills.
- `media_credits`
  - Owns cast/crew/author/studio/voice relationships.
- `media_external_ratings`
  - Owns ratings from TMDB, MAL, Open Library, RAWG, IGDB, Steam, etc.
- `extended_data_json`
  - Temporary compatibility field for provider-specific extra data.
  - Rule: do not make new UI depend only on this if the data is important and repeated.

### Add In 7.5.x

```sql
-- Provider credentials are user-scoped and encrypted before storage.
CREATE TABLE user_provider_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  label TEXT,
  encrypted_secret_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_validated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, provider, label)
);

-- User navigation preferences.
CREATE TABLE user_navigation_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  items_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Cross-device client/server cache invalidation.
CREATE TABLE user_library_versions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

-- Cached stats snapshots, recalculated after grouped mutations.
CREATE TABLE user_stats_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  version INTEGER NOT NULL,
  calculated_at TEXT NOT NULL,
  UNIQUE(user_id, scope)
);

-- Backup/export job tracking.
CREATE TABLE backup_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('export','backup','restore')),
  status TEXT NOT NULL,
  object_path TEXT,
  byte_size INTEGER,
  counts_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Future Media Types

Current `media_items.type` has a static CHECK. That is fine for v1, but future types like places, food, and music will be painful if every new type requires rebuilding core tables and editing dozens of switches.

Plan:

- In 7.5, centralize type definitions in code first.
- Before adding places/food/music, add `media_type_definitions` and rebuild `media_items` without a hard-coded CHECK or with a broader future-ready CHECK.
- Keep type-specific fields in metadata/unit/extended tables, not new top-level columns for every type.

## Proposed Media Type Model

Create one shared media config:

```ts
type MediaTypeConfig = {
  type: MediaType;
  route: string;
  label: string;
  pluralLabel: string;
  icon: string;
  defaultStatus: string;
  statuses: Array<{ value: string; label: string; tone: string }>;
  dashboardKind: string;
  unitKinds: string[];
  progressModes: string[];
  providerKinds: string[];
  detailTemplate: "series" | "movie" | "book" | "game" | "video";
};
```

Required rules:

- Nav, dashboards, filters, manual add, status controls, merge filters, explore filters, and detail pages must all read from this config.
- Anime gets its own dashboard kind and route.
- YouTube gets its own route and config, even if provider integration is placeholder at first.
- Cartoon is a tag/category on show/movie, not a primary media type unless product direction changes.

Classification rules:

- Anime:
  - animated genre/category plus original/primary language in Japanese, Chinese, Korean, or similar anime-origin language list.
  - provider-specific clues like TMDB genre 16 plus `original_language`.
- Cartoon:
  - animated genre/category plus original/primary language English.
- Ambiguous:
  - keep provider type, add `needs_review` classification flag, and allow manual correction from media settings.

## Cache And Revalidation Strategy

### Server

- Provider cache remains in D1 `provider_cache`.
- Add a provider cache service with one API:
  - `getOrFetch(provider, key, ttl, fetcher, options)`
  - handles stale reads, 429 retry hints, safe error messages, attribution, and response size checks.
- Use stale-while-revalidate for non-critical detail pages:
  - if cached data exists, return it immediately.
  - if stale, enqueue refresh and show `updating` state.
- Use strict fetch for explicit user actions:
  - refresh button, merge resolution, first add from provider.
- Store failure state in `metadata_refresh_jobs` and `media_metadata_freshness`.
- Never refetch provider detail if:
  - data exists,
  - freshness TTL has not expired,
  - no user forced refresh,
  - no import/merge requires it.

### Client

- Replace ad hoc maps with a small query cache:
  - key: `[scope, userId, params, version]`
  - state: data, savedAt, staleAt, error, pending promise, scroll state if page-level.
- Add invalidation events:
  - `library:item-added`
  - `library:item-removed`
  - `library:status-changed`
  - `tracking:episode-changed`
  - `tracking:unit-changed`
  - `media:metadata-updated`
  - `import:committed`
  - `merge:accepted`
- Query `/api/me/state-version` or include `libraryVersion` in `/api/me`.
- Cross-device behavior:
  - each mutation increments `user_library_versions.version`.
  - client compares version on app focus, navigation, and mutation responses.
  - stale caches are refreshed in background.

## Stats And Counts Strategy

Do not compute dashboard and profile stats from paginated results.

Short-term:

- Keep `dashboardSectionCounts`, but move it to `stats-service`.
- Return counts with a version number.
- Recalculate once after grouped operations:
  - import commit batch complete
  - merge accepted
  - add/remove library
  - status/progress changed
  - episode/unit activity changed

Target:

- `user_stats_snapshots` stores user-scoped dashboard/profile stats.
- `activity_events` remains append-only source of truth for future analytics.
- Stats calculation should support:
  - total show/anime/movie watch time
  - total games playtime
  - total book pages/percent/finished count
  - favorites and status counts
  - per-year/month trends

## UI And Design System Rules

### Tokens

Create CSS variables for:

- color text/background/surface/border/accent/danger/success/info
- elevations and overlays
- spacing scale
- radii
- type scale
- z-index layers
- topbar/nav/sheet heights
- poster aspect ratios

Rules:

- No new hard-coded colors in feature CSS.
- No viewport-width font scaling.
- Cards stay at 8px radius or less unless design system changes.
- Mobile-first layout first, desktop enhancements second.
- Text overflow must be handled by component rules, not one-off patches.

### Components To Consolidate

- `AppPage`
- `PageHeading`
- `ActionBar`
- `IconButton`
- `Button`
- `SegmentedControl`
- `Tabs`
- `SortMenu`
- `SearchInput`
- `FilterChips`
- `MediaCard`
- `PosterImage`
- `HorizontalRail`
- `ProgressBar`
- `StatusChip`
- `Modal`
- `BottomSheet`
- `Snackbar`
- `JobProgressBanner`
- `EmptyState`
- `Skeleton`

### Modal And Bottom Sheet Rules

- One overlay primitive.
- Variant:
  - mobile: bottom sheet covering nav and locking background scroll.
  - desktop: centered modal or side panel.
- Always portals to `document.body`.
- Always closes on outside click unless a destructive action requires confirmation.
- All sheets/modals use the same z-index and safe-area tokens.

### Notices

- Replace local `Toast` usage with global snackbar or job banner.
- Snackbar is for short-lived notices.
- Job banner is for long-running import/merge/hydration/backup/restore.
- Error messages shown to users must be friendly; developer details stay in logs/details.

### Constants And Copy Rules

- Shared constants live in `src/shared/constants.ts`.
- External API base URLs, provider display names, app identity, cache keys, local storage keys, and design token names should be added there before use.
- Provider-specific paths and query parameters stay inside provider modules so API behavior remains easy to review.
- User-facing page copy that repeats across features should move into a shared copy object before another page duplicates it.
- Palette changes should start in `src/client/styles/tokens.css`; feature CSS should use token variables whenever practical.

## Settings Overhaul Plan

Target settings sections:

- Account
  - display name, username, bio, avatar, banner
- Appearance
  - light/dark/system
  - compactness if added later
- Navigation
  - choose 2 to 6 nav items plus Explore always present
  - reorder nav items
- Providers
  - connect TMDB, RAWG, IGDB, Open Library contact, Jikan/MAL-safe source, YouTube, fallback providers
  - credentials user-scoped
  - validate connection
  - show last validation and quota/rate-limit notes when available
- Import/Export
  - TV Time import
  - zipped account export
  - restore from export
- Backup
  - create backup ZIP
  - store in Supabase
  - restore backup
  - list/delete backups
- Storage
  - complete database/media estimate
  - current user's DB/media estimate
  - Supabase object usage estimate
- Privacy And Social
  - profile visibility
  - messaging visibility
  - comments/recommendation privacy

Credential storage rule:

- Do not store plaintext provider credentials.
- Use an encryption key from Worker secrets.
- Store encrypted JSON in `user_provider_credentials`.
- Provider service resolves credential priority:
  1. user credential
  2. app fallback credential
  3. provider disabled/needs setup

## Search And Canonical Strategy

Search order:

1. Local canonical media by title, aliases, external IDs, tags, people.
2. Provider cache results.
3. External providers only if query is user-triggered and debounce has settled.

Add/import strategy:

1. Normalize and classify provider/import source.
2. Look up external IDs.
3. Look up title/year/type aliases.
4. If exact match exists, attach source ID and user tracking to canonical row.
5. If likely match exists, create merge candidate.
6. If no match, create one lightweight canonical row.
7. Hydrate asynchronously and update global metadata.

Deduping rule:

- UI should never show both a merged local item and its provider duplicate.
- Merge alias/source records must be consulted by all search/explore/type-list endpoints.

## Import, Export, Backup, Restore Direction

Import:

- Keep TV Time flow.
- Route imports through canonical media service.
- After import, redirect to merge/review when candidates exist.
- Do not recalculate stats after every imported item; batch and recalculate once per chunk/job phase.

Export:

- Export user-scoped rows plus referenced global media rows.
- Include media metadata, episodes, units, activity, notes, ratings, settings, provider source IDs, and upload metadata.
- Do not export plaintext provider credentials.

Backup:

- Backup is an export ZIP stored as user media in Supabase.
- Track backups in `backup_jobs` and `uploads`.
- Restore must be dry-run capable before writing.

## Future Feature Placement

- Social connections and direct messages:
  - new `connections`, `messages`, `message_media_shares` tables.
  - media sharing should reference canonical `media_items`.
- Comments:
  - extend existing `comments`.
  - support media, episode, unit, list comments.
  - add spoiler gates based on tracking state.
- Stats:
  - use `activity_events`, tracking tables, and `user_stats_snapshots`.
- Recommendations:
  - use canonical media, external IDs, tags, user statuses, and provider cache.
  - store recommendation snapshots per user only when needed.
- Tags:
  - global tags for `new`, `upcoming`, `trending`, `popular`, `recently_released`, `cartoon`, `anime`.
  - user tags later if needed.
- Custom lists:
  - mixed-media list tables should reference canonical media IDs.

## Phase 7.5 Implementation Plan

### 7.5.0 Audit And Guardrails

- [x] Create this optimization plan.
- [x] Add a short architecture pointer in `README.md`.
- [x] Add tests proving current key flows before refactors:
  - auth/session
  - dashboard counts
  - search add
  - import commit/rollback
  - merge accept
  - media detail cache/fallback
  - episode/unit tracking
- [x] Freeze expected acceptance flows in docs so refactors can be checked.

## Phase 7.5.0 Acceptance Flow Freeze

These flows are the behavioral contract for the 7.5 refactors. A later 7.5.x change can alter implementation details, but it should not remove or weaken these outcomes.

### Automated Guardrail Coverage

- Auth/session:
  - registering with password returns a session cookie and CSRF token.
  - `/api/me` succeeds with that session and fails without one.
  - logout clears the session.
- Dashboard counts and sections:
  - dashboard endpoints return status counts, section counts when D1 is available, and stable section IDs.
  - counts must not be derived only from the current visible/paginated card list.
- Search add:
  - local catalog results appear in `/api/explore/search`.
  - adding a provider result creates one global media row plus one user library row.
  - adding the same result again reports `alreadyTracked`.
- Media detail fallback:
  - `/api/media/:id` returns saved media and user tracking even when provider hydration is missing or stale.
  - `/api/media/:id/episodes` and `/api/media/:id/units` return saved activity states without requiring provider data.
- Episode/unit tracking:
  - episode watch/unwatch/rewatch updates activity and cached progress.
  - season bulk watch respects actual episode counts rather than assuming equal season sizes.
  - book/game units can be completed, rated, and fetched through their detail route.
- Import commit/rollback and merge accept:
  - automated parser and route-adjacent tests exist today, while D1 commit/rollback/merge acceptance remains a manual guardrail until 7.5.2 gives these flows repository/service boundaries.

### D1 Manual Guardrails Until 7.5.2

The current Vitest harness uses in-memory repositories and does not yet provide a D1-compatible SQL runner. Import and merge routes still perform direct D1 SQL, so these flows must be checked manually until 7.5.2 moves import/merge into service/repository boundaries.

TV Time import commit/rollback:

1. Start the Worker with `npm run dev:worker`.
2. Log in.
3. Open `/profile/import/tv-time`.
4. Upload the TV Time ZIP or individual export files.
5. Run dry-run and confirm counts/warnings render.
6. Commit the import and confirm progress reaches committed.
7. Check Shows and Movies dashboards for imported items and watched counts.
8. Roll back the import from Import History.
9. Confirm only records owned by that import are removed and unrelated media/tracking remain.

Merge accept:

1. Open `/profile/merge`.
2. Confirm unresolved, exact, and review counts render.
3. Resolve candidates if needed.
4. Accept one exact/provider match.
5. Confirm source tracking remains visible on the canonical media page.
6. Confirm duplicate local/provider search results collapse after merge.
7. Confirm a metadata refresh job is queued but the media page still works if hydration fails.

### UX Smoke Flow

1. Log in on desktop and mobile/ngrok.
2. Visit Shows, Anime, Movies, Explore, Books, YouTube, and Games.
3. Use global search to add a media item.
4. Mark an episode watched and rewatched.
5. Update a book/game progress value.
6. Upload or update a media cover.
7. Open Settings and confirm theme/profile controls still work.
8. Refresh the browser and confirm tracked data still displays.

### 7.5.1 Shared Media Type Registry

- [x] Create shared media type config.
- [x] Add `anime` dashboard kind.
- [x] Add `youtube` route/type placeholder without breaking existing media schema.
- [x] Replace hard-coded nav/filter/status arrays with config-driven values.
- [x] Split Anime dashboard from Shows dashboard at API and client level.
- [x] Add cartoon/anime classification utility and tests.
- [x] Keep backwards compatibility for imported shows that should later classify as anime.

Implementation notes:

- `src/shared/media-config.ts` is now the source of truth for persisted media types, dashboard kinds, status choices, default statuses, and primary nav page definitions.
- `youtube` is intentionally represented as a nav/page placeholder only. It is not part of `MediaType` or the current `media_items.type` schema.
- Shows and Anime now use separate dashboard kinds and API queries. Imported items that remain stored as `show` continue to work in Shows until merge/hydration/classification updates their canonical type or extended metadata marks them as anime.
- `src/shared/media-classification.ts` centralizes anime/cartoon detection using animation genre signals plus original/primary language.

### 7.5.2 API And Repository Boundaries

- [x] Split `media-repository.ts` by responsibility.
- [x] Move dashboard count logic into `stats-service`.
- [x] Move canonical lookup/create/merge decisions into `media-canonical-service`.
- [x] Make explore add, import, and merge use the same canonical service.
- [x] Add route-level pagination helpers and consistent response shapes.
- [x] Add tests for canonical dedupe and aliases.

Implementation notes:

- `src/worker/repositories/media-repository-boundaries.ts` defines repository role slices for catalog and user-library work. The large D1 implementation still exists for compatibility, but new services now depend on narrower boundaries instead of the full repository surface.
- `src/worker/stats-service.ts` owns dashboard section count SQL. Library routes now call this service instead of embedding count SQL directly.
- `src/worker/media-canonical-service.ts` owns provider canonical creation, import placeholder resolution, external ID attachment, source-record upsert, metadata refresh enqueueing, and merged-alias resolution.
- Explore add, Merge accept with provider result, and TV Time import placeholder creation now share canonical service logic.
- `src/worker/pagination.ts` provides shared offset pagination parsing and page metadata helpers for routes that expose `limit`/`offset`.
- Tests cover provider add dedupe through the canonical boundary and merged media alias resolution.

### 7.5.3 Provider And Hydration Reliability

- [x] Extract provider cache service.
- [x] Move TMDB, IGDB/RAWG, Open Library, Jikan, and YouTube provider code into separate files.
- [x] Define provider TTLs in one place.
- [x] Add user-provider credential lookup with app fallback.
- [x] Add hydration job states: queued, running, complete, failed, paused, stale.
- [x] Add stale-while-revalidate detail behavior.
- [x] Add detailed server logs but friendly frontend notices.
- [x] Add hydration tests with mocked provider responses, 429s, stale cache, and failed jobs.

Implementation notes:

- `src/worker/providers/provider-cache-service.ts` owns provider response caching, cache writes, and retry-aware 429 errors.
- `src/worker/providers/provider-ttls.ts` centralizes provider TTL policy.
- `src/worker/providers/provider-credentials.ts` checks future user-scoped provider credentials first and falls back to app-level environment secrets. Until Settings writes encrypted user credentials, missing credential tables are ignored safely.
- Provider code is split into `tmdb.ts`, `igdb-rawg.ts`, `open-library.ts`, `jikan.ts`, and `youtube.ts`, with `src/worker/providers.ts` retained as a compatibility facade.
- `0011_phase_7_5_hydration_reliability.sql` rebuilds `metadata_refresh_jobs` to allow `queued`, `running`, `complete`, `failed`, `paused`, and `stale`, and adds the user provider credential table shell.
- Media detail now uses stale-while-revalidate: saved details return immediately while stale/missing metadata queues a background `stale` refresh job via `ctx.waitUntil`.
- Hydration failures now log structured server context while persisting friendly user-facing failure messages in `metadata_refresh_jobs.last_error`.

### 7.5.4 Client Query Cache And Cross-Device Revalidation

- [x] Create `api/query-cache.ts`.
- [x] Define query keys for dashboards, media detail, explore rows, search, profile, settings.
- [x] Add `user_library_versions`.
- [x] Increment version on add/remove/status/progress/episode/unit/import/merge.
- [x] Revalidate on app focus, route changes, and mutation responses.
- [x] Remove scattered cache maps after migration.
- [x] Add tests for cache invalidation and stale refresh behavior.

Implementation notes:

- `src/client/api/query-cache.ts` is the browser cache owner. Cache keys include user id and `libraryVersion` for dashboards, media detail, Explore rows/search, profile, and settings.
- `0012_phase_7_5_client_cache_versions.sql` adds `user_library_versions`; `/api/me` returns the current version.
- Library-affecting mutations bump the user version after successful add/remove/status/favorite/rating/notes/progress/movie watched, episode and season activity, unit activity, Explore add, import commit/rollback completion, and merge accept/accept-exact.
- The app shell checks `/api/me` on focus and route changes. If the version changed, it invalidates user-scoped dashboard, detail, Explore, profile, and settings caches.
- Import commit/rollback bumps only at final completion so large migrations do not invalidate or recalculate on every imported row.

### 7.5.5 Design System Extraction

- [x] Create design token CSS file.
- [x] Split CSS into token, shell, components, features.
- [x] Extract shared components from `app.tsx`.
- [x] Replace local `Toast` with global snackbar/job banner.
- [x] Normalize modal/bottom sheet behavior.
- [x] Normalize search input, filters, cards, rails, posters, and progress components.
- [x] Add constants/copy/API endpoint consolidation to the design-system plan.
- [x] Add visual smoke checks for mobile/desktop shell, sheets, media detail, settings.

Implementation notes:

- `src/client/styles.css` is now an import hub for `styles/tokens.css`, `styles/shell.css`, `styles/components.css`, and `styles/features.css`.
- `styles/tokens.css` owns the first shared palette, radius, shell-size, and shadow tokens; shell rules now use the most common variables.
- `src/client/components/ui.tsx` owns `IconButton`, `Modal`, `MediaCard`, `ResponsivePoster`, `ProgressBar`, `StatusChip`, `EmptyState`, `SkeletonGrid`, `Tabs`, and `SegmentedControl`. `src/client/app.tsx` re-exports these for compatibility with existing tests/imports.
- Media detail success/error notices now use the global snackbar via `notify`; the old local `Toast` render path was removed.
- `src/shared/constants.ts` centralizes app identity, external API base endpoints, provider names, UI storage/event keys, and design token names.
- Provider modules now read base URLs/attribution labels from shared constants while keeping provider-specific paths near the provider logic.
- Existing Playwright shell/navigation and CLS checks remain the visual smoke gate; component smoke coverage continues through Vitest.

### 7.5.6 Settings Overhaul

- [ ] Build settings section shell.
- [ ] Move profile settings into Account.
- [ ] Add Appearance settings.
- [ ] Add Navigation settings with min/max nav item constraints.
- [ ] Add Provider credentials UI and API.
- [ ] Add Import/Export entry points.
- [ ] Add Backup/Restore job UI placeholders.
- [ ] Add Storage usage placeholder with future endpoints.

### 7.5.7 Stats, Counts, And Activity Snapshots

- [ ] Add `user_stats_snapshots`.
- [ ] Add stats recalculation service.
- [ ] Batch stats recalculation after import/merge.
- [ ] Update dashboard count APIs to read snapshots where fresh.
- [ ] Add profile stats foundation.
- [ ] Add tests for counts not depending on pagination.

### 7.5.8 Media Detail Templates

- [ ] Create shared detail layout primitives.
- [ ] Implement type templates:
  - series: shows/anime
  - movie
  - book
  - game
  - YouTube/video
- [ ] Move type-specific sections out of the main page.
- [ ] Make manual edit/customization sheet config-driven.
- [ ] Ensure missing metadata shows stable placeholders and refresh state without layout jumps.

### 7.5.9 Import/Export/Backup Foundations

- [ ] Route TV Time import through canonical service.
- [ ] Add export schema and dry-run.
- [ ] Add backup job table/service.
- [ ] Add storage usage estimators.
- [ ] Add restore dry-run plan.

## Code Rules From Here On

- Do not add new media-type switches directly in pages. Add media type config first.
- Do not add new provider fetch logic inside routes. Add provider wrapper/service.
- Do not add new dashboard counts based on paginated results.
- Do not duplicate user-facing error logic. Use the notice system.
- Do not introduce new raw colors or spacing values in feature CSS. Use tokens.
- Do not store provider credentials in `.dev.vars` as the only path for multi-user features; support user-scoped credentials with app fallback.
- Do not store important repeated metadata only in `extended_data_json`; add structured rows or a planned migration.
- Do not refetch external provider details when fresh global metadata exists.
- Do not recalculate stats per imported item.
- Do not block tracking functionality on provider hydration success.
- Keep migrations additive where possible; if table rebuild is needed, document rollback and run local D1 migration tests.

## Acceptance For Phase 7.5

- Existing Phase 1-7 UX still works.
- Shows, Anime, Movies, Explore, Books, YouTube, and Games nav remains available.
- Anime dashboard is separate from Shows.
- Search/add/import/merge use one canonical media pathway.
- Client cache invalidation is predictable and works across devices after mutation/version checks.
- Settings has a scalable structure for providers, backups, storage, nav, profile, and appearance.
- UI primitives are extracted enough that future pages do not grow `app.tsx` and `styles.css`.
- TypeScript, tests, and build pass after each 7.5.x phase.
