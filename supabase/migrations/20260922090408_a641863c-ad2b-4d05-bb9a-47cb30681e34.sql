create policy "Admins read MCQ source files"
on storage.objects for select to authenticated
using (bucket_id = 'amg-sources' and public.has_role(auth.uid(), 'admin'));
create policy "Admins upload MCQ source files"
on storage.objects for insert to authenticated
with check (bucket_id = 'amg-sources' and public.has_role(auth.uid(), 'admin'));
create policy "Admins update MCQ source files"
on storage.objects for update to authenticated
using (bucket_id = 'amg-sources' and public.has_role(auth.uid(), 'admin'))
with check (bucket_id = 'amg-sources' and public.has_role(auth.uid(), 'admin'));
create policy "Admins delete MCQ source files"
on storage.objects for delete to authenticated
using (bucket_id = 'amg-sources' and public.has_role(auth.uid(), 'admin'));