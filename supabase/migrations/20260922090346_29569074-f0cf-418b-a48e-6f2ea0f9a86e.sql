create table public.amg_sources (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.amg_groups(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  extracted_text text not null default '',
  chunks jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.amg_sources to authenticated;
grant all on public.amg_sources to service_role;
alter table public.amg_sources enable row level security;
create policy "Admins manage MCQ source documents"
on public.amg_sources for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
create trigger touch_amg_sources_updated_at
before update on public.amg_sources
for each row execute function public.touch_updated_at();

alter table public.amg_items
  add column if not exists origin_question_id uuid references public.questions(id) on delete set null;
create unique index if not exists amg_items_group_origin_question_uidx
  on public.amg_items(group_id, origin_question_id)
  where origin_question_id is not null;
