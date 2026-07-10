ALTER TABLE media_items ADD COLUMN extended_data_json TEXT;
ALTER TABLE episodes ADD COLUMN extended_data_json TEXT;
ALTER TABLE media_source_records ADD COLUMN candidate_json TEXT;
ALTER TABLE metadata_refresh_jobs ADD COLUMN context_json TEXT;
