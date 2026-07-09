# Tuvu Implementation Prompt and Phase Plan

You are building **Tuvu**, a fast, responsive, TV Time-inspired media tracking web app for a personal Cloudflare Workers deployment. The app must preserve the core TV Time experience while expanding tracking to shows, movies, anime, games, and books. It must import the user's existing TV Time export data accurately, run cheaply on Cloudflare, and be structured so new media types and social features can be added without rewrites.

This document is the implementation prompt. Treat it as the source of truth for product behavior, architecture, technology choices, migration requirements, and phase gates. Do not skip a phase gate. Each phase must pass its tests before the next phase starts.

## 1. Product Goal

Build a personal, lightweight TV Time clone with:

- Responsive mobile-first UI that follows TV Time's familiar navigation and visual patterns.
- Tracking for shows, movies, anime, games, and books.
- Import/migration from the provided TV Time data exports.
- User registration/login, profile avatar, profile banner, public profile, custom lists, user connections, and direct messages.
- Explore/search pages with suggestions and discovery similar to TV Time.
- Small Worker footprint, low CPU usage, low memory pressure, and cached external API usage.
- Clean, typed, DRY code with clear extension points for future features.

The first production version should cover all basic functionality well. Advanced polish, recommendation quality, realtime chat, native apps, and premium analytics can come later.

## 2. Research Summary

### TV Time Feature Baseline

TV Time is a TV/movie tracker and social network. The core app structure is:

- Bottom tabs: Shows, Movies, Discover, Profile.
- Show watchlist with poster or thumbnail views, progress bars, "watch next", "haven't watched for a while", watch history, and watched episode actions.
- Show pages with episode lists, watched state, ratings, feelings/reactions, favorite character voting, and community comments.
- Spoiler protection: episode/movie comments are hidden until the user marks that item watched.
- Upcoming section for future episodes and unreleased movies.
- Movie watchlist, watched state, ratings, reactions, and comments.
- Discover/search for shows, movies, users, genre filters, ongoing/ended filters, trending, popular, and personalized recommendations.
- Profile with TV/movie time, watched counts, stats, graphs, badges, rankings, recent activity, favorite lists, and custom lists.
- Users can filter comment languages.

Reference: https://en.wikipedia.org/wiki/TV_Time

### Provided TV Time Export Findings

The import must preserve the following data. Do not flatten this into only watched/unwatched.

Files:

- `C:/Users/ahmar/Downloads/tvtime-series-2026-05-07.json`
- `C:/Users/ahmar/Downloads/tvtime-series-2026-05-07.csv`
- `C:/Users/ahmar/Downloads/tvtime-series-episodes-2026-05-07.csv`
- `C:/Users/ahmar/Downloads/watched-series.csv`
- `C:/Users/ahmar/Downloads/tvtime-movies-2026-05-07.json`
- `C:/Users/ahmar/Downloads/tvtime-movies-2026-05-07.csv`
- `C:/Users/ahmar/Downloads/tvtime-summary-2026-05-07.html`
- `C:/Users/ahmar/Downloads/app-icon.png`

Observed export shape:

- Series: 647 shows.
- Series statuses:
  - 192 `up_to_date`
  - 172 `not_started_yet`
  - 145 `watch_later`
  - 120 `continuing`
  - 18 `stopped`
- Seasons: 2,063.
- Episode rows: 32,452.
- Watched episodes: 11,646.
- Watched regular episodes: 11,535.
- Watched specials: 111.
- Rewatched episode rows: 332.
- Favorite shows: 37.
- Movies: 1,050.
- Watched movies: 658.
- Movie watchlist/unwatched: 392.
- Rewatched movies: 3.
- Movies missing IMDb IDs: 30.
- Movies missing TVDB IDs: 0.
- The summary HTML warns that TV Time data may include UTC date shifts, future unaired episodes, ghost/orphan data, old missing watches, and backend inconsistencies.

### Cloudflare Constraints

Cloudflare Workers are a good target, but the app must respect free-tier style constraints:

- Workers Free currently lists 100,000 requests/day, 10 ms CPU time per HTTP request, 128 MB memory, 50 subrequests/request, and 3 MB Worker size.
- D1 Free currently lists 500 MB maximum database size and 50 queries per Worker invocation.
- R2 is appropriate for user-uploaded avatars/banners and optional cached image files.

