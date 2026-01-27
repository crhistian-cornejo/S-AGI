-- Migration: Add commit system to file_versions
-- Allows grouping changes with commit messages (git-like)

-- Add commit fields to file_versions
ALTER TABLE file_versions
  ADD COLUMN IF NOT EXISTS commit_id UUID,
  ADD COLUMN IF NOT EXISTS commit_message TEXT,
  ADD COLUMN IF NOT EXISTS commit_parent_id UUID REFERENCES file_versions(id);

-- Create index for commit queries
CREATE INDEX IF NOT EXISTS idx_file_versions_commit_id ON file_versions(commit_id) WHERE commit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_file_versions_commit_parent ON file_versions(commit_parent_id) WHERE commit_parent_id IS NOT NULL;

-- Add computed diff_summary field (will be populated by application)
-- This stores the structured diff between this version and the previous one
ALTER TABLE file_versions
  ADD COLUMN IF NOT EXISTS diff_summary JSONB;

-- Function to get commit chain (all versions in a commit)
CREATE OR REPLACE FUNCTION get_commit_chain(p_commit_id UUID)
RETURNS TABLE (
  version_number INTEGER,
  change_type TEXT,
  change_description TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    fv.version_number,
    fv.change_type,
    fv.change_description,
    fv.created_at
  FROM file_versions fv
  WHERE fv.commit_id = p_commit_id
  ORDER BY fv.version_number ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get diff between two versions
-- Returns JSONB with structured diff data
CREATE OR REPLACE FUNCTION get_version_diff(
  p_file_id UUID,
  p_version_a INTEGER,
  p_version_b INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_version_a JSONB;
  v_version_b JSONB;
BEGIN
  -- Get version A data
  SELECT univer_data INTO v_version_a
  FROM file_versions
  WHERE file_id = p_file_id AND version_number = p_version_a;

  -- Get version B data
  SELECT univer_data INTO v_version_b
  FROM file_versions
  WHERE file_id = p_file_id AND version_number = p_version_b;

  -- Return both for client-side diff calculation
  -- The actual diff calculation happens in the application layer
  RETURN jsonb_build_object(
    'version_a', v_version_a,
    'version_b', v_version_b,
    'version_a_number', p_version_a,
    'version_b_number', p_version_b
  );
END;
$$ LANGUAGE plpgsql;
