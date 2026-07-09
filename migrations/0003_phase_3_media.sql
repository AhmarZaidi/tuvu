-- Phase 3: Core Media and Library Model
-- Creates all tables for the unified tracking model

-- ─────────────────────────────────────────────────────────────
-- Media Items: canonical catalog entry for any media type
-- ─────────────────────────────────────────────────────────────
CREATE TABLE media_items (
  id             TEXT    PRIMARY KEY,
  type           TEXT    NOT NULL CHECK(type IN ('show','movie','anime','game','book')),
  title          TEXT    NOT NULL,
  overview       TEXT,
  poster_path    TEXT,
  backdrop_path  TEXT,
  air_status     TEXT,                              -- 'ended','continuing','upcoming','released'
  runtime_minutes INTEGER,                          -- per-episode (shows) or total (movies)
  release_date   TEXT,                              -- YYYY-MM-DD
  year           INTEGER,
  language       TEXT,
  country        TEXT,
  source         TEXT    NOT NULL DEFAULT 'manual', -- 'manual','tmdb','rawg','openlibrary','tvdb'
  source_id      TEXT,                              -- provider's primary ID
  total_episodes INTEGER,
  total_seasons  INTEGER,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- External ID mapping: TVDB, IMDb, TMDB, RAWG, OpenLibrary, ISBN
-- ─────────────────────────────────────────────────────────────
CREATE TABLE media_external_ids (
  id          TEXT PRIMARY KEY,
  media_id    TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  source      TEXT NOT NULL, -- 'tvdb','imdb','tmdb','rawg','openlibrary','isbn'
  external_id TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE(media_id, source)
);

-- ─────────────────────────────────────────────────────────────
-- Genres: many-per-item genre tags
-- ─────────────────────────────────────────────────────────────
CREATE TABLE media_genres (
  id       TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  UNIQUE(media_id, name)
);

-- ─────────────────────────────────────────────────────────────
-- Seasons: per show/anime season metadata
-- season_number=0 is the specials season (TV convention)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE seasons (
  id             TEXT    PRIMARY KEY,
  media_id       TEXT    NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  season_number  INTEGER NOT NULL,
  name           TEXT,
  overview       TEXT,
  poster_path    TEXT,
  episode_count  INTEGER,
  air_date       TEXT,
  is_special     INTEGER NOT NULL DEFAULT 0, -- 1 for season 0 / specials
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL,
  UNIQUE(media_id, season_number)
);

-- ─────────────────────────────────────────────────────────────
-- Episodes: individual episodes per show/anime
-- is_special=1 means it belongs to the specials season (season 0)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE episodes (
  id              TEXT    PRIMARY KEY,
  media_id        TEXT    NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  season_id       TEXT    REFERENCES seasons(id) ON DELETE SET NULL,
  season_number   INTEGER NOT NULL,
  episode_number  INTEGER NOT NULL,
  name            TEXT,
  overview        TEXT,
  still_path      TEXT,
  air_date        TEXT,
  runtime_minutes INTEGER,
  is_special      INTEGER NOT NULL DEFAULT 0,
  external_id     TEXT,   -- provider episode ID (e.g. TVDB episode ID)
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- User Media: per-user tracking state for a media item
-- ─────────────────────────────────────────────────────────────
CREATE TABLE user_media (
  id                TEXT    PRIMARY KEY,
  user_id           TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id          TEXT    NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  status            TEXT    NOT NULL,
  is_favorite       INTEGER NOT NULL DEFAULT 0,
  rating            INTEGER CHECK(rating IS NULL OR (rating >= 1 AND rating <= 10)),
  notes             TEXT,
  watched_at        TEXT,   -- for movies: ISO date when last watched
  rewatch_count     INTEGER NOT NULL DEFAULT 0,
  progress_episodes INTEGER NOT NULL DEFAULT 0, -- cached watched regular episode count
  visibility        TEXT    NOT NULL DEFAULT 'private'
                    CHECK(visibility IN ('public','connections','private')),
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  UNIQUE(user_id, media_id)
);

-- ─────────────────────────────────────────────────────────────
-- Episode Activity: per-user per-episode watched history
-- ─────────────────────────────────────────────────────────────
CREATE TABLE episode_activity (
  id            TEXT    PRIMARY KEY,
  user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episode_id    TEXT    NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  media_id      TEXT    NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  watched       INTEGER NOT NULL DEFAULT 0,
  watched_at    TEXT,
  rewatch_count INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  UNIQUE(user_id, episode_id)
);

-- ─────────────────────────────────────────────────────────────
-- Reactions: emoji reactions on media items or episodes
-- ─────────────────────────────────────────────────────────────
CREATE TABLE reactions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id   TEXT REFERENCES media_items(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
  reaction   TEXT NOT NULL CHECK(reaction IN ('love','like','dislike','funny','sad','wow')),
  created_at TEXT NOT NULL,
  UNIQUE(user_id, media_id, episode_id)
);

-- ─────────────────────────────────────────────────────────────
-- Comments: text comments on media or episodes
-- episode_id IS NOT NULL → spoiler-gated until user has watched
-- ─────────────────────────────────────────────────────────────
CREATE TABLE comments (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id   TEXT    REFERENCES media_items(id) ON DELETE CASCADE,
  episode_id TEXT    REFERENCES episodes(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- Activity Events: append-only audit log for user actions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE activity_events (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL, -- 'add_library','remove_library','episode_watched','episode_unwatched',
                             -- 'movie_watched','status_changed','rating_set','favorite_toggled'
  media_id   TEXT REFERENCES media_items(id) ON DELETE SET NULL,
  episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
  data_json  TEXT, -- JSON blob for extra context (e.g. old/new status)
  created_at TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX idx_media_items_type         ON media_items(type);
CREATE INDEX idx_media_items_source       ON media_items(source, source_id);
CREATE INDEX idx_user_media_user_id       ON user_media(user_id);
CREATE INDEX idx_user_media_user_status   ON user_media(user_id, status);
CREATE INDEX idx_user_media_user_type     ON user_media(user_id, media_id);
CREATE INDEX idx_episode_activity_user    ON episode_activity(user_id, media_id);
CREATE INDEX idx_episode_activity_ep      ON episode_activity(user_id, episode_id);
CREATE INDEX idx_episodes_media_season    ON episodes(media_id, season_number, episode_number);
CREATE INDEX idx_seasons_media_id         ON seasons(media_id);
CREATE INDEX idx_activity_events_user     ON activity_events(user_id, created_at);
CREATE INDEX idx_comments_media_id        ON comments(media_id);
CREATE INDEX idx_comments_episode_id      ON comments(episode_id);
