-- Batch Jobs table for tracking OpenAI Batch API jobs
-- Used for cost optimization (50% savings on batch operations)

CREATE TABLE IF NOT EXISTS batch_jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'title_generation',
    status TEXT NOT NULL DEFAULT 'validating',
    input_file_id TEXT,
    output_file_id TEXT,
    error_file_id TEXT,
    request_count INTEGER DEFAULT 0,
    completed_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

-- Index for querying pending jobs
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_type ON batch_jobs(type);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_created_at ON batch_jobs(created_at DESC);

-- RLS policies (batch jobs are system-level, no user-specific access)
ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage batch jobs
CREATE POLICY "Service role can manage batch jobs" ON batch_jobs
    FOR ALL
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE batch_jobs IS 'Tracks OpenAI Batch API jobs for cost optimization';