References:

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- R2 limits: https://developers.cloudflare.com/r2/platform/limits/
- Workers static assets: https://developers.cloudflare.com/workers/static-assets/

Architectural implication:

- Prefer a static SPA served by Workers Static Assets plus a small Hono API Worker.
- Avoid server-side rendering for normal pages.
- Avoid parsing large import files inside the Worker all at once.
- Use route-level code splitting.
- Cache metadata aggressively in D1/R2/Cache API.
- Batch external API hydration and never fan out dozens of requests in one user request.

### External APIs

Use free/public APIs carefully and cache responses.

- TMDB: primary source for shows and movies. It supports search, discover, images, external ID lookup, and daily ID exports. Requires API key and rate-limit respect. Use for anime entries when TMDB has sufficient data.
  - Docs: https://developer.themoviedb.org/docs/getting-started
  - Finding data: https://developer.themoviedb.org/docs/finding-data
  - Images: https://developer.themoviedb.org/docs/image-basics
  - Rate limiting: https://developer.themoviedb.org/docs/rate-limiting
- RAWG: primary source for games. Free tier is suitable for personal/hobby use, requires API key and backlinks/attribution where RAWG data/images are used.
  - Docs/terms: https://rawg.io/apidocs
- Open Library: primary source for books. Must use API endpoints, identify the app with User-Agent/email, keep traffic low, and cache responses. Do not use it as a high-traffic backend.
  - Docs: https://openlibrary.org/developers/api
- AniList: do not use as the primary anime metadata provider in v1 because its terms prohibit competing non-complementary anime/manga tracker services unless authorized. It can be reconsidered later as an opt-in sync/integration after compliance review.
  - Docs: https://anilist.gitbook.io/anilist-apiv2-docs/
  - Terms: https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/terms-of-use

## 3. Non-Negotiable Product Requirements

### Navigation and Layout

- Mobile-first app shell with TV Time-like bottom tabs:
  - Shows
  - Movies
  - Explore
  - Profile
- Desktop layout should use a left rail or top navigation while preserving the same core routes.
- Anime, Games, and Books should be accessible through Explore and Library filters in v1. They do not need permanent bottom tabs in v1.
- Use the provided `app-icon.png` as the initial app icon and favicon source.
- UI should feel close to TV Time: poster grids, progress bars, compact cards, clear status chips, dark-friendly theme, quick mark-watched actions.
- Do not create a marketing landing page as the first screen. Logged-in users should land in the tracking app. Logged-out users should see a compact auth screen with product identity and login choices.

### Auth and Account

Use passkeys plus OAuth in v1.

- Passkey registration/login should be the preferred account flow.
- OAuth should be available for convenience. Start with one provider if needed, but design for more.
- Do not implement email/password in v1 unless explicitly requested later.
- Sessions must use secure, HTTP-only cookies.
- Store sessions in D1, not in JWT-only client state.
- Add rate limits for auth endpoints.
- Add CSRF protection for mutating requests.
- Users can set:
  - Display name
  - Username/handle
  - Bio
  - Avatar image
  - Banner image
  - Profile visibility
  - Preferred language/region

### Tracking

Support these media types:

- `show`
- `movie`
- `anime`
- `game`
- `book`

Shared tracking features:

- Add to library.
- Remove from library.
- Status.
- Favorite.
- Rating.
- Notes/review.
- Tags.
- Custom lists.
- Public/private visibility.
- Activity feed event.

Show/anime tracking:

- Show detail page.
- Season list.
- Episode list.
- Specials toggle.
- Mark episode watched/unwatched.
- Set watched date.
- Increment/decrement rewatch count.
- Bulk mark season watched/unwatched.
- Track progress by watched regular episodes.
- Preserve specials separately.
- Display next episode to watch.
- Upcoming episodes section.
- Distinguish ended, continuing, watch later, stopped, not started, up to date.

Movie tracking:

- Watchlist.
- Watched/unwatched.
- Watched date.
- Rewatch count.
- Upcoming/unreleased movie section.
- Favorite.
- Rating/reaction/comment.

Game tracking:

