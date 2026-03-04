
-- Channel mappings: many-to-many source→target with editing rules
CREATE TABLE public.channel_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  target_channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  -- Editing rules
  remove_links boolean NOT NULL DEFAULT true,
  add_buttons boolean NOT NULL DEFAULT false,
  auto_translate boolean NOT NULL DEFAULT true,
  target_language text NOT NULL DEFAULT 'he',
  add_signature boolean NOT NULL DEFAULT false,
  signature_text text DEFAULT '',
  filter_banned_words boolean NOT NULL DEFAULT false,
  -- Button templates (JSON array of {text, url})
  default_buttons jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_channel_id, target_channel_id)
);

-- Banned words table
CREATE TABLE public.banned_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  word text NOT NULL,
  mapping_id uuid REFERENCES public.channel_mappings(id) ON DELETE CASCADE,
  is_global boolean NOT NULL DEFAULT false,
  action text NOT NULL DEFAULT 'remove_word' CHECK (action IN ('remove_word', 'skip_post')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.channel_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on channel_mappings" ON public.channel_mappings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on banned_words" ON public.banned_words FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_channel_mappings_updated_at
  BEFORE UPDATE ON public.channel_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
