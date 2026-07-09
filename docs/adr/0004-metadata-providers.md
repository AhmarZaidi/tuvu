# ADR 0004: TMDB, RAWG, and Open Library Providers

## Status

Accepted

## Context

Tuvu tracks shows, movies, anime, games, and books. It needs reliable metadata
sources while staying inside free or hobby-friendly usage patterns.

## Decision

Use TMDB for shows, movies, and anime entries when adequate; RAWG for games; and
Open Library for books. Cache all external lookups through the Worker and store
provider attribution requirements with normalized provider responses.

## Consequences

- Provider keys and contact details are environment configuration, not committed
  source.
- Search should prefer cached local media before external calls.
- Anime provider expansion requires a separate terms review.
