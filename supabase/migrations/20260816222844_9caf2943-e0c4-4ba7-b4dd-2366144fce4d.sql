create or replace function public.can_manage_committee_members(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'admin'::public.app_role)
      or public.has_role(_user_id,'committee_head'::public.app_role);
$$;

create or replace function public.committee_team_list()
returns table(user_id uuid, username text, full_name text, email text, is_head boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage_committee_members(auth.uid()) then
    raise exception 'forbidden';
  end if;
  return query
  select p.id, p.username, p.full_name, p.email,
         public.has_role(p.id,'committee_head'::public.app_role)
  from public.profiles p
  where exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id
      and ur.role in ('committee'::public.app_role,'committee_head'::public.app_role)
  )
  order by p.username;
end; $$;

create or replace function public.committee_team_add(_username text)
returns void language plpgsql security definer set search_path = public as $$
declare _uid uuid;
begin
  if not public.can_manage_committee_members(auth.uid()) then
    raise exception 'forbidden';
  end if;
  select id into _uid from public.profiles where lower(username) = lower(trim(_username)) limit 1;
  if _uid is null then raise exception 'user not found'; end if;
  insert into public.user_roles (user_id, role)
  values (_uid,'committee'::public.app_role) on conflict do nothing;
end; $$;

create or replace function public.committee_team_remove(_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_committee_members(auth.uid()) then
    raise exception 'forbidden';
  end if;
  -- Only admins may remove another head.
  if public.has_role(_user_id,'committee_head'::public.app_role)
     and not public.has_role(auth.uid(),'admin'::public.app_role) then
    raise exception 'forbidden';
  end if;
  delete from public.user_roles
  where user_id = _user_id
    and role = 'committee'::public.app_role;
end; $$;

grant execute on function public.can_manage_committee_members(uuid) to authenticated;
grant execute on function public.committee_team_list() to authenticated;
grant execute on function public.committee_team_add(text) to authenticated;
grant execute on function public.committee_team_remove(uuid) to authenticated;

drop policy if exists "committee log readable by managers" on public.committee_activity_log;
create policy "committee log readable by managers"
on public.committee_activity_log for select to authenticated
using (public.can_manage_committee_members(auth.uid()));