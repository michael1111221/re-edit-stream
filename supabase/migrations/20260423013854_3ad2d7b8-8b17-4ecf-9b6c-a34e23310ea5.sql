CREATE TABLE public.scheduler_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,
  scheduled_processed INTEGER NOT NULL DEFAULT 0,
  recurring_matched INTEGER NOT NULL DEFAULT 0,
  sends_success INTEGER NOT NULL DEFAULT 0,
  sends_failed INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  details JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_scheduler_runs_started_at ON public.scheduler_runs (started_at DESC);

ALTER TABLE public.scheduler_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access"
ON public.scheduler_runs
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access"
ON public.scheduler_runs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);