- Statuses: planned, playing, completed, dropped, paused.
- Platform.
- Progress notes.
- Optional playtime hours.
- Release date and upcoming games.
- Rating/review.

Book tracking:

- Statuses: want to read, reading, finished, paused, dropped.
- Progress by page or percent.
- Author, cover, publish year.
- Rating/review.

### TV Time-Like Sections

Shows page:

- Watch Next
- Continue Watching
- Haven't Watched For A While
- Watch Later
- Upcoming
- Up To Date
- Stopped
- All Shows

Movies page:

- Watchlist
- Watched
- Favorites
- Upcoming
- All Movies

Explore page:

- Global search across cached local media first.
- Search external APIs when local cache has insufficient results.
- Filter by media type.
- Filter by genre/status/year where available.
- Trending/popular rows.
- Personalized suggestions based on watched/favorite genres and similar media.
- User search.

Profile page:

- Avatar and banner.
- Counts by media type.
- TV time/movie time/book/game stats where durations/pages/hours are known.
- Recent activity.
- Favorite media.
- Custom lists.
- Badges placeholder.
- Public profile view.

Social:

- User search.
- Follow/connect request.
- Accept/reject connection.
- Connection list.
- Friend activity feed.
- Direct messaging.
- Message read timestamps.
- Basic block/report controls can be schema-backed in v1, even if minimal UI.

Comments, reactions, spoiler gates:

- Comments can attach to a media item or an episode.
- Episode comments are hidden from a user until that user has watched the episode.
- Movie comments are hidden until the user has watched the movie.
- Show-level comments can be visible, but episode-specific spoilers must remain gated.
- Reactions should be implemented as a small fixed set in v1.
- Character voting can be deferred unless TMDB data makes it cheap, but the schema should not block adding it later.

Lists:

- User-created mixed-media lists.
- List title, description, visibility.
- Add/remove/reorder list items.
- Public list page.
- Lists can include shows, movies, anime, games, and books.

## 4. Technical Stack

### Runtime and Hosting

- Cloudflare Workers
- Workers Static Assets
- Cloudflare D1
- Cloudflare R2
- Wrangler

### Frontend

- React
- Vite
- TypeScript
- React Router
- TanStack Query
- Zustand
- Tailwind CSS
- lucide-react
- Zod for shared validation where useful
- Papa Parse for client-side CSV parsing

### Backend

- Hono
- TypeScript
- Drizzle ORM
- Drizzle Kit
- Zod
- SimpleWebAuthn for passkeys
- Arctic for OAuth providers
- Standard Web Crypto APIs for secure random IDs and token hashing

### Testing and Tooling

- Vitest
- Cloudflare Workers Vitest integration or Miniflare-backed tests
- React Testing Library
- Playwright
- ESLint
- Prettier
- TypeScript strict mode
- Bundle analyzer for phase gates

### Styling and Design Rules

- Use a compact, app-first layout.
- Use cards for repeated media items, not nested card-heavy page sections.
- Use icon buttons with tooltips for common actions.
- Use posters/backdrops from metadata providers only through approved image URLs or cached variants.
- Lazy-load images.
- Use fixed aspect-ratio poster containers.
- Avoid layout shift in poster grids, episode rows, and dashboard sections.
- Use a restrained palette inspired by TV Time and the provided app icon: dark neutral surfaces, yellow/orange accent, readable status colors.

## 5. Architecture

### High-Level Shape

The app should be a static SPA plus API Worker:

- Static assets: Vite-built client.
- API Worker: Hono routes under `/api/*`.
- D1: relational app data, normalized user data, cache index.
- R2: user-uploaded avatars/banners and optional media image cache.
- External APIs: called through backend only when secrets/API keys are required. Public/no-key endpoints may still go through backend for consistent caching.

### Performance Rules

- Do not SSR normal app pages.
- Do not import large server libraries if a small native implementation works.
- Do not parse the full 11.9 MB TV Time series JSON in the Worker.
- The browser should parse import files and send normalized chunks.
- Worker import endpoints should accept bounded chunks and validate with Zod.
- Keep hot API endpoints under a small number of D1 queries.
- Use pagination everywhere lists can grow.
- Use local-first search against cached DB rows before external API calls.
- Use `ctx.waitUntil()` only for non-critical post-response work.
- Every Promise must be awaited, returned, explicitly voided, or passed to `ctx.waitUntil()`.
- No request-scoped mutable state at module scope.
- No hardcoded secrets.

