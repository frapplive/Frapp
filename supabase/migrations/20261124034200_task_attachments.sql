-- Attachments on tasks (Paul 2026-11-22, spec/behavior/frapp-links.md): each
-- task holds a list of Frapp links (web links, and the chapter's documents,
-- minutes, events and chat messages), the same object events' `attachments`
-- hold (20261113220742). A record link stores ids only; the API names it per
-- reader. The API checks every entry; the table checks the list's shape and
-- count, as `events_attachments_is_list` does.
--
-- A group's copies hold the same list (create_task_group), and a series'
-- copies are made with its template's (task_series.attachments through
-- insert_task_series_copy). Both functions take the list as a trailing
-- argument with a default, so an API revision still running during a deploy
-- (named arguments without it) resolves to the new function.

-- 1. The columns -------------------------------------------------------------

-- A constant default adds the column without rewriting a row.
alter table public.tasks
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.tasks
  drop constraint if exists tasks_attachments_is_list,
  add constraint tasks_attachments_is_list check (
    jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10
  );

alter table public.task_series
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.task_series
  drop constraint if exists task_series_attachments_is_list,
  add constraint task_series_attachments_is_list check (
    jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10
  );

-- 2. A series' copies carry its attachments ------------------------------------

-- Same body as 20261116044044, plus `attachments`.
create or replace function public.insert_task_series_copy(
  p_series public.task_series,
  p_occurrence_date date,
  p_due_at timestamptz
)
returns setof public.tasks
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_task public.tasks;
begin
  insert into public.tasks (
    chapter_id, title, description, assignee_id, created_by, due_date, due_at,
    status, point_reward, points_awarded, proof_kind, series_id,
    occurrence_date, attachments
  )
  values (
    p_series.chapter_id, p_series.title, p_series.description,
    p_series.assignee_id, p_series.created_by, p_occurrence_date, p_due_at,
    'TODO', p_series.point_reward, false, p_series.proof_kind, p_series.id,
    p_occurrence_date, coalesce(p_series.attachments, '[]'::jsonb)
  )
  on conflict (series_id, occurrence_date) do nothing
  returning * into v_task;

  if v_task.id is null then
    return;
  end if;

  insert into public.task_subtasks (task_id, chapter_id, title, position)
  select v_task.id, v_task.chapter_id, t.title, (t.ord - 1)::int
    from unnest(p_series.subtask_titles) with ordinality as t(title, ord);

  return next v_task;
end;
$$;

drop function if exists public.create_task_series(uuid, uuid, text, text, uuid, int, text, text[], time, text, date, timestamptz, timestamptz, date);

-- Same body as 20261116044044, plus the template's attachments.
create or replace function public.create_task_series(
  p_chapter_id uuid,
  p_created_by uuid,
  p_title text,
  p_description text,
  p_assignee_id uuid,
  p_point_reward int,
  p_proof_kind text,
  p_subtask_titles text[],
  p_due_time time,
  p_recurrence_rule text,
  p_first_due_date date,
  p_first_due_at timestamptz,
  p_latest_due_at timestamptz,
  p_next_due_date date,
  p_attachments jsonb default '[]'::jsonb
)
returns setof public.tasks
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_series public.task_series;
begin
  insert into public.task_series (
    chapter_id, created_by, title, description, assignee_id, point_reward,
    proof_kind, subtask_titles, due_time, recurrence_rule, first_due_date,
    next_due_date, latest_due_at, made_count, attachments
  )
  values (
    p_chapter_id, p_created_by, p_title, p_description, p_assignee_id,
    p_point_reward, p_proof_kind, coalesce(p_subtask_titles, '{}'), p_due_time,
    p_recurrence_rule, p_first_due_date, p_next_due_date, p_latest_due_at, 1,
    coalesce(p_attachments, '[]'::jsonb)
  )
  returning * into v_series;

  return query
    select * from public.insert_task_series_copy(
      v_series, p_first_due_date, p_first_due_at
    );
end;
$$;

-- 3. A group's copies carry its attachments -------------------------------------

drop function if exists public.create_task_group(uuid, uuid, text, uuid[], text, text, date, timestamptz, int, text, text[], uuid, text, text);

-- Same body as 20261119162318, plus the attachments on every copy.
create or replace function public.create_task_group(
  p_chapter_id uuid,
  p_created_by uuid,
  p_audience text,
  p_assignee_ids uuid[],
  p_title text,
  p_description text,
  p_due_date date,
  p_due_at timestamptz,
  p_point_reward int,
  p_proof_kind text,
  p_subtask_titles text[],
  p_target_id uuid default null,
  p_target_name text default null,
  p_followed_by text default null,
  p_attachments jsonb default '[]'::jsonb
)
returns setof public.tasks
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
begin
  if coalesce(array_length(p_assignee_ids, 1), 0) = 0 then
    raise exception 'a group task needs at least one member';
  end if;

  insert into public.task_groups (
    chapter_id, created_by, audience, target_id, target_name
  )
  values (p_chapter_id, p_created_by, p_audience, p_target_id, p_target_name)
  returning id into v_group_id;

  insert into public.tasks (
    chapter_id, title, description, assignee_id, created_by, due_date,
    due_at, status, point_reward, points_awarded, proof_kind, group_id,
    followed_by, attachments
  )
  select p_chapter_id, p_title, p_description, a.assignee_id, p_created_by,
         p_due_date, p_due_at, 'TODO', p_point_reward, false, p_proof_kind,
         v_group_id, p_followed_by, coalesce(p_attachments, '[]'::jsonb)
    from (select distinct unnest(p_assignee_ids) as assignee_id) a;

  insert into public.task_subtasks (task_id, chapter_id, title, position)
  select c.id, c.chapter_id, t.title, (t.ord - 1)::int
    from public.tasks c
   cross join unnest(coalesce(p_subtask_titles, '{}'))
         with ordinality as t(title, ord)
   where c.group_id = v_group_id;

  return query
    select * from public.tasks
     where group_id = v_group_id
     order by created_at, id;
end;
$$;

-- 4. Written through the API's service role only, as before -------------------

revoke execute on function public.insert_task_series_copy(public.task_series, date, timestamptz) from public;
revoke execute on function public.create_task_series(uuid, uuid, text, text, uuid, int, text, text[], time, text, date, timestamptz, timestamptz, date, jsonb) from public;
revoke execute on function public.create_task_group(uuid, uuid, text, uuid[], text, text, date, timestamptz, int, text, text[], uuid, text, text, jsonb) from public;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.insert_task_series_copy(public.task_series, date, timestamptz)',
    'public.create_task_series(uuid, uuid, text, text, uuid, int, text, text[], time, text, date, timestamptz, timestamptz, date, jsonb)',
    'public.create_task_group(uuid, uuid, text, uuid[], text, text, date, timestamptz, int, text, text[], uuid, text, text, jsonb)'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon', v_fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke execute on function %s from authenticated', v_fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', v_fn);
    end if;
  end loop;
end $$;
