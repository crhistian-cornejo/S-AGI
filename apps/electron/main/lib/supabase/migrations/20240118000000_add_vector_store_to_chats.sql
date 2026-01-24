-- Add openai_vector_store_id to chats table
ALTER TABLE chats 
ADD COLUMN IF NOT EXISTS openai_vector_store_id TEXT;

-- Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_chats_openai_vector_store_id ON chats (openai_vector_store_id);
