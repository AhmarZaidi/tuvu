# Phase 7: Anime, Games, and Books Tracking UX

This is the resumable checklist for Phase 7.

## Decisions

- [x] Keep anime represented by the existing `show`, `movie`, or `anime` media model, but display anime-specific badges and metadata when `type === "anime"` or extended metadata marks it as anime.
- [x] Keep canonical/provider metadata app-scoped in `media_items.extended_data_json`.
- [x] Keep user tracking data user-scoped in `user_media`, `episode_activity`, and `unit_activity`.
- [x] Do not add AniList as a primary provider in v1 because the master plan already flags terms concerns for tracker-like apps.
- [x] Do not treat Open Library as a bulk chapter/review backend. Use low-volume, cached, identified requests for bibliographic metadata; support manual/imported units for chapters/parts.
- [x] Store richer game user choices in the existing `user_media.platform` field as JSON when needed, while preserving older plain text platform values.

## Implementation Checklist

- [x] Add Phase 7 checklist and decisions.
- [x] Add anime-specific detail panels for language/audio, voice cast placeholders, studios, and MAL-style ratings placeholders.
- [x] Add book-specific detail panels for ISBN/editions, authors, characters, reviews, related books, and synopsis/cover context.
- [x] Add game-specific detail panels for platforms, stores, studios, playtime, requirements, trailer, characters, reviews, and ratings.
- [x] Polish book/game progress controls with page/percent/hour modes, playtime, platform multi-select, purchase library, and started-at quick actions.
- [x] Add All Library mixed-media filter page using existing library API.
- [x] Add bounded library API limit support so mixed-media filters can load a large local library without unbounded queries.
- [x] Add tests for game/book status transitions and progress metadata compatibility.
- [ ] Add Playwright coverage for adding a game/book and updating status/progress.
- [ ] Add provider hydration for RAWG game detail and Open Library work/edition detail beyond current search result metadata.

## Provider Notes

- Open Library: official docs request caching, identified `User-Agent` + email, and low-volume human-triggered usage. It is not suitable as a high-traffic or bulk chapter/review backend.
- RAWG: remains the v1 game source for search/discovery; detail hydration should stay cached and bounded.
- Anime: TMDB remains the v1 source where adequate. MAL/Jikan-style ratings can be displayed when metadata exists, but a primary anime provider needs a separate compliance/rate-limit review.

## UX Test Notes

- Open an anime media page and confirm it shows an Anime chip plus anime metadata panels.
- Open a book page and confirm book-specific panels and progress units are shown.
- Open a game page and confirm platform/store/playtime controls are shown.
- Open All Library and filter by media type/status/query.
