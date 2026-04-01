
-- Add filter_buttons to channel_mappings
ALTER TABLE public.channel_mappings ADD COLUMN filter_buttons boolean NOT NULL DEFAULT false;

-- Catalog categories
CREATE TABLE public.catalog_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  icon text DEFAULT '📁',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on catalog_categories" ON public.catalog_categories FOR ALL USING (true) WITH CHECK (true);

-- Category-channel associations
CREATE TABLE public.catalog_category_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES public.catalog_categories(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(category_id, channel_id)
);

ALTER TABLE public.catalog_category_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on catalog_category_channels" ON public.catalog_category_channels FOR ALL USING (true) WITH CHECK (true);
