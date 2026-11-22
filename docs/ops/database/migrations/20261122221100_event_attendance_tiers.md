# 20261122221100_event_attendance_tiers.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Lets an event's Who's coming name a tier ("Cabinet required"), which stands for every role in it, including roles added to the tier later (Paul, 2026-11-22).

## Promotion

- **Purpose**: `events.attendance_picks` (jsonb, null unless the event names a tier) holds what the officer picked; the trigger `trg_events_expand_attendance_picks` rewrites `required_role_ids` / `optional_role_ids` / `excluded_role_ids` from it to the effective role ids, so every reader keeps reading role ids. `trg_roles_reexpand_event_attendance` re-expands a chapter's events that have not ended when a role joins, leaves or is deleted from a tier. Writes no data: every existing row has null picks and is untouched.
- **Checks**: `select tgname from pg_trigger where tgname in ('trg_events_expand_attendance_picks', 'trg_roles_reexpand_event_attendance');` returns two rows, and `select count(*) from events where attendance_picks is not null;` is 0 right after the push.
- **Promoter notes**: push this before or with the API that writes `attendance_picks`. An older API never writes the column, so the order only matters one way: an API that writes it against a database without the column fails the write.

## Rollback

Reverting is worth it only if the triggers misbehave. Events that already name a tier keep their last expanded role lists, which read correctly (frozen at the tier's roles at that moment), so nothing is lost but the live expansion and the tier row in the editors.

```sql
drop trigger if exists trg_roles_reexpand_event_attendance on public.roles;
drop trigger if exists trg_events_expand_attendance_picks on public.events;
drop function if exists public.roles_reexpand_event_attendance();
drop function if exists public.events_expand_attendance_picks();
drop function if exists public.event_attendance_role_ids(uuid, jsonb);
alter table public.events drop constraint if exists events_attendance_picks_object;
alter table public.events drop column if exists attendance_picks;
```
