-- Allow artifacts to exist independently without a chat
-- This enables standalone spreadsheets and documents created from tabs

-- Make chat_id nullable
ALTER TABLE artifacts
ALTER COLUMN chat_id DROP NOT NULL;

-- Add user_id column to artifacts for ownership when no chat
ALTER TABLE artifacts
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Backfill user_id from existing artifacts via their chat
UPDATE artifacts a
SET user_id = c.user_id
FROM chats c
WHERE a.chat_id = c.id
  AND a.user_id IS NULL;

-- Add index for efficient queries on user_id
CREATE INDEX IF NOT EXISTS idx_artifacts_user_id ON artifacts(user_id) WHERE user_id IS NOT NULL;

-- Update RLS policy to allow access to artifacts by user_id directly
DROP POLICY IF EXISTS "Users can access their own artifacts" ON artifacts;

CREATE POLICY "Users can access their own artifacts" ON artifacts
FOR ALL USING (
    -- Direct ownership via user_id
    user_id = auth.uid()
    OR
    -- Indirect ownership via chat
    chat_id IN (SELECT id FROM chats WHERE user_id = auth.uid())
);
