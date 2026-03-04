
-- Create enum for channel types
CREATE TYPE public.channel_type AS ENUM ('source', 'target');
CREATE TYPE public.channel_status AS ENUM ('active', 'paused', 'error');
CREATE TYPE public.video_status AS ENUM ('queued', 'downloading', 'translating', 'editing', 'scheduled', 'publishing', 'completed', 'failed');

-- Create channels table
CREATE TABLE public.channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type channel_type NOT NULL,
  handle TEXT NOT NULL,
  video_count INTEGER NOT NULL DEFAULT 0,
  is_owned BOOLEAN NOT NULL DEFAULT true,
  language TEXT NOT NULL DEFAULT 'he',
  status channel_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create videos table
CREATE TABLE public.videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  translated_title TEXT,
  source_channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  target_channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  status video_status NOT NULL DEFAULT 'queued',
  duration TEXT,
  progress INTEGER DEFAULT 0,
  links_removed INTEGER DEFAULT 0,
  links_added INTEGER DEFAULT 0,
  scheduled_for TIMESTAMP WITH TIME ZONE,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create scheduled_posts table
CREATE TABLE public.scheduled_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

-- Since this is a single-user system, allow all operations for now
-- (no auth required - personal tool)
CREATE POLICY "Allow all on channels" ON public.channels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on videos" ON public.videos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on scheduled_posts" ON public.scheduled_posts FOR ALL USING (true) WITH CHECK (true);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX idx_videos_status ON public.videos(status);
CREATE INDEX idx_videos_source_channel ON public.videos(source_channel_id);
CREATE INDEX idx_videos_target_channel ON public.videos(target_channel_id);
CREATE INDEX idx_scheduled_posts_scheduled_for ON public.scheduled_posts(scheduled_for);
CREATE INDEX idx_channels_type ON public.channels(type);
