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
-- A row with picks has its role lists rewritten from them on every insert and
-- update, and a role joining, leaving or being deleted from a tier re-expands
-- the chapter's events that have not ended. An ended event keeps the
-- audience it ran with, so its attendance record and the standing that reads
-- it never change after the fact.
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
set search_path = public
as $$
  select array_agg(distinct id order by id)
    from (
      select e.entry as id
        from jsonb_array_elements_text(
               case when jsonb_typeof(p_entries) = 'array'
                    then p_entries else '[]'::jsonb end
             ) as e(entry)
       where e.entry not like 'tier:%'
      union
      select r.id::text
        from public.roles r
        join jsonb_array_elements_text(
               case when jsonb_typeof(p_entries) = 'array'
                    then p_entries else '[]'::jsonb end
             ) as e(entry)
          on e.entry = 'tier:' || r.tier_id::text
       where r.chapter_id = p_chapter_id
    ) ids
$$;

create or replace function public.events_expand_attendance_picks()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.attendance_picks is null then
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
-- events that name a tier and have not ended. Rewriting the picks onto
-- themselves fires the trigger above, so the expansion has one definition.
create or replace function public.roles_reexpand_event_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chapter uuid := coalesce(new.chapter_id, old.chapter_id);
begin
  if tg_op = 'UPDATE'
     and new.tier_id is not distinct from old.tier_id then
    return null;
  end if;
  if coalesce(new.tier_id, old.tier_id) is null then
    return null;
  end if;
  update public.events e
     set attendance_picks = e.attendance_picks
   where e.chapter_id = v_chapter
     and e.attendance_picks is not null
     and e.end_time > now();
  return null;
end
$$;

revoke all on function public.roles_reexpand_event_attendance() from public;

drop trigger if exists trg_roles_reexpand_event_attendance on public.roles;
create trigger trg_roles_reexpand_event_attendance
  after insert or delete or update of tier_id on public.roles
  for each row execute function public.roles_reexpand_event_attendance();
