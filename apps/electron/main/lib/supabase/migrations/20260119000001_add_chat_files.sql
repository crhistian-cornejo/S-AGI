-- Create chat_files table to track files associated with a chat (RAG/Knowledge Base)
CREATE TABLE IF NOT EXISTS chat_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_size BIGINT,
    content_type TEXT,
    openai_file_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE chat_files ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own chat files"
    ON chat_files FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat files"
    ON chat_files FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat files"
    ON chat_files FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat files"
    ON chat_files FOR DELETE
    USING (auth.uid() = user_id);

-- Create index for querying by chat_id
CREATE INDEX IF NOT EXISTS idx_chat_files_chat_id ON chat_files(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_files_user_id ON chat_files(user_id);
