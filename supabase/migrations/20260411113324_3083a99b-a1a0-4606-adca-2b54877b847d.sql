DROP POLICY IF EXISTS "Authenticated users can upload temp files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete temp files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update temp files" ON storage.objects;

CREATE POLICY "Authenticated users can upload temp files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'temp-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can delete temp files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'temp-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can update temp files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'temp-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'temp-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);