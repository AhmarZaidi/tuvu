-- Phase 4: dashboard performance and provider-ready detail metadata.

ALTER TABLE user_media ADD COLUMN progress_value REAL;
ALTER TABLE user_media ADD COLUMN progress_total REAL;
ALTER TABLE user_media ADD COLUMN progress_unit TEXT;
ALTER TABLE user_media ADD COLUMN platform TEXT;

ALTER TABLE episode_activity ADD COLUMN rating INTEGER CHECK(rating IS NULL OR (rating >= 1 AND rating <= 10));
ALTER TABLE episode_activity ADD COLUMN notes TEXT;

CREATE TABLE media_metadata (
  media_id TEXT PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
  original_title TEXT,
  tagline TEXT,
  end_date TEXT,
  homepage_url TEXT,
  trailer_url TEXT,
  content_rating TEXT,
  popularity REAL,
  provider_rating REAL,
  provider_vote_count INTEGER,
  air_day TEXT,
  air_time TEXT,
  air_timezone TEXT,
  author_names_json TEXT,
  developer_names_json TEXT,
  publisher_names_json TEXT,
  page_count INTEGER,
  raw_source_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE media_images (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('poster','backdrop','still','logo','gallery')),
  url TEXT NOT NULL,
  provider TEXT,
  provider_path TEXT,
  width INTEGER,
  height INTEGER,
  language TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(media_id, kind, url)
);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  biography TEXT,
  profile_path TEXT,
  birth_date TEXT,
  death_date TEXT,
  birth_place TEXT,
  homepage_url TEXT,
  social_links_json TEXT,
  source TEXT NOT NULL,
  source_id TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(source, source_id)
);

CREATE TABLE media_credits (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  job TEXT,
  character_name TEXT,
  episode_count INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(media_id, person_id, department, job, character_name)
);

CREATE TABLE media_external_ratings (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  value REAL NOT NULL,
  scale REAL NOT NULL,
  vote_count INTEGER,
  url TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(media_id, source)
);

-- Optional provider/manual hierarchy for books and games. Providers often omit
-- chapters or missions, so rows are nullable and media remains trackable without them.
CREATE TABLE media_units (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES media_units(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('part','chapter','act','mission','quest')),
  position INTEGER NOT NULL,
  title TEXT,
  overview TEXT,
  image_path TEXT,
  release_date TEXT,
  external_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(media_id, parent_id, kind, position)
);

CREATE TABLE unit_activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES media_units(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  rating INTEGER CHECK(rating IS NULL OR (rating >= 1 AND rating <= 10)),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, unit_id)
);

CREATE INDEX idx_user_media_dashboard ON user_media(user_id, status, updated_at DESC);
CREATE INDEX idx_media_images_media ON media_images(media_id, kind, sort_order);
CREATE INDEX idx_media_credits_media ON media_credits(media_id, sort_order);
CREATE INDEX idx_media_units_media ON media_units(media_id, parent_id, position);
CREATE INDEX idx_unit_activity_user ON unit_activity(user_id, media_id);
