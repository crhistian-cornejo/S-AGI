-- Add checkpoint support to file_versions for Cursor-style restore
-- Each user prompt creates a checkpoint before AI operations

-- Add checkpoint fields to file_versions
ALTER TABLE file_versions
ADD COLUMN IF NOT EXISTS checkpoint_prompt_id TEXT,
ADD COLUMN IF NOT EXISTS checkpoint_message_id TEXT,
ADD COLUMN IF NOT EXISTS is_checkpoint BOOLEAN DEFAULT FALSE;

-- Index for fast checkpoint lookups
CREATE INDEX IF NOT EXISTS idx_file_versions_checkpoint
ON file_versions (file_id, is_checkpoint, created_at DESC)
WHERE is_checkpoint = TRUE;

-- Add 'checkpoint' to change_type enum if it exists as a check constraint
-- Note: If change_type is an enum, you may need to add the value separately

-- Comment for documentation
COMMENT ON COLUMN file_versions.checkpoint_prompt_id IS 'Links this version to the user prompt that triggered it';
COMMENT ON COLUMN file_versions.checkpoint_message_id IS 'The panel_messages.id of the user message';
COMMENT ON COLUMN file_versions.is_checkpoint IS 'True if this version was auto-created before an AI operation';
