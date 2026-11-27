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

/**
 * Why an event takes no attendance, as the API's 409 code names it
 * (`attendance.calendar_only`, `attendance.time_tbd`), or null when it takes
 * attendance. Calendar-only wins: it never takes any, whatever its time.
 */
export function eventNoAttendanceReason(
  event: EventTimingFields,
): "calendar_only" | "time_tbd" | null {
  if (eventTakesAttendance(event)) return null;
  return event.calendar_only ? "calendar_only" : "time_tbd";
}

/**
 * The API's refusal words for each reason, which the phone's host check-in
 * screen says too rather than drawing a code nobody can redeem (#6144).
 */
export const EVENT_NO_ATTENDANCE_COPY: Record<
  "calendar_only" | "time_tbd",
  string
> = {
  calendar_only: "This event is on the calendar only, so nobody checks in.",
  time_tbd: "This event's time isn't set yet, so check-in hasn't opened.",
};

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

/**
 * A dated event's last day (`end_date`, else its one day), or null for a
 * timed event or a dated one whose first day doesn't read.
 */
export function eventLastDay(event: EventTimingFields): string | null {
  if (!eventIsDated(event)) return null;
  if (eventDayNumber(event.start_date) === null) return null;
  return eventDayNumber(event.end_date) !== null
    ? (event.end_date as string)
    : (event.start_date as string);
}

/** How many days a dated event covers, first to last inclusive; 0 for a timed one. */
export function eventDaySpan(event: EventTimingFields): number {
  const first = eventDayNumber(event.start_date);
  const last = eventDayNumber(eventLastDay(event));
  if (!eventIsDated(event) || first === null || last === null) return 0;
  return Math.max(1, last - first + 1);
}

/**
 * Whether a dated event covers `day` (`YYYY-MM-DD`). The calendar views draw
 * a dated event on each of its days by these zone-free dates, never by its
 * stored instants, which are the saver's midnights (§ Dates, tentative and on
 * the calendar only). False for a timed event.
 */
export function eventCoversDay(event: EventTimingFields, day: string): boolean {
  const first = eventDayNumber(event.start_date);
  const last = eventDayNumber(eventLastDay(event));
  const at = eventDayNumber(day);
  if (!eventIsDated(event) || first === null || last === null || at === null) {
    return false;
  }
  return at >= first && at <= last;
}

/**
 * The day a dated event has reached by `now`, as the viewer's own calendar
 * day: before its first day, on one of its days, or after its last. Null for
 * a timed event. The "on now" rules read this instead of instants, so an
 * all-day event is never "the meeting on now" and never "starts soon".
 */
export function eventDatedPhase(
  event: EventTimingFields,
  now: Date,
): "before" | "during" | "after" | null {
  const first = eventDayNumber(event.start_date);
  const last = eventDayNumber(eventLastDay(event));
  if (!eventIsDated(event) || first === null || last === null) return null;
  const today = Math.round(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
  if (today < first) return "before";
  if (today > last) return "after";
  return "during";
}

/**
 * The fields of a loosely typed event record (a list row, a Realtime payload)
 * these rules read, dropping anything malformed.
 */
export function eventTimingFieldsOf(
  event: Record<string, unknown>,
): EventTimingFields {
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    timing: text(event.timing),
    start_date: text(event.start_date),
    end_date: text(event.end_date),
    is_tentative: event.is_tentative === true,
    calendar_only: event.calendar_only === true,
  };
}

/**
 * The days (`YYYY-MM-DD`) a dated event is on, first to last, or none for a
 * timed event or one whose first day doesn't read. Both apps' list, month
 * and week views place a dated event on each of these (`eventCoversDay`'s
 * rule).
 */
export function eventDatedDays(event: EventTimingFields): string[] {
  const span = eventDaySpan(event);
  if (span === 0 || !event.start_date) return [];
  const days: string[] = [];
  for (let offset = 0; offset < span; offset += 1) {
    const day = addEventDays(event.start_date, offset);
    if (day) days.push(day);
  }
  return days;
}
