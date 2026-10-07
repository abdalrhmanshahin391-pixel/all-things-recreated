-- QBank members can list every course and its sections (to pick where Aqua Studio sends questions).
-- (Separate file from the enum change: a new enum value cannot be used in the transaction that adds it.)
CREATE POLICY "QBank members read all courses" ON public.courses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'qbank'::public.app_role));
CREATE POLICY "QBank members read all sections" ON public.subject_groups FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'qbank'::public.app_role));
