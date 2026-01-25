-- Add pinned column to chats table for pinned chats feature
-- Pinned chats appear at the top of the sidebar, similar to Cursor IDE

ALTER TABLE chats
ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;

-- Add index for efficient filtering of pinned chats
CREATE INDEX IF NOT EXISTS idx_chats_pinned ON chats(pinned) WHERE pinned = TRUE;

-- Update RLS policies if needed (chats table should already have user_id based policies)
