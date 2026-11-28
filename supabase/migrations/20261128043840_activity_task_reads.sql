-- Activity's task lists in one round trip (#6061 step 1, after #5746).
--
-- `GET /v1/activity` read its task section as up to 13 PostgREST requests for
-- an officer and 4 for a member: the caller's own tasks, the confirmations
-- waiting on them, what they assigned, what they assigned as items (one-person
-- tasks and tasks for everyone), the groups of every row drawn, and each
-- group's copies. The database answers each in a few milliseconds; the cost
-- was the round trips. This function returns every one of those lists at
-- once, each filtered, ordered and capped as the separate reads were, and the
-- API assembles the page from them as before (`TaskService.activityLists`).
--
-- It reads `tasks` and `task_groups` only, inside `p_chapter_id`. What a
-- caller may see is still the API's decision: `p_can_manage` is the caller's
-- `tasks:manage`, and without it every list but the caller's own is empty.
-- Service role only, and `security invoker`: it needs no privilege its caller
-- lacks.
--
-- Keys, each a JSON array of rows unless noted:
--   own            the caller's tasks not yet confirmed, and those they marked
--                  done since `p_week_start`, confirmed or not; newest first,
--                  uncapped (as `listRows` read them)
--   waiting        finished, unconfirmed tasks assigned to someone else, the
--                  `p_limit` waiting longest (manage only)
--   waiting_total  how many of those wait in all (a number)
--   made           the `p_limit` newest tasks the caller made (manage only)
--   singles        the `p_limit` newest one-person tasks the caller made that
--                  are not confirmed (manage only)
--   made_groups    the `p_limit` newest groups the caller made with a copy not
--                  yet confirmed (manage only)
--   row_groups     the groups of every row in own, waiting and made
--   copy_states    every copy of row_groups and made_groups, a few columns
--                  each, in id order
--   shared         for each of made_groups, its unconfirmed copy with the
--                  lowest id, whole

create or replace function public.activity_task_reads(
  p_chapter_id uuid,
  p_user_id    uuid,
  p_can_manage boolean,
  p_week_start timestamptz,
  p_limit      integer
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with own as (
    select t.*
      from tasks t
     where t.chapter_id = p_chapter_id
       and t.assignee_id = p_user_id
       -- Not yet confirmed, or marked done since the week began: marking it
       -- done was the member's part, confirmed or not.
       and (t.confirmed_at is null or t.completed_at >= p_week_start)
  ),
  waiting_all as (
    select t.*
      from tasks t
     where p_can_manage
       and t.chapter_id = p_chapter_id
       and t.status = 'COMPLETED'
       and t.confirmed_at is null
       -- Confirming your own completion is refused (the no-self-award rule).
       -- `<>` leaves out an unassigned row too, as PostgREST's `neq` did.
       and t.assignee_id <> p_user_id
  ),
  waiting as (
    select w.*
      from waiting_all w
     order by w.completed_at asc nulls last, w.created_at asc, w.id asc
     limit p_limit
  ),
  made as (
    select t.*
      from tasks t
     where p_can_manage
       and t.chapter_id = p_chapter_id
       and t.created_by = p_user_id
     order by t.created_at desc, t.id desc
     limit p_limit
  ),
  singles as (
    select t.*
      from tasks t
     where p_can_manage
       and t.chapter_id = p_chapter_id
       and t.created_by = p_user_id
       and t.group_id is null
       and t.confirmed_at is null
     order by t.created_at desc, t.id desc
     limit p_limit
  ),
  made_groups as (
    select g.*
      from task_groups g
     where p_can_manage
       and g.chapter_id = p_chapter_id
       and g.created_by = p_user_id
       -- Unfinished: one copy not yet confirmed is all it takes.
       and exists (
         select 1
           from tasks c
          where c.chapter_id = p_chapter_id
            and c.group_id = g.id
            and c.points_awarded = false
       )
     order by g.created_at desc, g.id desc
     limit p_limit
  ),
  row_group_ids as (
    select group_id from own where group_id is not null
    union
    select group_id from waiting where group_id is not null
    union
    select group_id from made where group_id is not null
  ),
  row_groups as (
    select g.*
      from task_groups g
     where g.chapter_id = p_chapter_id
       and g.id in (select group_id from row_group_ids)
  ),
  copy_states as (
    select c.id, c.group_id, c.assignee_id, c.status, c.points_awarded,
           c.due_date, c.due_at
      from tasks c
     where c.chapter_id = p_chapter_id
       and c.group_id in (
         select group_id from row_group_ids
         union
         select id from made_groups
       )
  ),
  shared as (
    select distinct on (c.group_id) c.*
      from tasks c
     where c.chapter_id = p_chapter_id
       and c.group_id in (select id from made_groups)
       and c.points_awarded = false
     order by c.group_id, c.id
  )
  select jsonb_build_object(
    'own', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc) from own r),
      '[]'::jsonb),
    'waiting', coalesce(
      (select jsonb_agg(to_jsonb(r)
                        order by r.completed_at asc nulls last, r.created_at asc, r.id asc)
         from waiting r),
      '[]'::jsonb),
    'waiting_total', (select count(*) from waiting_all),
    'made', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc) from made r),
      '[]'::jsonb),
    'singles', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc) from singles r),
      '[]'::jsonb),
    'made_groups', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc) from made_groups r),
      '[]'::jsonb),
    'row_groups', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.id) from row_groups r),
      '[]'::jsonb),
    'copy_states', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.id) from copy_states r),
      '[]'::jsonb),
    'shared', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.group_id) from shared r),
      '[]'::jsonb)
  );
$$;

-- The service role only. `public` always exists; the Supabase roles are
-- absent in bare Postgres (PGlite in CI), so each is guarded.
revoke execute on function public.activity_task_reads(uuid, uuid, boolean, timestamptz, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.activity_task_reads(uuid, uuid, boolean, timestamptz, integer) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.activity_task_reads(uuid, uuid, boolean, timestamptz, integer) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.activity_task_reads(uuid, uuid, boolean, timestamptz, integer) to service_role;
  end if;
end
$$;
