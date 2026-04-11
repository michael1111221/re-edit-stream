-- Add RLS policies for the temp-uploads storage bucket
-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload temp files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'temp-uploads');

-- Allow anyone to read (bucket is public for Telegram URL access)
CREATE POLICY "Public read access for temp-uploads"
ON storage.objects
FOR SELECT
USING (bucket_id = 'temp-uploads');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Authenticated users can delete temp files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'temp-uploads');

-- Allow authenticated users to update their own uploads
CREATE POLICY "Authenticated users can update temp files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'temp-uploads');
