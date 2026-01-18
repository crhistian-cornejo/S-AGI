-- Track OpenAI vector store file IDs separately from file IDs
ALTER TABLE chat_files
ADD COLUMN IF NOT EXISTS openai_vector_store_file_id TEXT;

-- Index for lookups by vector store file id
CREATE INDEX IF NOT EXISTS idx_chat_files_openai_vector_store_file_id
    ON chat_files (openai_vector_store_file_id);