### API Design

Use `/api` routes grouped by domain:

- `/api/auth/*`
- `/api/me`
- `/api/users/*`
- `/api/media/*`
- `/api/library/*`
- `/api/episodes/*`
- `/api/lists/*`
- `/api/explore/*`
- `/api/imports/*`
- `/api/social/*`
- `/api/messages/*`
- `/api/uploads/*`

Responses should use a consistent envelope:

- `data` for success.
- `error` with code/message/details for failure.
- Pagination should use stable cursors where possible, otherwise page/limit for low-risk lists.

### Database Model

Use D1 with Drizzle migrations. Keep the model normalized but not over-engineered.

Core tables:

- `users`
- `user_profiles`
- `sessions`
- `oauth_accounts`
- `webauthn_credentials`
- `media_items`
- `media_external_ids`
- `media_genres`
- `seasons`
- `episodes`
- `user_media`
- `episode_activity`
- `ratings`
- `reactions`
- `comments`
- `lists`
- `list_items`
- `follows`
- `connection_requests`
- `activity_events`
- `conversations`
- `conversation_members`
- `messages`
- `uploads`
- `api_cache`
- `import_jobs`
- `import_job_items`
- `import_warnings`

Important design requirements:

- `media_items.type` must support show/movie/anime/game/book.
- External IDs must support at least `tvdb`, `imdb`, `tmdb`, `rawg`, `openlibrary`, `isbn`.
- `user_media` must store per-user status independently from the canonical media item.
- Episode watched history must be per user and preserve `watched_at`, `watched_count`, and `rewatch_count`.
- Import jobs must be resumable and auditable.
- Keep original TV Time identifiers and raw source hints where needed for debugging import mismatches.

### Status Mapping

TV Time series statuses:

- `up_to_date`: user is current with known available episodes.
- `continuing`: user is actively watching but not current.
- `watch_later`: user intends to watch later.
- `not_started_yet`: user added the show but has not started.
- `stopped`: user stopped/dropped.

Internal normalized statuses:

- Shows/anime: `watch_later`, `not_started`, `watching`, `up_to_date`, `completed`, `stopped`.
- Movies: `watch_later`, `watched`.
- Games: `planned`, `playing`, `completed`, `paused`, `dropped`.
- Books: `want_to_read`, `reading`, `finished`, `paused`, `dropped`.

The importer should preserve the raw TV Time status and also map it to the normalized status. If mapping is ambiguous, preserve raw status and show a review warning.

### External Metadata Cache

Every external API lookup must be cached.

Cache policy:

- Search result cache: short TTL, around 1 to 7 days.
- Media detail cache: longer TTL, around 30 days.
- External ID mapping cache: long TTL, around 90 days.
- Failed lookups: short negative cache, around 1 day.
- Manual user edits override external metadata display where applicable.

Do not use Open Library as a bulk backend. For books, search only in response to user action or import needs, identify requests with User-Agent/email, and cache results.

## 6. TV Time Import Plan

### Import UX

Build a dedicated import wizard:

1. Select files.
2. Browser parses and validates the files.
3. Show detected counts and file health.
4. Show summary warnings from `tvtime-summary-2026-05-07.html`.
5. Dry-run normalization.
6. Review unmatched/ambiguous entries.
7. Commit import in chunks.
8. Start metadata hydration.
9. Show final import report.

The user should be able to cancel before commit. After commit, provide a rollback option tied to the import job.

### Import Data Rules

Series JSON is the source of truth for rich episode data:

- Show UUID.
- TVDB ID.
- IMDb ID where present.
- Title.
- Raw status.
- Favorite.
- Created date.
- Seasons.
- Episode TVDB IDs.
- Episode numbers.
- Episode names.
- Specials.
- Watched state.
- Watched date.
- Rewatch count.
- Watched count.

Series episode CSV is the cross-check source:

- Validate row counts.
- Validate watched counts.
- Fill gaps if JSON and CSV disagree.

Movie JSON is the source of truth for movie richness:

