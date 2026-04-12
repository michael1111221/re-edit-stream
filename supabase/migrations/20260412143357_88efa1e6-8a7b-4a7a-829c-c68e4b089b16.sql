ALTER TABLE scheduled_posts 
ADD COLUMN media_url text,
ADD COLUMN media_type text,
ADD COLUMN inline_buttons jsonb NOT NULL DEFAULT '[]'::jsonb;