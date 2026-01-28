-- Migration: Add is_obsolete flag for soft-delete of versions
-- Purpose: Instead of hard-deleting versions when restoring, mark them as obsolete
-- This preserves version history and allows recovery

-- Add is_obsolete column to file_versions
ALTER TABLE file_versions
ADD COLUMN IF NOT EXISTS is_obsolete BOOLEAN DEFAULT FALSE;

-- Add index for querying non-obsolete versions efficiently
CREATE INDEX IF NOT EXISTS idx_file_versions_is_obsolete
ON file_versions(file_id, is_obsolete)
WHERE is_obsolete = FALSE;

-- Add obsoleted_at timestamp to track when version was marked obsolete
ALTER TABLE file_versions
ADD COLUMN IF NOT EXISTS obsoleted_at TIMESTAMPTZ;

-- Add obsoleted_by to track which restore operation caused the obsolescence
ALTER TABLE file_versions
ADD COLUMN IF NOT EXISTS obsoleted_by_version INTEGER;

-- Update the cleanup function to only cleanup truly old versions, not obsolete ones
-- Obsolete versions should be preserved until explicitly purged
CREATE OR REPLACE FUNCTION cleanup_old_file_versions(
  p_file_id UUID,
  p_keep_count INTEGER DEFAULT 100
) RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH versions_to_delete AS (
    SELECT id FROM file_versions
    WHERE file_id = p_file_id
    AND is_obsolete = FALSE  -- Only cleanup non-obsolete versions
    ORDER BY version_number DESC
    OFFSET p_keep_count
  )
  DELETE FROM file_versions
  WHERE id IN (SELECT id FROM versions_to_delete);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add a function to purge obsolete versions older than a certain date
CREATE OR REPLACE FUNCTION purge_obsolete_versions(
  p_file_id UUID,
  p_older_than INTERVAL DEFAULT '30 days'
) RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM file_versions
  WHERE file_id = p_file_id
  AND is_obsolete = TRUE
  AND obsoleted_at < NOW() - p_older_than;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN file_versions.is_obsolete IS 'When true, this version was superseded by a restore operation. Still accessible but not shown in normal history.';
COMMENT ON COLUMN file_versions.obsoleted_at IS 'Timestamp when this version was marked obsolete';
COMMENT ON COLUMN file_versions.obsoleted_by_version IS 'The version number that caused this version to become obsolete (during restore)';
