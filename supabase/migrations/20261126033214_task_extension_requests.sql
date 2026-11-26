-- Asking for more time on a task (#6096; spec/behavior/tasks.md § Asking for
-- more time). Paul's design of 2026-11-25:
--
-- * A task can have a fixed deadline: never eligible for an extension, and
--   shown more urgent to its assignee. A series' copies and a group's copies
--   carry it, as they carry the rest of the template.
-- * The assignee of a task without one asks for a new due with a reason. One
--   extension of up to 24 hours is approved automatically when AI judges the
--   reason valid; anything else waits on an officer.
-- * Extensions are tracked: a member granted 3 in 30 days can't ask again
--   until an officer restores it (Winston's default, 2026-11-26).

-- 1. Fixed deadline ------------------------------------------------------------

-- A constant default adds the column without rewriting a row.
alter table public.tasks
  add column if not exists fixed_deadline boolean not null default false;

alter table public.task_series
  add column if not exists fixed_deadline boolean not null default false;

-- Same body as 20261124034200, plus `fixed_deadline`.
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
    occurrence_date, attachments, fixed_deadline
  )
  values (
    p_series.chapter_id, p_series.title, p_series.description,
    p_series.assignee_id, p_series.created_by, p_occurrence_date, p_due_at,
    'TODO', p_series.point_reward, false, p_series.proof_kind, p_series.id,
    p_occurrence_date, coalesce(p_series.attachments, '[]'::jsonb),
    coalesce(p_series.fixed_deadline, false)
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

drop function if exists public.create_task_series(uuid, uuid, text, text, uuid, int, text, text[], time, text, date, timestamptz, timestamptz, date, jsonb);

-- Same body as 20261124034200, plus the template's fixed deadline. A trailing
-- argument with a default, so an API revision still running during a deploy
-- (named arguments without it) resolves to the new function.
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
  p_attachments jsonb default '[]'::jsonb,
  p_fixed_deadline boolean default false
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
    next_due_date, latest_due_at, made_count, attachments, fixed_deadline
  )
  values (
    p_chapter_id, p_created_by, p_title, p_description, p_assignee_id,
    p_point_reward, p_proof_kind, coalesce(p_subtask_titles, '{}'), p_due_time,
    p_recurrence_rule, p_first_due_date, p_next_due_date, p_latest_due_at, 1,
    coalesce(p_attachments, '[]'::jsonb), coalesce(p_fixed_deadline, false)
  )
  returning * into v_series;

  return query
    select * from public.insert_task_series_copy(
      v_series, p_first_due_date, p_first_due_at
    );
end;
$$;

drop function if exists public.create_task_group(uuid, uuid, text, uuid[], text, text, date, timestamptz, int, text, text[], uuid, text, text, jsonb);

-- Same body as 20261124034200, plus the fixed deadline on every copy.
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
  p_attachments jsonb default '[]'::jsonb,
  p_fixed_deadline boolean default false
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
    followed_by, attachments, fixed_deadline
  )
  select p_chapter_id, p_title, p_description, a.assignee_id, p_created_by,
         p_due_date, p_due_at, 'TODO', p_point_reward, false, p_proof_kind,
         v_group_id, p_followed_by, coalesce(p_attachments, '[]'::jsonb),
         coalesce(p_fixed_deadline, false)
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

-- Same body as 20261124035159, plus the template's fixed deadline.
create or replace function public.add_task_group_copies(
  p_chapter_id uuid,
  p_group_id uuid,
  p_template_id uuid,
  p_assignee_ids uuid[]
)
returns setof public.tasks
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_template public.tasks%rowtype;
begin
  perform 1
     from public.task_groups
    where id = p_group_id
      and chapter_id = p_chapter_id
      for update;
  if not found then
    raise exception 'task group % not found', p_group_id;
  end if;

  select * into v_template
    from public.tasks
   where id = p_template_id
     and chapter_id = p_chapter_id
     and group_id = p_group_id;
  if not found then
    raise exception 'task % is not a copy of group %', p_template_id, p_group_id;
  end if;

  return query
  with added as (
    insert into public.tasks (
      chapter_id, title, description, assignee_id, created_by, due_date,
      due_at, status, point_reward, points_awarded, proof_kind, group_id,
      followed_by, meeting_id, attachments, fixed_deadline
    )
    select p_chapter_id, v_template.title, v_template.description,
           a.assignee_id, v_template.created_by, v_template.due_date,
           v_template.due_at, 'TODO', v_template.point_reward, false,
           v_template.proof_kind, p_group_id, v_template.followed_by,
           v_template.meeting_id, v_template.attachments,
           v_template.fixed_deadline
      from (select distinct unnest(coalesce(p_assignee_ids, '{}')) as assignee_id) a
     where not exists (
       select 1 from public.tasks c
        where c.chapter_id = p_chapter_id
          and c.group_id = p_group_id
          and c.assignee_id = a.assignee_id
     )
    returning *
  ), checklist as (
    insert into public.task_subtasks (task_id, chapter_id, title, position)
    select n.id, n.chapter_id, s.title, s.position
      from added n
     cross join public.task_subtasks s
     where s.task_id = p_template_id
  )
  select * from added order by created_at, id;
