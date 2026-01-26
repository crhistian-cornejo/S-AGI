-- Migration: Add user_files and file_versions tables for persistent file system with version history
-- This creates a Google Docs/Sheets-like experience with git-like version tracking

-- =====================================================
-- TABLE: user_files
-- Main table for user's persistent files (Excel, Docs, Notes)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('excel', 'doc', 'note')),
  name TEXT NOT NULL,
  description TEXT,

  -- Current data (latest version)
  univer_data JSONB,          -- Univer snapshot data (for Excel/Docs)
  content TEXT,               -- Markdown content (for Notes)

  -- Metadata
  metadata JSONB DEFAULT '{}',
  icon TEXT,                  -- Emoji or icon identifier
  color TEXT,                 -- Accent color

  -- Counters and stats
  version_count INTEGER DEFAULT 1,
  total_edits INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_opened_at TIMESTAMPTZ,

  -- Organization
  is_pinned BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  folder_path TEXT,           -- For future folder organization
  tags TEXT[],                -- Tags for search

  -- Soft delete
  deleted_at TIMESTAMPTZ
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON user_files(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_files_type ON user_files(user_id, type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_files_last_opened ON user_files(user_id, last_opened_at DESC NULLS LAST) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_files_pinned ON user_files(user_id, is_pinned, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_files_tags ON user_files USING GIN(tags) WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE user_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own files"
  ON user_files FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own files"
  ON user_files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own files"
  ON user_files FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own files"
  ON user_files FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_files_updated_at
  BEFORE UPDATE ON user_files
  FOR EACH ROW
  EXECUTE FUNCTION update_user_files_updated_at();


-- =====================================================
-- TABLE: file_versions
-- Git-like version history for each file
-- =====================================================
CREATE TABLE IF NOT EXISTS file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES user_files(id) ON DELETE CASCADE,

  -- Version number (auto-incremented per file)
  version_number INTEGER NOT NULL,

  -- Complete data snapshot
  univer_data JSONB,          -- Univer snapshot
  content TEXT,               -- Content for Notes

  -- Change metadata
  change_type TEXT NOT NULL CHECK (change_type IN (
    'created',        -- Initial creation
    'auto_save',      -- Auto-saved after idle
    'manual_save',    -- Manual save by user
    'ai_edit',        -- Edit by Agent Panel
    'ai_create',      -- Created by Agent Panel
    'restore',        -- Restored from previous version
    'import'          -- Imported from external file
  )),
  change_description TEXT,    -- Description of the change
  change_summary JSONB,       -- Structured summary of changes

  -- Context
  created_by UUID REFERENCES auth.users(id),
  ai_model TEXT,              -- If by AI, which model
  ai_prompt TEXT,             -- If by AI, what prompt
  tool_name TEXT,             -- If by tool call, which tool

  -- Stats
  size_bytes INTEGER,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(file_id, version_number)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_file_versions_file_id ON file_versions(file_id);
CREATE INDEX IF NOT EXISTS idx_file_versions_created_at ON file_versions(file_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_versions_change_type ON file_versions(file_id, change_type);
CREATE INDEX IF NOT EXISTS idx_file_versions_version_number ON file_versions(file_id, version_number DESC);

-- Enable RLS (inherits permissions from parent file)
ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view versions of their files"
  ON file_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_files
      WHERE user_files.id = file_versions.file_id
      AND user_files.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert versions of their files"
  ON file_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_files
      WHERE user_files.id = file_versions.file_id
      AND user_files.user_id = auth.uid()
    )
  );

-- Note: No UPDATE or DELETE policies - versions are immutable


-- =====================================================
-- DATA MIGRATION: Move existing artifacts to user_files
-- =====================================================

-- Migrate spreadsheet artifacts to user_files
INSERT INTO user_files (
  user_id, type, name, univer_data, created_at, updated_at, last_opened_at, version_count
)
SELECT
  COALESCE(a.user_id, c.user_id) as user_id,
  'excel' as type,
  COALESCE(a.name, 'Untitled Spreadsheet') as name,
  a.univer_data,
  a.created_at,
  a.updated_at,
  a.updated_at as last_opened_at,
  1 as version_count
FROM artifacts a
LEFT JOIN chats c ON a.chat_id = c.id
WHERE a.type = 'spreadsheet'
  AND a.univer_data IS NOT NULL
  AND (a.user_id IS NOT NULL OR c.user_id IS NOT NULL)
ON CONFLICT DO NOTHING;

-- Migrate document artifacts to user_files
INSERT INTO user_files (
  user_id, type, name, univer_data, created_at, updated_at, last_opened_at, version_count
)
SELECT
  COALESCE(a.user_id, c.user_id) as user_id,
  'doc' as type,
  COALESCE(a.name, 'Untitled Document') as name,
  a.univer_data,
  a.created_at,
  a.updated_at,
  a.updated_at as last_opened_at,
  1 as version_count
FROM artifacts a
LEFT JOIN chats c ON a.chat_id = c.id
WHERE a.type = 'document'
  AND a.univer_data IS NOT NULL
  AND (a.user_id IS NOT NULL OR c.user_id IS NOT NULL)
ON CONFLICT DO NOTHING;

-- Create initial version for migrated files
INSERT INTO file_versions (
  file_id, version_number, univer_data, content, change_type,
  change_description, created_by, created_at
)
SELECT
  uf.id,
  1,
  uf.univer_data,
  uf.content,
  'import',
  'Migrated from artifacts',
  uf.user_id,
  uf.created_at
FROM user_files uf
WHERE NOT EXISTS (
  SELECT 1 FROM file_versions fv WHERE fv.file_id = uf.id
);


-- =====================================================
-- HELPER FUNCTION: Get next version number for a file
-- =====================================================
CREATE OR REPLACE FUNCTION get_next_file_version(p_file_id UUID)
RETURNS INTEGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_version
  FROM file_versions
  WHERE file_id = p_file_id;

  RETURN next_version;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- FUNCTION: Cleanup old versions (keep last N)
-- Can be called periodically to manage storage
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_old_file_versions(
  p_file_id UUID,
  p_keep_count INTEGER DEFAULT 100
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH versions_to_delete AS (
    SELECT id
    FROM file_versions
    WHERE file_id = p_file_id
    ORDER BY version_number DESC
    OFFSET p_keep_count
  )
  DELETE FROM file_versions
  WHERE id IN (SELECT id FROM versions_to_delete);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
