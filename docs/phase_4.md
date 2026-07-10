# Phase 4 Implementation and Test Checklist

This file is the resumable source of truth for Phase 4 work. Update each item as soon as it is verified.

## Decisions

- [x] Keep D1 canonical rows compact; rich provider metadata is nullable and normalized into related tables.
- [x] Resolve TV Time entries against provider/external IDs before creating placeholders when Phase 5 imports run.
- [x] Preserve a lightweight placeholder fallback for unmatched imports so tracking history is never lost.
- [x] Treat show/anime seasons as independently sized; never assume equal episode counts.
- [x] Use generic trackable units for optional book chapters and game missions/chapters/acts.
- [x] Render provider-only detail sections conditionally; do not fabricate data before Phase 6 hydration.
- [x] Books and games can have Upcoming dashboard sections based on future release dates.
- [x] Media detail artwork is responsive: mobile uses a top backdrop banner plus poster fade, desktop uses backdrop fade plus a fixed poster column.

## Data and API

- [x] Add Phase 4 migration for rich media metadata, images, people/credits, generic units, and user progress.
- [x] Extend shared validation for optional provider/import fields and unequal season episode counts.
- [x] Add bounded dashboard query API for shows, movies, books, and games.
- [x] Add next-episode quick action support without N+1 dashboard queries.
- [x] Add season bulk watched/unwatched controls.
- [x] Add generic unit detail/activity APIs for book/game tracking.
- [x] Add dedicated episode/unit detail API responses.

## Client UX

- [x] Implement every required show dashboard section.
- [x] Implement every required movie dashboard section.
- [x] Implement useful book and game dashboard sections.
- [x] Add filters, sorting, grid/compact views, and incremental loading.
- [x] Keep dashboard sort compact on mobile with an icon button/dropdown next to search.
- [x] Add stable progress cards and useful empty states.
- [x] Replace equal-episode creation with per-season controls and optional metadata fields.
- [x] Polish auth mode controls on mobile and desktop.
- [x] Remove the stale Phase 1 notice.
- [x] Redesign media detail around a backdrop, metadata, tracking controls, and conditional rich sections.
- [x] Move media cover upload and destructive media actions into the detail settings sheet.
- [x] Color watched/completed episode and unit toggle buttons clearly.
- [x] Add collapsible season/unit groups and dedicated episode/unit routes.
- [x] Use mobile bottom sheets and centered desktop dialogs for editing controls.

## Tests and Verification

- [x] Unit tests cover dashboard classification and sorting.
- [x] Integration tests cover each dashboard output and pagination bounds.
- [x] Tests cover unequal season sizes and bulk season actions.
- [x] Tests cover episode/unit detail activity.
- [x] Component tests cover dashboard shell and stable progress-card structure.
- [x] TypeScript strict compilation passes.
- [x] Vitest suite passes.
- [x] Vite production build passes and bundle report is generated.
- [x] Local D1 migration applies cleanly.
- [x] Worker starts and dashboard/detail smoke checks pass.
- [ ] Mobile and desktop browser checks show no overlap or broken navigation.

## Deferred By Provider Or Social Dependencies

- Phase 6 populates gallery images, trailers, genres, provider ratings, popularity, localized air times, credits/cast, person pages, and related-media rows using the normalized Phase 4 tables.
- Phase 8 activates media/episode/unit comments, spoiler-safe community counts, reactions, and list actions. Phase 4 detail routes already expose the watched/completed gates those views require.
- Open Library and RAWG do not reliably provide chapter/mission structures. Tuvu therefore supports optional manual/imported units while numeric page/percent/hour progress remains available for every book or game.

## Manual UX Test Script

- [x] Create a show with two seasons containing different episode counts.
- [ ] Mark the next episode watched from the Shows dashboard and confirm progress updates.
- [ ] Bulk mark a season, undo it, and confirm specials remain independent.
- [ ] Move a show through watch later, watching, up to date, and stopped sections.
- [ ] Add and mark a movie watched; confirm Watched and Favorites sections.
- [ ] Add a book and game; update status and progress.
- [ ] Open an episode/unit detail page and update watched/completed state, date, rating, and notes.
- [ ] Verify empty-account dashboards on a narrow phone viewport.