- UUID.
- TVDB ID.
- IMDb ID.
- Title.
- Year.
- Watched date.
- Watched state.
- Favorite.
- Rewatch count.

CSV files are fallback and validation sources.

HTML summary is not the primary data source, but it must be parsed or referenced for:

- Expected count validation.
- User-visible warnings.
- Known TV Time anomaly explanation.

### Import Chunking

The browser should normalize data into chunks like:

- Media items chunk.
- Seasons chunk.
- Episodes chunk.
- User media statuses chunk.
- Episode activity chunk.
- Movie activity chunk.

Each chunk must include:

- Import job ID.
- Chunk sequence.
- Stable client-generated idempotency key.
- Payload count.
- Payload checksum or count validation.

Worker should:

- Validate chunk size.
- Reject chunks above configured payload size.
- Use transactions where supported.
- Make chunk handling idempotent.
- Record item-level warnings instead of failing the whole import when possible.

### Metadata Matching

Use this matching order:

1. Existing cached media by TVDB/IMDb/TMDB/external ID.
2. TMDB `/find` using IMDb ID when available.
3. TMDB TV/movie search by title/year.
4. Store placeholder if no confident match.
5. Let user manually resolve unmatched items later.

For TVDB-only shows, keep TVDB ID even if TMDB cannot match immediately.

## 7. Phase Plan

Each phase must end with a checkpoint. Do not start the next phase until all checkpoint items pass.

### Phase 0: Repository and Project Baseline

Goal:

Create a clean app foundation and decision records before feature work begins.

Implementation details:

- Initialize package structure.
- Add TypeScript strict configuration.
- Add Vite React app.
- Add Worker API package or app folder.
- Add shared types/validation package if using a monorepo layout.
- Add Wrangler config for Workers Static Assets, D1, and R2.
- Add environment variable documentation.
- Add README with local dev, test, and deploy commands.
- Add ADR notes for:
  - Static SPA plus Hono API instead of SSR.
  - D1 as primary database.
  - R2 for user uploads.
  - TMDB/RAWG/Open Library provider choices.
  - Passkeys plus OAuth auth strategy.

Testing gate:

- TypeScript compiles.
- Vite build succeeds.
- Worker local dev starts.
- Empty API health route returns success.
- Bundle report is generated.
- No secrets committed.

Acceptance gate:

- A contributor can clone, install, run dev, run tests, and build without undocumented steps.

### Phase 1: App Shell and Design System

Goal:

Build the responsive app shell and reusable UI foundations.

Implementation details:

- Create route structure:
  - `/`
  - `/auth`
  - `/shows`
  - `/movies`
  - `/explore`
  - `/profile/:username?`
  - `/media/:type/:id`
  - `/lists/:id`
  - `/messages`
  - `/settings`
  - `/import/tv-time`
- Implement logged-out auth screen.
- Implement logged-in app shell.
- Add bottom mobile navigation.
- Add desktop navigation.
- Add media card, poster grid, progress bar, status chip, empty state, skeleton, modal, toast, tabs, segmented controls, and icon button components.
- Add dark/light/system theme support if cheap; otherwise ship a polished dark-first theme with later theme toggle.
- Add app icon and favicon from `app-icon.png`.
- Add responsive image containers with fixed aspect ratios.

Testing gate:

- Component tests for core UI states.
- Playwright verifies mobile and desktop navigation.
- No text overlaps at mobile and desktop sizes.
- Lighthouse-style local check confirms no large layout shift in shell.

Acceptance gate:

- The app looks like a usable tracker before data is connected.

### Phase 2: Data Layer, Auth, and Profiles

Goal:

Implement secure user accounts and basic profile data.

Implementation details:

- Create initial D1 migrations:
  - users
  - profiles
  - sessions
  - OAuth accounts
  - WebAuthn credentials
  - uploads
- Implement passkey registration and login.
- Implement OAuth login with one provider first, keeping provider abstraction extensible.
- Store sessions in D1.
- Use HTTP-only secure cookies.
- Add CSRF protection for mutating routes.
- Add auth middleware for protected API routes.
- Add user profile CRUD:
  - display name
  - username
  - bio
  - avatar
  - banner
  - visibility
