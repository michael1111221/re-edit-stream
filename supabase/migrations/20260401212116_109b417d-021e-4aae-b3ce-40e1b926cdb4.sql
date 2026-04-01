
-- Templates for saved publications
CREATE TABLE public.post_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  channel_handles JSONB NOT NULL DEFAULT '[]'::jsonb,
  inline_buttons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.post_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on post_templates" ON public.post_templates FOR ALL USING (true) WITH CHECK (true);

-- Recurring schedules
CREATE TABLE public.recurring_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  channel_handles JSONB NOT NULL DEFAULT '[]'::jsonb,
  inline_buttons JSONB NOT NULL DEFAULT '[]'::jsonb,
  days_of_week INTEGER[] NOT NULL DEFAULT '{}'::integer[],
  time_of_day TEXT NOT NULL DEFAULT '12:00',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on recurring_schedules" ON public.recurring_schedules FOR ALL USING (true) WITH CHECK (true);
