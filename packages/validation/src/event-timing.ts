/**
 * When an event happens, beyond a start and an end time:
 * `spec/behavior/events.md` § Dates, tentative and on the calendar only
 * (#6098, epic #6097).
 *
 * - `timed`: a start and end time, what every event was before.
 * - `all_day`: one or more whole days, `start_date` through `end_date`
 *   (inclusive), with no time ("First day of classes", "Formal recruitment,
 *   Jan 22 – Feb 12").
 * - `time_tbd`: one day whose time isn't set yet.
 *
 * A dated event's days are zone-free (`YYYY-MM-DD`): January 11 reads as
 * January 11 for every member. Its `start_time` and `end_time` still hold the
 * saving request's local-midnight bounds so range reads keep finding it; the
 * apps show the dates, never those instants.
 *
 * Two more flags ride alongside: `is_tentative` (the event might not happen)
 * and `calendar_only` (it's on the calendar for information: nobody checks in,
 * earns points or is marked absent).
 */

export const EVENT_TIMINGS = ["timed", "all_day", "time_tbd"] as const;

export type EventTiming = (typeof EVENT_TIMINGS)[number];

export function isEventTiming(value: unknown): value is EventTiming {
  return (
    typeof value === "string" &&
    (EVENT_TIMINGS as readonly string[]).includes(value)
  );
}

/** The longest an all-day event may run, first day to last, inclusive. */
export const EVENT_DATED_SPAN_MAX_DAYS = 366;

/** What the apps call each shape, and the answer and status they add. */
export const EVENT_ALL_DAY_LABEL = "All day";
export const EVENT_TIME_TBD_LABEL = "Time TBD";
export const EVENT_TENTATIVE_LABEL = "Tentative";
export const EVENT_CALENDAR_ONLY_LABEL = "On the calendar only";

/** The event fields these rules read. Older rows may lack the columns. */
export interface EventTimingFields {
  timing?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_tentative?: boolean | null;
  calendar_only?: boolean | null;
}

/** The event's timing; a row from before the column reads as timed. */
export function eventTiming(event: EventTimingFields): EventTiming {
  return isEventTiming(event.timing) ? event.timing : "timed";
}

/** Whether the event is set by day rather than by time (all-day or TBD). */
export function eventIsDated(event: EventTimingFields): boolean {
  return eventTiming(event) !== "timed";
}

/**
 * Whether the event takes attendance at all: a check-in window, points for
 * coming and absences for missing it. A calendar-only event never does, and a
 * time-TBD one doesn't until its time is set. An all-day event does (a
 * day-long service drive still counts).
 */
export function eventTakesAttendance(event: EventTimingFields): boolean {
  return !event.calendar_only && eventTiming(event) !== "time_tbd";
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date written `YYYY-MM-DD`, as a UTC day number, or null. */
export function eventDayNumber(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  return check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
    ? Math.round(time / 86_400_000)
    : null;
}

/** `date` (`YYYY-MM-DD`) moved by `days`, or null for a date that isn't real. */
export function addEventDays(date: string, days: number): string | null {
  const n = eventDayNumber(date);
  if (n === null) return null;
  return new Date((n + days) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Why a dated event's days are wrong, as the API and both forms say it, or
 * null when they're fine. `end_date` omitted is the start day.
 */
export function eventDatesProblem(
  timing: EventTiming,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): string | null {
  if (timing === "timed") {
    return startDate || endDate
      ? "A timed event has no start_date or end_date; send start_time and end_time."
      : null;
  }
  const start = eventDayNumber(startDate);
  if (start === null) return "Pick the day it's on (start_date, YYYY-MM-DD).";
  if (endDate === null || endDate === undefined) return null;
  const end = eventDayNumber(endDate);
  if (end === null) return "end_date must be a real date, YYYY-MM-DD.";
  if (timing === "time_tbd" && end !== start) {
    return "An event whose time isn't set is on one day.";
  }
  if (end < start) return "The last day can't be before the first.";
  if (end - start + 1 > EVENT_DATED_SPAN_MAX_DAYS) {
    return `An all-day event can run at most ${EVENT_DATED_SPAN_MAX_DAYS} days.`;
  }
  return null;
}
