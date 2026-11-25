-- All-day, multi-day and time-TBD events; tentative events; events that are
-- on the calendar only (#6098, epic #6097).
--
-- WHAT CHANGES
--
-- `events` gains five columns:
--
--   timing         'timed' (default, every existing row), 'all_day' or
--                  'time_tbd'. A timed event is what every event was before.
--   start_date     The first day of an all-day or time-TBD event, as a
--   end_date       calendar date with no zone, so "January 11" reads as
--                  January 11 for every member wherever they are. An all-day
--                  event may span days (end_date on or after start_date, at
--                  most 366 days); a time-TBD event is one day. Both are null
--                  on a timed event.
--   is_tentative   The event might not happen ("Possibility of Meet the
--                  Greeks"). A status, so it never has to be written into the
--                  name.
--   calendar_only  The event is on the calendar for information: those it
--                  invites see it, and nobody checks in, earns points or is
--                  marked absent. Its points are 0 and it requires no one.
--
-- `start_time` and `end_time` stay required on every row. For a dated event
-- the API writes them as the saving request's local midnight bounds, so
-- every range read (lists, windows, the feed) keeps finding the event; the
-- dates, not those instants, are what the apps show.
--
-- Existing rows read as timed, not tentative, not calendar-only. Nothing
-- else changes.

alter table public.events
  add column if not exists timing text not null default 'timed',
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists is_tentative boolean not null default false,
  add column if not exists calendar_only boolean not null default false;

alter table public.events
  drop constraint if exists events_timing_kind,
  add constraint events_timing_kind check (
    timing in ('timed', 'all_day', 'time_tbd')
  ),
  drop constraint if exists events_timing_dates,
  add constraint events_timing_dates check (
    case timing
      when 'timed' then start_date is null and end_date is null
      when 'all_day' then
        start_date is not null
        and end_date is not null
        and end_date >= start_date
        and end_date - start_date <= 365
      when 'time_tbd' then
        start_date is not null and end_date = start_date
      else false
    end
  ),
  drop constraint if exists events_calendar_only_shape,
  add constraint events_calendar_only_shape check (
    not calendar_only or (point_value = 0 and is_mandatory = false)
  );

comment on column public.events.timing is
  'timed (default), all_day or time_tbd (#6098). A dated event is shown by start_date/end_date; start_time/end_time hold local-midnight bounds for range reads.';
comment on column public.events.start_date is
  'First day of an all_day or time_tbd event, zone-free; null on a timed event.';
comment on column public.events.end_date is
  'Last day (inclusive) of an all_day event, start_date on a time_tbd event; null on a timed event.';
comment on column public.events.is_tentative is
  'The event might not happen (#6098). Shown as a status and sent as STATUS:TENTATIVE in the calendar feed.';
comment on column public.events.calendar_only is
  'On the calendar for information only (#6098): no check-in, no points, nobody marked absent.';
