-- ============================================================================
-- Migration: Enhance chat_files table with Midday-style processing fields
--
-- Adds:
-- - file_hash: SHA-256 hash for content-based deduplication
-- - processing_status: Track document processing state
-- - extracted_content: Store extracted text from documents
-- - metadata: JSONB for flexible document metadata (title, summary, etc.)
-- ============================================================================

-- Add file_hash column for content-based deduplication
ALTER TABLE chat_files
ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Add processing_status enum type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processing_status') THEN
        CREATE TYPE processing_status AS ENUM ('pending', 'processing', 'completed', 'failed');
    END IF;
END$$;

-- Add processing_status column
ALTER TABLE chat_files
ADD COLUMN IF NOT EXISTS processing_status processing_status DEFAULT 'pending';

-- Add extracted_content for storing document text
ALTER TABLE chat_files
ADD COLUMN IF NOT EXISTS extracted_content TEXT;

-- Add metadata JSONB for flexible document info (title, summary, wordCount, language, etc.)
ALTER TABLE chat_files
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create index on file_hash for fast duplicate detection
CREATE INDEX IF NOT EXISTS idx_chat_files_file_hash ON chat_files(file_hash);

-- Create composite index for chat + hash lookups
CREATE INDEX IF NOT EXISTS idx_chat_files_chat_hash ON chat_files(chat_id, file_hash);

-- Create index on processing_status for filtering
CREATE INDEX IF NOT EXISTS idx_chat_files_processing_status ON chat_files(processing_status);

-- Create GIN index on metadata for JSONB queries
CREATE INDEX IF NOT EXISTS idx_chat_files_metadata ON chat_files USING GIN (metadata);

-- ============================================================================
-- Full-text search support (optional, Midday-style)
-- ============================================================================

-- Add full-text search vector column
ALTER TABLE chat_files
ADD COLUMN IF NOT EXISTS fts tsvector
GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(filename, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(extracted_content, '')), 'B')
) STORED;

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_chat_files_fts ON chat_files USING GIN (fts);

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON COLUMN chat_files.file_hash IS 'SHA-256 hash of file content for deduplication';
COMMENT ON COLUMN chat_files.processing_status IS 'Document processing state: pending, processing, completed, failed';
COMMENT ON COLUMN chat_files.extracted_content IS 'Extracted text content from documents (PDFs, text files, etc.)';
COMMENT ON COLUMN chat_files.metadata IS 'Document metadata: title, summary, wordCount, language, extractedAt, etc.';
COMMENT ON COLUMN chat_files.fts IS 'Full-text search vector combining filename and extracted content';
