# Phase 3: Core Media and Library Model Documentation

This document explains the schema decisions, status mappings, progress calculations, and spoiler-gate mechanics for Tuvu's tracking model, as well as commands for database resets.

---

## 1. Schema & Table Structure

The core tracking model is backed by 11 relational tables:

1. **`media_items`**: The canonical catalog. Tracks type (`show`, `movie`, `anime`, `game`, `book`), title, poster path, release year, runtime, and the metadata source (e.g. TMDB, manual).
2. **`media_external_ids`**: Maps internal media IDs to external metadata providers (`imdb`, `tvdb`, `tmdb`, etc.) to ease duplicate checks and sync.
3. **`media_genres`**: Tagging genres to items.
4. **`seasons`**: Shows/anime seasons metadata. Season `0` represents Specials.
5. **`episodes`**: Individual show/anime episodes.
6. **`user_media`**: Individual user tracking states (library items). Contains rating (1-10), favorite flag, status, rewatch count, and private notes.
7. **`episode_activity`**: Individual episode watched dates and rewatch counts.
8. **`reactions`**: Emoji reactions on items or episodes.
9. **`comments`**: Community discussion comments.
10. **`activity_events`**: Append-only audit logging of tracking activities (e.g. `add_library`, `status_changed`).

---

## 2. Status Mappings

Tracking status strings are strictly validated per media type:

- **Shows / Anime**:
  - `watch_later` (Watch later)
  - `not_started` (Not started yet - default)
  - `watching` (Currently watching)
  - `up_to_date` (Caught up with all aired episodes)
  - `completed` (Finished all seasons/episodes)
  - `stopped` (Dropped/stopped watching)
- **Movies**:
  - `watch_later` (Watchlist - default)
  - `watched` (Marked as watched)
- **Games**:
  - `planned` (Backlog - default)
  - `playing` (Currently playing)
  - `completed` (Finished/Beat)
  - `dropped` (Dropped)
- **Books**:
  - `want_to_read` (Plan to read - default)
  - `reading` (Currently reading)
  - `finished` (Finished reading)
  - `dropped` (Dropped)

---

## 3. Progress Calculations

### Shows / Anime
- **Regular Episodes** define overall watch progress.
- **Specials** (episodes belonging to Season 0 or with `is_special = 1`) are excluded from normal progress percentages to prevent specials from distorting completion rates.
- Progress is cached under `user_media.progress_episodes` for rapid list rendering.

$$\text{Progress \%} = \min\left(100, \text{round}\left(\frac{\text{watched regular episodes}}{\text{total regular episodes}} \times 100\right)\right)$$

### Movies
- Progress is binary. Either in watchlist (`progress = 0%`) or marked watched (`progress = 100%`).
- Marking a movie watched increments `rewatch_count` if it was already marked watched.

---

## 4. Spoiler Gate

To shield users from spoilers on community threads:
- Comments and reactions linked to specific episodes are gated behind a check.
- If the user has not marked the respective episode as watched, the content is hidden by default.

---

## 5. Database Reset and Resetting Supabase Storage

### 5.1 Local D1 Database Reset
To completely clear and rebuild your local D1 development database:

1. **Delete the local wrangler state directory** (where the local SQLite DB file is stored):
   - **bash/zsh**:
     ```sh
     rm -rf .wrangler/state/v3/d1
     ```
   - **PowerShell**:
     ```powershell
     Remove-Item -Recurse -Force .wrangler/state/v3/d1
     ```

2. **Rerun all migrations** to recreate tables:
   ```sh
   npx wrangler d1 migrations apply tuvu-dev --local
   ```

### 5.2 Production (Remote) D1 Database Reset
If you need to reset the remote D1 tables:

1. **Execute SQL drop command**:
   ```sh
   npx wrangler d1 execute tuvu --remote --command="DROP TABLE IF EXISTS episodes; DROP TABLE IF EXISTS seasons; DROP TABLE IF EXISTS media_genres; DROP TABLE IF EXISTS media_external_ids; DROP TABLE IF EXISTS media_items; DROP TABLE IF EXISTS user_media; DROP TABLE IF EXISTS episode_activity; DROP TABLE IF EXISTS reactions; DROP TABLE IF EXISTS comments; DROP TABLE IF EXISTS activity_events; DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS webauthn_credentials; DROP TABLE IF EXISTS auth_passwords; DROP TABLE IF EXISTS oauth_accounts; DROP TABLE IF EXISTS user_profiles; DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS d1_migrations;"
   ```

2. **Reapply remote migrations**:
   ```sh
   npx wrangler d1 migrations apply tuvu --remote
   ```

### 5.3 Resetting Supabase Storage Buckets
To clean up uploaded files:

1. Go to the [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to **Storage** in the left sidebar.
3. Select your bucket (e.g. `tuvu-avatars` or `tuvu-media-cache`).
4. Select all folders/files and click **Delete**.
