# Phase 6.5: Canonical Merge and Metadata Hydration

This phase fixes duplicate local/import/provider media and establishes the long-term rule: one canonical app-scoped media row per real-world item, many provider/source references, and user-scoped tracking attached to that canonical row.

## Research Notes

- TMDB supports text search, discover, and external-ID find workflows. This is the primary route for resolving TV Time IMDb/TVDB references into canonical movies/shows.
- TMDB TV, season, episode, and movie detail endpoints support `append_to_response` with up to 20 namespace items, so one bounded request can fetch details plus useful related payloads such as credits, images, videos, external IDs, recommendations/similar, watch providers, ratings/release data where available.
- D1 Free is currently 500 MB per database and 50 queries per Worker invocation, so provider hydration must batch and store only normalized essentials plus short/medium-lived raw cache rows.
- Supabase Free currently includes 1 GB storage, 5 GB egress, and a 50 MB max file size. Use Supabase Storage for user uploads and optional evictable image cache only, not as the primary metadata store.

## Decisions

- [x] Canonical metadata is app-scoped and stored once in `media_items` plus normalized child tables.
- [x] User tracking is user-scoped and remains in `user_media`, `episode_activity`, `unit_activity`, ratings, notes, lists, and activity events.
- [x] Imported TV Time rows are source references, not final duplicate media, once matched.
- [x] Provider references live in `media_external_ids` with multiple IDs per canonical media item: TMDB, TVDB, IMDb, RAWG, Open Library, ISBN, TV Time UUID.
- [x] Search results must collapse local/import/provider matches into one UI result whenever external IDs or high-confidence title/year/type matching agree.
- [x] Merge operations must move user activity to the canonical target and leave an alias/redirect from duplicate source rows.
- [x] Never overwrite user tracking, ratings, notes, status, watched dates, or rewatch counts during hydration.
- [x] Provider detail refresh should be manual on media/episode pages and automatic only on TTL expiry or after import/merge jobs.
- [x] Store compact normalized metadata in D1; store raw provider JSON only in `provider_cache` with TTL; store images as provider URLs unless a user-customized or explicitly cached image is needed.

## Data Model

- [x] Add `media_merge_aliases` table:
  - duplicate/source media ID
  - canonical/target media ID
  - merge status
  - confidence
  - reason JSON
  - merged by user ID nullable
  - timestamps
- [x] Add `media_source_records` table for raw/import identities:
  - media ID
  - source kind: `tv_time`, `tmdb`, `rawg`, `openlibrary`, `manual`
  - source ID / UUID
  - raw title/year/type/status
  - normalized match fields
  - raw JSON pointer/cache key
- [x] Add `metadata_refresh_jobs` table:
  - media ID
  - provider
  - scope: media, seasons, episodes, credits, images, availability
  - status, attempts, last error, timestamps
- [x] Add optional freshness columns/table:
  - detail hydrated at
  - episode guide hydrated at
  - credits hydrated at
  - availability hydrated at
- [x] Add indexes for external ID lookup, duplicate-source lookup, and merge queue filters.

## Matching Strategy

- [x] Match by external IDs first:
  - IMDb and TVDB to TMDB `/find`
  - TMDB ID direct
  - RAWG ID direct for games
  - Open Library work/edition/ISBN for books
- [x] Match by strong normalized title/type/year when external IDs are missing:
  - exact normalized title
  - same media type
  - year difference within configured tolerance
  - optional runtime/episode-count support once known
- [x] Generate confidence levels:
  - `external_id_exact`
  - `title_year_strong`
  - `title_only_review`
  - `ambiguous`
- [x] Only auto-merge exact external-ID matches.
- [x] Require manual review for title/year and ambiguous matches.
- [x] Allow manual search override from the merge page.

## Merge UX

- [x] Add Profile action: `Merge media`.
- [x] Add `/profile/merge` route.
- [x] Show totals:
  - unmerged imports/placeholders
  - exact matches
  - needs review
  - merged count
  - skipped count
