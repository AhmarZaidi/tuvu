-- Phase 7 Follow-Up: Advanced Tracking metadata

ALTER TABLE user_media ADD COLUMN started_at TEXT;
ALTER TABLE user_media ADD COLUMN purchase_library TEXT;
ALTER TABLE media_metadata ADD COLUMN budget REAL;
ALTER TABLE media_metadata ADD COLUMN sales REAL;
