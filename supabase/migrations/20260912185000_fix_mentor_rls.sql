-- Fix mentor tables RLS: Allow any authenticated user to manage their own mentor data
-- Previously had 'AND public.has_role(auth.uid(), 'admin')' which prevented non-admin users from creating/viewing tasks.

DROP POLICY IF EXISTS "mentor_categories owner admin all" ON public.mentor_categories;
CREATE POLICY "mentor_categories owner all"
ON public.mentor_categories FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mentor_entries owner admin all" ON public.mentor_entries;
CREATE POLICY "mentor_entries owner all"
ON public.mentor_entries FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mentor_tasks owner admin all" ON public.mentor_tasks;
CREATE POLICY "mentor_tasks owner all"
ON public.mentor_tasks FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mentor_task_completions owner admin all" ON public.mentor_task_completions;
CREATE POLICY "mentor_task_completions owner all"
ON public.mentor_task_completions FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mentor_treasures owner admin all" ON public.mentor_treasures;
CREATE POLICY "mentor_treasures owner all"
ON public.mentor_treasures FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mentor_journal owner admin all" ON public.mentor_journal;
CREATE POLICY "mentor_journal owner all"
ON public.mentor_journal FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
