-- Add attachments column to chat_messages table
ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Create index for better performance on attachments queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_attachments ON chat_messages USING GIN (attachments);

-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'attachments',
    'attachments',
    true,
    10485760, -- 10MB
    ARRAY[
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'text/plain', 'text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
) ON CONFLICT (id) DO NOTHING;

-- Add Row Level Security (RLS) policies for attachments
CREATE POLICY "Users can upload their own attachments" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'attachments' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own attachments" ON storage.objects
FOR SELECT USING (
    bucket_id = 'attachments' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own attachments" ON storage.objects
FOR UPDATE USING (
    bucket_id = 'attachments' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own attachments" ON storage.objects
FOR DELETE USING (
    bucket_id = 'attachments' AND 
    auth.role() = 'authenticated' AND
    (storage.foldername(name))[1] = auth.uid()::text
);
