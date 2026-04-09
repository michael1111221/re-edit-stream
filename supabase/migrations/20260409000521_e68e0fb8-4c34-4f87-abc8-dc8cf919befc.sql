
-- Drop all existing permissive policies
DROP POLICY IF EXISTS "Allow all on banned_words" ON public.banned_words;
DROP POLICY IF EXISTS "Allow all on catalog_categories" ON public.catalog_categories;
DROP POLICY IF EXISTS "Allow all on catalog_category_channels" ON public.catalog_category_channels;
DROP POLICY IF EXISTS "Allow all on channel_mappings" ON public.channel_mappings;
DROP POLICY IF EXISTS "Allow all on channels" ON public.channels;
DROP POLICY IF EXISTS "Allow all on post_templates" ON public.post_templates;
DROP POLICY IF EXISTS "Allow all on recurring_schedules" ON public.recurring_schedules;
DROP POLICY IF EXISTS "Allow all on scheduled_posts" ON public.scheduled_posts;
DROP POLICY IF EXISTS "Allow all on system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Allow all on videos" ON public.videos;

-- Create authenticated-only policies for each table
CREATE POLICY "Authenticated full access" ON public.banned_words FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.catalog_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.catalog_category_channels FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.channel_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.channels FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.post_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.recurring_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.scheduled_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.system_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.videos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow service_role full access (for edge functions)
CREATE POLICY "Service role full access" ON public.banned_words FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.catalog_categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.catalog_category_channels FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.channel_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.channels FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.post_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.recurring_schedules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.scheduled_posts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.system_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.videos FOR ALL TO service_role USING (true) WITH CHECK (true);
