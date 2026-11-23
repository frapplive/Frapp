-- Who's coming by tier (Paul, 2026-11-22: "THE MAIN POINT IS TO BE ABLE TO
-- ADD TIERS HERE"; `spec/behavior/events.md` § Attendance by role).
--
-- An event's attendance lists may now name a tier ("Cabinet required"), which
-- stands for every role in it, including a role added to the tier after the
-- event was made. Every reader of the rule (the read gate, check-in, the
-- auto-absent sweep, pushes, the calendar feed, Activity, Ask) reads
-- `required_role_ids` / `optional_role_ids` / `excluded_role_ids` as role ids,
-- so the tier is expanded here rather than at each of them:
--
--   attendance_picks   what the officer picked, per answer, each entry a role
--                      id or `tier:<role_tiers.id>`; null when no tier is named
--   *_role_ids         the effective role ids: the picked roles plus every
--                      role now in each picked tier
--
-- A row with picks has its role lists rewritten from them on insert, on an
-- edit of Who's coming, and on any write while it has not ended; a role
-- joining, leaving or being deleted from a tier re-expands the chapter's
-- events that name that tier and have not ended. An ended event keeps the
-- audience it ran with unless an officer edits its Who's coming, so its
-- attendance record and the standing that reads it don't change behind
-- anyone's back.
--
-- A row without picks (every event written before this, and every event that
-- names no tier) is untouched: the API writes its role lists as before.

alter table public.events
  add column if not exists attendance_picks jsonb;

comment on column public.events.attendance_picks is
  'Who''s coming as picked, tiers included: {"required": [...], "optional": [...], "not_invited": [...]}, each entry a role id or tier:<role_tiers.id>. Null when no tier is named. When set, required_role_ids / optional_role_ids / excluded_role_ids are rewritten from it (events_expand_attendance_picks).';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_attendance_picks_object'
  ) then
    alter table public.events
      add constraint events_attendance_picks_object
      check (attendance_picks is null or jsonb_typeof(attendance_picks) = 'object');
  end if;
end
$$;

-- One answer's entries as effective role ids: its role ids as written, plus
-- the ids of the chapter's roles in each named tier. Null for none, as the
-- API stores an empty list.
create or replace function public.event_attendance_role_ids(
  p_chapter_id uuid,
  p_entries jsonb
) returns text[]
language sql
stable
set search_path = public, pg_temp
as $$
  select array_agg(distinct id order by id)
    from (
      select e.entry as id
        from jsonb_array_elements_text(
               case when jsonb_typeof(p_entries) = 'array'
                    then p_entries else '[]'::jsonb end
             ) as e(entry)
       where lower(e.entry) not like 'tier:%'
      union
      select r.id::text
        from public.roles r
        join jsonb_array_elements_text(
               case when jsonb_typeof(p_entries) = 'array'
                    then p_entries else '[]'::jsonb end
             ) as e(entry)
          on lower(e.entry) = 'tier:' || r.tier_id::text
       where r.chapter_id = p_chapter_id
    ) ids
$$;

-- Expands a row's picks into its role lists: on insert, and on an update
-- that changes the picks or a role list (an edit of Who's coming) or touches
-- an event that has not ended (the roles trigger below). An ended event's
-- other edits (its notes, its agenda, a series split retiring it) leave its
-- lists as they ran.
create or replace function public.events_expand_attendance_picks()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.attendance_picks is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.attendance_picks is not distinct from old.attendance_picks
     and new.required_role_ids is not distinct from old.required_role_ids
     and new.optional_role_ids is not distinct from old.optional_role_ids
     and new.excluded_role_ids is not distinct from old.excluded_role_ids
     and old.end_time <= now() then
    return new;
  end if;
  new.required_role_ids := public.event_attendance_role_ids(
    new.chapter_id, new.attendance_picks -> 'required');
  new.optional_role_ids := public.event_attendance_role_ids(
    new.chapter_id, new.attendance_picks -> 'optional');
  new.excluded_role_ids := public.event_attendance_role_ids(
    new.chapter_id, new.attendance_picks -> 'not_invited');
  return new;
end
$$;

drop trigger if exists trg_events_expand_attendance_picks on public.events;
create trigger trg_events_expand_attendance_picks
  before insert or update on public.events
  for each row execute function public.events_expand_attendance_picks();

-- A role's tier changed (or the role came or went): re-expand the chapter's
-- events that have not ended and name the tier it left or joined. Rewriting
-- the picks onto themselves fires the trigger above, so the expansion has one
-- definition.
create or replace function public.roles_reexpand_event_attendance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_chapter uuid := coalesce(new.chapter_id, old.chapter_id);
  v_tiers text[];
begin
  if tg_op = 'UPDATE'
     and new.tier_id is not distinct from old.tier_id then
    return null;
  end if;
  v_tiers := array_remove(array[
    case when tg_op <> 'DELETE' and new.tier_id is not null
         then 'tier:' || new.tier_id::text end,
    case when tg_op <> 'INSERT' and old.tier_id is not null
         then 'tier:' || old.tier_id::text end
  ], null);
  if cardinality(v_tiers) = 0 then
    return null;
  end if;
  update public.events e
     set attendance_picks = e.attendance_picks
   where e.chapter_id = v_chapter
     and e.attendance_picks is not null
     and e.end_time > now()
     and exists (
       select 1
         from jsonb_each(e.attendance_picks) as answer(status, entries),
              jsonb_array_elements_text(
                case when jsonb_typeof(answer.entries) = 'array'
                     then answer.entries else '[]'::jsonb end
              ) as pick(entry)
        where lower(pick.entry) = any (v_tiers)
     );
  return null;
end
$$;

drop trigger if exists trg_roles_reexpand_event_attendance on public.roles;
create trigger trg_roles_reexpand_event_attendance
  after insert or delete or update of tier_id on public.roles
  for each row execute function public.roles_reexpand_event_attendance();

-- Trigger functions and the expansion are the database's own: never an RPC.
revoke all on function public.event_attendance_role_ids(uuid, jsonb) from public;
revoke all on function public.events_expand_attendance_picks() from public;
revoke all on function public.roles_reexpand_event_attendance() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.event_attendance_role_ids(uuid, jsonb) from anon;
    revoke all on function public.events_expand_attendance_picks() from anon;
    revoke all on function public.roles_reexpand_event_attendance() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.event_attendance_role_ids(uuid, jsonb) from authenticated;
    revoke all on function public.events_expand_attendance_picks() from authenticated;
    revoke all on function public.roles_reexpand_event_attendance() from authenticated;
  end if;
end
$$;
