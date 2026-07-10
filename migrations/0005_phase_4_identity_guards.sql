-- Phase 4 identity guards used by provider-first import and optional unit trees.
CREATE UNIQUE INDEX idx_media_external_source_id_unique
  ON media_external_ids(source, external_id);

CREATE UNIQUE INDEX idx_media_units_root_unique
  ON media_units(media_id, kind, position)
  WHERE parent_id IS NULL;