- [x] Filter by media type: shows, movies, books, games, anime.
- [x] Show candidate pairs with:
  - imported/local item
  - provider/canonical candidate
  - confidence reason
  - watched/progress summary
  - provider metadata preview
- [x] Actions:
  - accept single match
  - reject match
  - search manually
  - accept selected
  - accept all exact matches for type
- [x] Show progress during merge.
- [x] After import commit, redirect to `/profile/merge?sourceJob=:jobId`.
- [x] If user adds a manual item that later appears in providers, it should show in merge candidates.

## Merge Execution

- [x] Transactionally move user-scoped rows from duplicate media ID to canonical media ID:
  - `user_media`
  - `episode_activity`
  - `unit_activity`
  - lists/list items when implemented
  - comments/reactions/activity events when implemented
- [x] Preserve episode activity by mapping imported episodes to provider episodes:
  - external episode ID if available
  - season/episode number fallback
  - specials stay season 0
- [x] Preserve user watched dates, rewatch counts, ratings, notes, and status.
- [x] If canonical provider episode rows do not exist yet, hydrate/create seasons and episodes before moving activity.
- [x] Leave alias row so old routes can redirect to canonical media.
- [x] Never delete duplicate media until all user-scoped rows and source references have moved safely.
- [x] Make merge idempotent and retry-safe.

## Hydration Strategy

- [x] Media page has `Refresh info` in settings bottom sheet/modal.
- [x] Episode page has `Refresh info`.
- [x] Merge acceptance triggers targeted hydration for the canonical media.
- [ ] Hydrate in bounded chunks:
  - movie/show/book/game top-level details
  - seasons
  - episode pages for only known seasons or visible ranges
  - credits/cast
  - images/galleries
  - availability/where-to-watch
- [x] Use `ctx.waitUntil()` only for small post-response work; larger jobs stay user-triggered/chunked.
- [ ] TTL policy:
  - static released movies/books/games: 30-90 days
  - ongoing shows/anime: 12-24 hours around air dates, 7 days otherwise
  - watch providers/availability: 7 days
  - credits/images: 30 days
  - upcoming episodes/releases: 12 hours
- [ ] Store normalized essentials in D1:
  - titles, descriptions, dates, runtime, status
  - poster/backdrop URLs
  - season/episode structure
  - episode still URL, release date, runtime, overview
  - people/credits compact rows
  - external ratings and provider attribution
- [x] Keep raw provider JSON in `provider_cache` with expiry.
- [x] Use provider image URLs by default; only cache images in Supabase when provider terms/latency/use-case justify it.

## Provider Coverage

- [x] TMDB for shows, anime-as-TV where available, movies, seasons, episodes, images, videos, credits, external IDs, similar/recommendations, and watch providers.
- [x] RAWG for games, screenshots/backgrounds, release dates, platforms, genres, developers/publishers, ratings, and store links.
- [x] Open Library for books, works/editions/authors, covers, subjects, publish dates, and ISBNs.
- [ ] Evaluate additional free sources only for gaps:
  - TV Maze for TV episode schedules/air times if TMDB is insufficient.
  - IGDB only if terms and auth complexity are acceptable later.
  - Google Books only if Open Library coverage is inadequate and API terms fit.

## Tests

- [ ] Unit tests for confidence scoring.
- [ ] Unit tests for external-ID matching.
- [ ] Integration tests for merge moving `user_media`.
- [ ] Integration tests for episode activity mapping by season/episode number.
- [ ] Idempotent retry test for merge jobs.
- [ ] Provider hydration tests with mocked TMDB/RAWG/Open Library responses.
- [ ] Import integration test redirects to merge page after commit.
- [ ] UI test for accept single, manual search override, accept all exact matches.

## Acceptance Gate

- [ ] Searching imported media such as `Rick and Morty` shows one merged/collapsible result instead of separate import and provider duplicates.
- [ ] Imported watched history remains intact after merge.
- [ ] Media details and episode guide hydrate from providers after merge.
- [ ] User can manually resolve incorrect or missing matches.
- [x] App-scoped metadata and user-scoped tracking are clearly separated in schema and API behavior.
