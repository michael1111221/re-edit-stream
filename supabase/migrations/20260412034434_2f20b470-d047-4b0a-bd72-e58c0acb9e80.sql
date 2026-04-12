ALTER TABLE public.post_templates
  ADD COLUMN media_url text DEFAULT NULL,
  ADD COLUMN media_type text DEFAULT NULL;