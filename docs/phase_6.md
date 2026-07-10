# Phase 6 Implementation and Test Checklist

This file is the resumable source of truth for external metadata and Explore work.

## Decisions

- [x] Keep Explore as the primary discovery page and route all top-bar searches to `/explore/search`.
- [x] Use local D1 media search first, then provider search with debounced client requests.
- [x] Cache provider search/discovery responses in D1 with explicit TTLs to protect Worker and provider limits.
- [x] Respect provider constraints: TMDB 429s, RAWG attribution/backlinks, and Open Library identified low-volume cached requests.
- [x] Do not fan out unbounded provider requests from a single user action.

## Data and API

- [x] Add provider API cache table.
- [x] Add provider abstraction for search, discovery, details, external ID lookup, attribution, and cache policy.
- [x] Add TMDB movie/show search and trending/popular rows.
- [x] Add RAWG game search and popular/upcoming rows.
- [x] Add Open Library book search and subject/trending rows.
- [x] Add local-first global search API.
- [x] Add provider-result add-to-library flow that creates/reuses compact canonical media rows.
- [ ] Add richer detail hydration batches for imported placeholders.
- [ ] Add explicit user-triggered retry endpoint for failed hydration batches.

## Client UX

- [x] Top search box navigates to Explore search and updates results with debounce.
- [x] Explore main page shows cached rows for trending, popular, upcoming, and recommendations.
- [x] Search results include type filters, tracked-state hints, provider attribution, and add actions.
- [x] Explore rows hide items already tracked by the current user when possible.
- [ ] Add user search section once social profile search exists.

## Tests and Verification

- [ ] Provider unit tests with mocked external responses.
- [ ] Cache hit/miss tests.
- [ ] 429/retry-after behavior tests.
- [ ] Attribution rendering tests for RAWG/Open Library.
- [ ] Search and add-to-library browser flow.
- [ ] Import hydration fallback test for TVDB/IMDb matching.
