# 20261125221103_event_dates_tentative_calendar_only.sql

<!-- One page per migration: its promotion entry and its rollback recipe.
     check:migration-safety reads the two headings below. Shared procedure
     lives in ../promotion.md and ../../db-rollback-playbook.md; link to it,
     don't copy it. -->

Adds all-day, multi-day and time-TBD events, a tentative status and the "On the calendar only" answer to `events` (#6098, epic #6097). The rule is [`spec/behavior/events.md` § Dates, tentative and on the calendar only](../../../../spec/behavior/events.md#dates-tentative-and-on-the-calendar-only).

## Promotion

- **Purpose**: `events.timing` (`text not null default 'timed'`, one of `timed`, `all_day`, `time_tbd`), `events.start_date` and `events.end_date` (`date`, null on a timed event), `events.is_tentative` and `events.calendar_only` (`boolean not null default false`). Three checks: `events_timing_kind`, `events_timing_dates` (a timed event has no dates; an all-day event has both, in order, at most 366 days; a time-TBD event is one day) and `events_calendar_only_shape` (a calendar-only event has 0 points and `is_mandatory` false; the API, not the table, refuses Required or Optional roles on it).
- **Checks**: After `db push`, `select count(*) from information_schema.columns where table_name = 'events' and column_name in ('timing', 'start_date', 'end_date', 'is_tentative', 'calendar_only');` returns `5`, and `select count(*) from events where timing <> 'timed' or is_tentative or calendar_only;` returns `0` on a database the new API hasn't written to.
- **Promoter notes**: Ship it before, or with, the API from the same PR; a deploy applies migrations first. The older API reads `select('*')` and ignores the new columns. Each column has a constant default, so adding it is a metadata-only change and the table is not rewritten. The checks hold for every existing row (all are timed, with no dates and `calendar_only = false`), so validating them only reads. No data written, nothing by hand.

## Rollback

Revert the API forward and keep the migration file ([§ 3) Undo one migration](../../db-rollback-playbook.md#3-undo-one-migration)). The reverted API ignores the columns, and a dated event still has real `start_time` and `end_time` bounds, so it shows as a midnight-to-midnight event. Expect these while it runs, and handle them before reverting if any dated or calendar-only events exist (`select count(*) from events where timing <> 'timed' or calendar_only;`):

- It takes attendance on every event again: check-in opens on calendar-only and time-TBD events, the absence sweep marks required members absent at a required time-TBD event after its midnight bound, and the reminder sweep sends "starts in 30 minutes" about 23:30 the night before a required all-day or time-TBD event. Make such events timed, or not required, first.
- Saving points or Required on a calendar-only event fails on `events_calendar_only_shape`.
- An officer who moves a dated event by its times there moves only the instants. Once the new API is back, the event's `start_date`/`end_date` (which the apps show) still hold the old days, so check events edited during the window.

To remove the columns, in a later forward migration after the code revert has shipped (this loses which events were all-day, tentative or calendar-only):

```sql
alter table public.events
  drop constraint if exists events_timing_kind,
  drop constraint if exists events_timing_dates,
  drop constraint if exists events_calendar_only_shape,
  drop column if exists timing,
  drop column if exists start_date,
  drop column if exists end_date,
  drop column if exists is_tentative,
  drop column if exists calendar_only;
```
