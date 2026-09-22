drop index if exists public.amg_items_group_origin_question_uidx;
create unique index amg_items_group_origin_question_uidx
  on public.amg_items(group_id, origin_question_id);