- Add R2 upload flow for avatar/banner.
- Add profile page and settings page.

Testing gate:

- Unit tests for session creation, expiry, and lookup.
- Integration tests for auth-protected routes.
- WebAuthn flow tested with mocked/controlled challenge handling.
- OAuth callback tested with mocked provider response.
- Upload route rejects invalid file types and oversized files.
- Profile update validation tests pass.

Acceptance gate:

- A user can register/login, stay logged in, edit profile, upload avatar/banner, and log out.

### Phase 3: Core Media and Library Model

Goal:

Create the unified tracking model for all media types.

Implementation details:

- Add migrations for:
  - media items
  - external IDs
  - genres
  - seasons
  - episodes
  - user media
  - episode activity
  - ratings
  - reactions
  - comments
  - activity events
- Implement media CRUD internals.
- Implement add/remove from library.
- Implement status transitions by media type.
- Implement favorite toggle.
- Implement rating.
- Implement private notes/review field.
- Implement watched date and rewatch count for movies.
- Implement episode watched/unwatched, watched date, and rewatch count.
- Implement derived progress calculation.
- Implement activity event creation for tracking actions.
- Build basic media detail pages from local placeholder data.

Testing gate:

- Unit tests for status mappings.
- Unit tests for progress calculations, including specials.
- Unit tests for rewatch count and watched count.
- Integration tests for add/remove/status/favorite/rating APIs.
- Integration tests for episode watched/unwatched APIs.
- Spoiler-gate helper tests.

Acceptance gate:

- Users can manually create or add placeholder media, track episodes/movies, and see progress reflected in the UI.

### Phase 4: Shows, Movies, and Dashboard Experience

Goal:

Build the core TV Time-like tracking views for shows and movies.

Implementation details:

- Shows page sections:
  - Watch Next
  - Continue Watching
  - Haven't Watched For A While
  - Watch Later
  - Upcoming
  - Up To Date
  - Stopped
  - All Shows
- Movie page sections:
  - Watchlist
  - Watched
  - Favorites
  - Upcoming
  - All Movies
- Implement poster grid and list/compact view where useful.
- Add progress bars to show cards.
- Add quick action to mark next episode watched.
- Add season/episode page controls.
- Add filters and sort controls.
- Add empty states for new accounts.
- Add local pagination or incremental loading.

Testing gate:

- Component tests for every dashboard section.
- Integration tests for dashboard query outputs.
- Playwright tests for mobile watch-next flow.
- Playwright tests for movie watched flow.
- Regression test: progress bars remain stable and do not resize cards.

Acceptance gate:

- The main TV Time replacement workflow is usable without import or external APIs.

### Phase 5: TV Time Import and Migration

Goal:

Import the provided TV Time data accurately and safely.

Implementation details:

- Build `/import/tv-time` wizard.
- Support JSON, CSV, and summary HTML upload.
- Parse large files in browser.
- Use Papa Parse for CSV.
- Use browser JSON parsing for JSON, with clear error handling.
- Normalize files into import chunks.
- Add import job schema and APIs:
  - create job
  - dry run
  - upload chunk
  - commit job
  - rollback job
  - job status
  - warning list
- Validate detected counts against known export totals.
- Import shows, seasons, episodes, watched states, watched dates, favorites, raw statuses, normalized statuses, rewatch counts, and watched counts.
- Import movies, watched states, watched dates, favorites, rewatch counts, TVDB IDs, IMDb IDs, year, and raw UUID.
- Store all source IDs.
- Create placeholder media immediately before metadata hydration.
- Show unmatched and warning report after import.
- Preserve all raw TV Time dates and display timezone warning.

Testing gate:

- Fixture tests for each provided export schema.
- Dry-run import count must match:
  - 647 shows
  - 2,063 seasons
  - 32,452 episode rows
  - 11,646 watched episodes
  - 111 watched specials
  - 332 rewatched episode rows
  - 1,050 movies
  - 658 watched movies
- Import integration test verifies idempotent chunk retry.
- Rollback test removes only records created by that import job.
- UI test completes dry-run and review flow.

Acceptance gate:

- The user's TV Time data can be imported with count validation and no loss of watched history.

### Phase 6: External Metadata and Explore

Goal:

