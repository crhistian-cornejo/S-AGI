-- Create panel_messages table for independent chat panels (PDF Chat Panel, Agent Panel)
-- These are separate from main chat messages and are associated with documents/artifacts
CREATE TABLE IF NOT EXISTS panel_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Panel type: 'pdf_chat' (PDF Chat Panel) or 'agent_panel' (Agent Panel for Excel/Docs/PDF)
    panel_type TEXT NOT NULL CHECK (panel_type IN ('pdf_chat', 'agent_panel')),
    -- Source identifier: artifact_id, chat_file_id, or session_id
    source_id TEXT NOT NULL,
    -- Tab type for agent_panel: 'excel', 'doc', 'pdf' (null for pdf_chat)
    tab_type TEXT CHECK (tab_type IN ('excel', 'doc', 'pdf')),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    -- Optional metadata (citations, tool calls, etc.)
    metadata JSONB DEFAULT '{}'::jsonb,
    -- Model info for assistant messages
    model_id TEXT,
    model_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE panel_messages ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own panel messages"
    ON panel_messages FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own panel messages"
    ON panel_messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own panel messages"
    ON panel_messages FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own panel messages"
    ON panel_messages FOR DELETE
    USING (auth.uid() = user_id);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_panel_messages_user_id ON panel_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_panel_messages_source ON panel_messages(panel_type, source_id, tab_type);
CREATE INDEX IF NOT EXISTS idx_panel_messages_created_at ON panel_messages(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_panel_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_panel_messages_updated_at
    BEFORE UPDATE ON panel_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_panel_messages_updated_at();
