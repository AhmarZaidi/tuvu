# Phase 5 Implementation and Test Checklist

This file is the resumable source of truth for TV Time import work. Update it as implementation and verification progress.

## Decisions

- [x] Accept either the full TV Time export ZIP or individual JSON/CSV/HTML files.
- [x] Parse ZIP/CSV/JSON/HTML in the browser; the Worker only receives bounded normalized chunks.
- [x] Prefer TV Time JSON for rich show/episode data; use CSV files as fallback and count validation.
- [x] Store raw TV Time IDs, UUIDs, statuses, dates, watched counts, and rewatch counts.
- [x] Resolve existing canonical media by external IDs before creating placeholders.
- [x] Keep rollback auditable by recording every canonical row created by an import job.
- [x] Treat retrying chunk upload and commit as idempotent.
- [x] Keep Explore as a primary shell page; Profile owns Notifications, Messages, Settings, and Import.

## Data and API

- [x] Add import job, item, warning, and created-record tables.
- [x] Add shared import validation schemas.
- [x] Add create job, dry run, upload chunk, commit, rollback, status, and warning APIs.
- [x] Preserve raw normalized item JSON per import item for audit and retry.
- [x] Add warning records for count mismatches, missing files, unmatched placeholders, and timezone caveats.

## Client UX

- [x] Build `/profile/import/tv-time` wizard.
- [x] Support `.zip`, `.json`, `.csv`, and `.html` file selection.
- [x] Use JSZip for ZIP expansion and Papa Parse for CSV parsing.
- [x] Show detected files, counts, validation mismatches, and warnings before commit.
- [x] Upload normalized items in bounded chunks.
- [x] Show commit/rollback status after import.
- [x] Keep dashboard section counts stable after logout/login by deriving section tabs from dashboard sections instead of raw status keys.
- [x] Add sub-page back button and directional slide animation.
- [x] Keep mobile bottom sheets above the bottom navigation.
- [x] Portal modals/bottom sheets to `document.body` so import/media subpages anchor overlays to the viewport.
- [x] Replace season and episode text actions with checkmark controls and a watch-state bottom sheet.
- [x] Add polished placeholder sections for streaming availability, show info, cast, related media, external ratings, and comments.
- [x] Add richer episode detail placeholders for cast, credits, ratings, and comments.

## Tests and Verification

- [x] Fixture parser tests cover JSON, CSV fallback, ZIP-like file sets, and count detection.
- [x] Worker import tests cover dry run, chunk retry, commit, and rollback.
- [ ] Full local dry-run against `C:\Users\ahmar\Downloads\tv time backup data.zip`.
- [ ] Full local commit against the user's actual export after manual review.
- [ ] Browser UX pass on mobile and desktop.

## Manual UX Test Script

- [ ] Open Profile -> Import.
- [ ] Select `tv time backup data.zip`.
- [ ] Confirm detected counts match the expected TV Time totals.
- [ ] Confirm warnings include the timezone note and no unexpected missing core files.
- [ ] Start import and wait for chunks to upload.
- [ ] Commit import.
- [ ] Check Shows and Movies dashboards for imported placeholders/tracking.
- [ ] Roll back from the import report on a test database and confirm only imported rows are removed.