Connect metadata providers and build search/discovery.

Implementation details:

- Add provider abstraction:
  - search
  - get details
  - find by external ID
  - normalize result
  - attribution
  - cache policy
- Implement TMDB provider:
  - movie search
  - TV search
  - external ID lookup
  - image URL handling
  - trending/popular/discover rows
- Implement RAWG provider:
  - game search
  - game details
  - popular/upcoming game rows
  - attribution/backlink display
- Implement Open Library provider:
  - book search
  - work/edition details
  - cover URLs
  - User-Agent/email identification
  - low-rate caching
- Implement API cache table and cache helpers.
- Implement local-first global search.
- Implement Explore page:
  - all media search
  - media type filters
  - trending rows
  - genre rows
  - recommended rows
  - user search section
- Implement metadata hydration queue-like flow:
  - chunked batches
  - explicit user-triggered retry
  - safe `ctx.waitUntil()` only for small post-response work
  - no unbounded fan-out

Testing gate:

- Provider unit tests with mocked external responses.
- Cache hit/miss tests.
- 429/retry-after behavior tests.
- Attribution rendering tests for RAWG/Open Library.
- Playwright test for search and add-to-library flow.
- Import hydration test for TVDB/IMDb matching fallback.

Acceptance gate:

- Users can search, discover, add media, and hydrate imported items without exhausting Worker limits.

### Phase 7: Anime, Games, and Books Tracking UX

Goal:

Make non-TV/movie media feel first-class enough for v1.

Implementation details:

- Add Anime collection/filter view using the shared show/movie model.
- Allow anime entries to be represented as show or movie format underneath while displaying category as anime.
- Add Games library view:
  - planned
  - playing
  - completed
  - paused
  - dropped
  - platform
  - playtime/progress notes
- Add Books library view:
  - want to read
  - reading
  - finished
  - paused
  - dropped
  - page/percent progress
  - author metadata
- Add media-type-specific status controls.
- Add unified "All Library" filters.
- Ensure lists support every media type.

Testing gate:

- Unit tests for game/book status transitions.
- Integration tests for game/book add/update/remove.
- Playwright tests for adding a game and updating status.
- Playwright tests for adding a book and updating progress.
- UI regression test for mixed-media list rendering.

Acceptance gate:

- Shows, movies, anime, games, and books can all be searched or created, tracked, listed, rated, and shown on the profile.

### Phase 8: Lists, Social, Comments, and Messaging

Goal:

Implement the basic community layer requested for v1.

Implementation details:

- Lists:
  - create/edit/delete list
  - add/remove/reorder items
  - mixed media types
  - public/private visibility
  - list detail page
- Comments:
  - media-level comments
  - episode-level comments
  - spoiler gate
  - delete own comment
  - basic moderation placeholders
- Reactions:
  - fixed reaction set
  - attach to media or episode
- Connections:
  - user search
  - send request
  - accept/reject request
  - follow/connection list
  - block user minimal flow
- Activity:
  - recent user activity
  - friend activity
  - profile activity
- Messaging:
  - conversation list
  - conversation detail
  - send message
  - read timestamp
  - async polling or refresh, not realtime WebSockets in v1

Testing gate:

- Integration tests for list CRUD and mixed media items.
- Spoiler gate tests for watched/unwatched users.
- Connection request state machine tests.
- Messaging integration tests.
- Playwright tests for creating a list, connecting to a user, and sending a message.
- Privacy tests ensure private lists and gated comments are not leaked.

Acceptance gate:

- Users can create lists, interact through comments/reactions safely, connect with other users, and exchange messages.

### Phase 9: Stats, Badges, Recommendations, and Profile Polish

Goal:

Deliver the satisfying TV Time-like profile and lightweight recommendation loop.

Implementation details:

- Add profile stats:
  - shows tracked
  - episodes watched
  - movies watched
  - games completed
  - books finished
  - rewatch counts
  - favorites
  - watch time where runtime exists
- Add simple charts:
  - watched by month
  - media type distribution
  - genre distribution
- Add badge framework:
  - first import
  - first show completed
  - first movie watched
  - rewatch milestone
  - list creator
  - social starter
- Add recommendation heuristics:
  - favorite genres
  - completed similar media
  - watch later gaps
  - popular/trending fallback
