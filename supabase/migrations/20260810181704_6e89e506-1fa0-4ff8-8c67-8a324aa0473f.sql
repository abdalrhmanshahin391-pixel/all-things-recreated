with home as (select id from public.site_pages where slug='home' limit 1)
update public.site_sections s set sort_order = s.sort_order + 10 where s.page_id = (select id from home);

with home as (select id from public.site_pages where slug='home' limit 1)
insert into public.site_sections (page_id, builtin_key, sort_order, visible)
select (select id from home), v.k, v.o, true
from (values ('exam_prep', 13), ('results', 15)) as v(k, o)
where not exists (
  select 1 from public.site_sections x where x.page_id = (select id from home) and x.builtin_key = v.k
);