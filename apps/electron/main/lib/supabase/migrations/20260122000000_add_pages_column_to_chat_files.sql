-- ============================================================================
-- Migration: Add pages column to chat_files table
--
-- This column stores page-by-page extracted content for PDF and multi-page documents.
-- Enables page-level citations like "[Document.pdf, p. 5]" for RAG responses.
-- ============================================================================

-- Add pages column as JSONB array
-- Format: [{ pageNumber: 1, content: "...", wordCount: 123 }, ...]
ALTER TABLE chat_files
ADD COLUMN IF NOT EXISTS pages JSONB;

-- Create index on pages for JSONB queries
CREATE INDEX IF NOT EXISTS idx_chat_files_pages ON chat_files USING GIN (pages);

-- Add comment for documentation
COMMENT ON COLUMN chat_files.pages IS 'Array of page objects with pageNumber, content, and wordCount for multi-page documents (PDFs)';