- Add settings for privacy and language/region preferences.

Testing gate:

- Unit tests for stat calculations.
- Unit tests for badge awarding idempotency.
- Recommendation tests with seeded libraries.
- Playwright profile stats and badge display tests.

Acceptance gate:

- Profiles feel alive and useful, and Explore can suggest relevant items without heavy ML or expensive APIs.

### Phase 10: Performance, Reliability, and Deployment

Goal:

Make the app production-ready for a personal Cloudflare Worker.

Implementation details:

- Audit Worker bundle size.
- Audit client chunk sizes.
- Add route-level lazy loading where needed.
- Add D1 indexes for hot queries.
- Add pagination to all unbounded endpoints.
- Add structured API errors.
- Add structured logging.
- Add Cloudflare observability config.
- Add backup/export endpoint for user data.
- Add import rollback documentation.
- Add deployment docs.
- Add privacy/security checklist.
- Add seed/demo data for local testing.

Testing gate:

- Full unit test suite passes.
- Full integration suite passes.
- Full Playwright suite passes on desktop and mobile.
- Vite production build passes.
- Worker deploy dry-run or local Wrangler validation passes.
- Performance checks:
  - Worker bundle remains below the configured target.
  - Initial client route is reasonably small.
  - Dashboard APIs use bounded D1 queries.
  - Import chunk endpoint handles retries and rejects oversized chunks.

Acceptance gate:

- App is ready to deploy to the personal Cloudflare account.

## 8. Definition of Done for V1

V1 is complete when:

- User can register/login with passkey or OAuth.
- User can edit profile, avatar, and banner.
- User can import the provided TV Time exports with validated counts.
- Imported shows, episodes, movies, favorites, statuses, watched dates, specials, and rewatch counts are preserved.
- User can search and add shows, movies, anime, games, and books.
- User can track progress for all supported media types.
- User can create mixed-media lists.
- User can use Explore search and suggestions.
- User can connect with another user.
- User can send direct messages.
- Spoiler-gated comments work.
- Profile stats and recent activity work.
- App is responsive on mobile and desktop.
- Tests pass for each phase.
- The deployed Worker stays within targeted CPU, memory, query, and bundle constraints.

## 9. Out of Scope for V1

Do not implement these unless explicitly reprioritized:

- Native iOS/Android apps.
- Realtime WebSocket chat.
- Push notifications.
- Paid subscriptions.
- AI recommendations.
- Full streaming availability lookup.
- AniList-powered anime tracking without terms review or authorization.
- Multi-tenant public-scale operation.
- Heavy server-side rendering.
- Bulk scraping external providers.

## 10. Implementation Principles

- Keep the app fast before making it fancy.
- Use static assets and client-side routing for the main UI.
- Keep Worker endpoints small and bounded.
- Cache external metadata by default.
- Make import resumable and auditable.
- Preserve user history exactly, even when metadata matching fails.
- Prefer explicit simple data models over clever abstractions.
- Keep media-type-specific behavior behind shared interfaces.
- Use TypeScript strict mode and Zod validation at boundaries.
- Add tests in the same phase as the feature.
- Do not move to the next phase until the phase gate passes.

## 11. Suggested Build Order Checklist

1. Scaffold and configure the project.
2. Build the app shell.
3. Implement auth and profiles.
4. Implement unified media tracking.
5. Build shows/movies dashboards.
6. Build TV Time import.
7. Add metadata providers and Explore.
8. Add anime/games/books UX.
9. Add lists/social/comments/messages.
10. Add stats/badges/recommendations.
11. Optimize, test, and deploy.

## 12. Notes for the Implementer

- The app name is **Tuvu** unless the user renames it later.
- Use the provided icon at `assets\app-icon.png` as the initial brand asset.
- Treat the TV Time export data as personal user data. Do not commit the export files into the repo.
- Any API keys must be documented as environment variables and stored as Cloudflare secrets for deployment.
- Keep attribution visible where provider terms require it.
- For Open Library, include a real app User-Agent and contact email in configuration before production use.
- For TMDB, follow TMDB attribution and image URL rules.
- For RAWG, include backlinks/attribution on pages using RAWG data/images.