end;
$$;

-- 2. The requests ------------------------------------------------------------------

create table if not exists public.task_extension_requests (
  id                 uuid primary key default gen_random_uuid(),
  chapter_id         uuid not null references public.chapters(id) on delete cascade,
  task_id            uuid not null references public.tasks(id) on delete cascade,
  requester_id       uuid not null references public.users(id) on delete cascade,
  reason             text not null
                     constraint task_extension_requests_reason_len
                     check (char_length(btrim(reason)) between 1 and 300),
  -- The due the task had when asked, and the one asked for. A task due at a
  -- time asks for a time; one due by a day asks for a day.
  from_due_date      date not null,
  from_due_at        timestamptz,
  to_due_date        date not null,
  to_due_at          timestamptz,
  status             text not null default 'pending'
                     constraint task_extension_requests_status
                     check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  -- Why it waits on an officer, when it does; null when it was approved
  -- automatically.
  needs_officer      text
                     constraint task_extension_requests_needs_officer
                     check (needs_officer is null or needs_officer in (
                       'fixed_rules', 'over_a_day', 'second_request',
                       'back_to_back', 'reason_invalid', 'ai_unavailable'
                     )),
  -- What AI made of the reason: valid, invalid, or null when it wasn't asked
  -- (over a day, a second request, back to back) or couldn't answer.
  ai_verdict         text
                     constraint task_extension_requests_ai_verdict
                     check (ai_verdict is null or ai_verdict in ('valid', 'invalid')),
  ai_note            text
                     constraint task_extension_requests_ai_note_len
                     check (ai_note is null or char_length(ai_note) <= 200),
  auto_approved      boolean not null default false,
  decided_by         uuid references public.users(id) on delete set null,
  decided_at         timestamptz,
  decline_reason     text
                     constraint task_extension_requests_decline_len
                     check (decline_reason is null or char_length(btrim(decline_reason)) between 1 and 200),
  created_at         timestamptz not null default now(),
  constraint task_extension_requests_later
    check (to_due_date >= from_due_date
           and (to_due_at is null or from_due_at is null or to_due_at > from_due_at)),
  constraint task_extension_requests_decided
    check ((status = 'pending') = (decided_at is null)),
  constraint task_extension_requests_decline_reason
    check (decline_reason is null or status = 'declined')
);

-- One waiting request per task: a second ask while one waits is a 409.
create unique index if not exists task_extension_requests_one_pending
  on public.task_extension_requests (task_id) where status = 'pending';
create index if not exists idx_task_extension_requests_task
  on public.task_extension_requests (task_id, created_at desc);
-- "3 extensions in 30 days" counts a member's granted ones.
create index if not exists idx_task_extension_requests_requester
  on public.task_extension_requests (chapter_id, requester_id, decided_at desc)
  where status = 'approved';
-- Activity's Needs you reads the chapter's waiting ones.
create index if not exists idx_task_extension_requests_pending
  on public.task_extension_requests (chapter_id, created_at desc)
  where status = 'pending';
create index if not exists idx_task_extension_requests_decided_by
  on public.task_extension_requests (decided_by) where decided_by is not null;
create index if not exists idx_task_extension_requests_requester_fk
  on public.task_extension_requests (requester_id);

-- Read and written through the API's service role only.
alter table public.task_extension_requests enable row level security;

comment on table public.task_extension_requests is
  'A member asking for more time on a task (#6096, tasks.md § Asking for more time). Approving moves the task''s due through the officer''s edit, so the reminders re-arm. One pending per task.';

-- 3. Losing the ability to ask -------------------------------------------------------

alter table public.members
  add column if not exists extension_requests_blocked_at timestamptz,
  add column if not exists extension_requests_restored_at timestamptz;

comment on column public.members.extension_requests_blocked_at is
  'Set when the member is granted a 3rd extension in 30 days (#6096); they can''t ask for more time until an officer restores it, which clears it.';
comment on column public.members.extension_requests_restored_at is
  'When an officer last restored extension requests (#6096); extensions granted before it no longer count toward the 3 in 30 days.';

-- 4. Written through the API's service role only, as before ---------------------------

revoke execute on function public.insert_task_series_copy(public.task_series, date, timestamptz) from public;
revoke execute on function public.create_task_series(uuid, uuid, text, text, uuid, int, text, text[], time, text, date, timestamptz, timestamptz, date, jsonb, boolean) from public;
revoke execute on function public.create_task_group(uuid, uuid, text, uuid[], text, text, date, timestamptz, int, text, text[], uuid, text, text, jsonb, boolean) from public;
revoke execute on function public.add_task_group_copies(uuid, uuid, uuid, uuid[]) from public;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.insert_task_series_copy(public.task_series, date, timestamptz)',
    'public.create_task_series(uuid, uuid, text, text, uuid, int, text, text[], time, text, date, timestamptz, timestamptz, date, jsonb, boolean)',
    'public.create_task_group(uuid, uuid, text, uuid[], text, text, date, timestamptz, int, text, text[], uuid, text, text, jsonb, boolean)',
    'public.add_task_group_copies(uuid, uuid, uuid, uuid[])'
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
