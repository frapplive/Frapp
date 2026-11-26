import {
  EVENT_ALL_DAY_LABEL,
  EVENT_TIME_TBD_LABEL,
  eventDaySpan,
  eventLastDay,
  eventTiming,
  type EventTimingFields,
} from "@repo/validation";
import { parseBareDateLocalNoon } from "./bare-date";
import { dayDelta } from "./calendar-days";
import {
  formatDay,
  formatDayTimeRange,
  formatEventWindow,
  formatRelativeDayTime,
  formatTimeRange,
  formatWeekdayDay,
} from "./display";

/**
 * An event's when, in every shape it can take (`spec/behavior/events.md`
 * § Dates, tentative and on the calendar only, #6098). A timed event reads
 * as it always has, through `display.ts`. An all-day or time-TBD event reads
 * by its zone-free days and never by its stored times, which are the saver's
 * midnights: "Friday · All day", "January 22 – February 12",
 * "Tomorrow · Time TBD". Google Calendar and Apple Calendar word an all-day
 * event this way (the day, then "All day"; a span as its first and last day).
 *
 * Every event surface on both apps (rows, the event page, chat's card,
 * Activity, search) reads one of these, so a dated event never shows
 * "12:00 AM" anywhere.
 */
export interface EventWhenFields extends EventTimingFields {
  start_time?: unknown;
  end_time?: unknown;
}

function dayOf(value: string | null | undefined): Date | null {
  return value ? parseBareDateLocalNoon(value) : null;
}

/** "Today", "Tomorrow", the weekday within the week, else "Saturday, March 14". */
function relativeDay(at: Date, now: Date): string {
  const days = dayDelta(now, at);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days < 7) {
    return at.toLocaleDateString(undefined, { weekday: "long" });
  }
  return formatWeekdayDay(at, now) ?? "";
}

/** "January 22 – February 12", the year on each end outside the current one. */
function daySpan(first: Date, last: Date, now: Date): string {
  return `${formatDay(first, now)} – ${formatDay(last, now)}`;
}

/** "All day" or "Time TBD", the word a dated event takes where a time would go. */
export function eventDatedWord(event: EventTimingFields): string | null {
  const timing = eventTiming(event);
  if (timing === "all_day") return EVENT_ALL_DAY_LABEL;
  if (timing === "time_tbd") return EVENT_TIME_TBD_LABEL;
  return null;
}

/** The dated event's first and last day, or null for a timed one. */
function datedDays(event: EventTimingFields): [Date, Date] | null {
  if (eventTiming(event) === "timed") return null;
  const first = dayOf(event.start_date);
  const last = dayOf(eventLastDay(event));
  return first && last ? [first, last] : null;
}

/**
 * For someone deciding whether to go (chat's event card, the event page's
 * head, Activity): {@link formatEventWindow} for a timed event; else
 * `"Tonight · …"`-style relative words for the day and "All day" or
 * "Time TBD", or a span's first and last day.
 */
export function formatEventWhen(
  event: EventWhenFields,
  now: Date = new Date(),
): string | null {
  const days = datedDays(event);
  if (eventTiming(event) === "timed") {
    return formatEventWindow(event.start_time, event.end_time, now);
  }
  if (!days) return null;
  const [first, last] = days;
  if (eventDaySpan(event) > 1) return daySpan(first, last, now);
  return `${relativeDay(first, now)} · ${eventDatedWord(event)}`;
}

/**
 * The full date, no relative words (a record's details, a search result):
 * {@link formatDayTimeRange} for a timed event; `"Friday, November 6 · All
 * day"`, or `"Thursday, January 22 – Thursday, February 12"` for a span.
 */
export function formatEventDayTime(
  event: EventWhenFields,
  now: Date = new Date(),
): string | null {
  if (eventTiming(event) === "timed") {
    return formatDayTimeRange(event.start_time, event.end_time, now);
  }
  const days = datedDays(event);
  if (!days) return null;
  const [first, last] = days;
  if (eventDaySpan(event) > 1) {
    return `${formatWeekdayDay(first, now)} – ${formatWeekdayDay(last, now)}`;
  }
  return `${formatWeekdayDay(first, now)} · ${eventDatedWord(event)}`;
}

/**
 * A row under a day heading that already says the day: {@link formatTimeRange}
 * for a timed event; "All day", "Time TBD", or "All day · January 22 –
 * February 12" for a span, so a row on one of its days says how long it runs.
 */
export function formatEventRowTime(
  event: EventWhenFields,
  now: Date = new Date(),
): string | null {
  if (eventTiming(event) === "timed") {
    return formatTimeRange(event.start_time, event.end_time, now);
  }
  const days = datedDays(event);
  if (!days) return eventDatedWord(event);
  const [first, last] = days;
  if (eventDaySpan(event) > 1) {
    return `${EVENT_ALL_DAY_LABEL} · ${daySpan(first, last, now)}`;
  }
  return eventDatedWord(event);
}

/**
 * A list row with no day heading over it: {@link formatRelativeDayTime} for a
 * timed event; `"Friday · All day"`, `"Today · Time TBD"`, or a span's first
 * and last day.
 */
export function formatEventRelativeWhen(
  event: EventWhenFields,
  now: Date = new Date(),
): string | null {
  if (eventTiming(event) === "timed") {
    return formatRelativeDayTime(event.start_time, now);
  }
  const days = datedDays(event);
  if (!days) return null;
  const [first, last] = days;
  if (eventDaySpan(event) > 1) return daySpan(first, last, now);
  const delta = dayDelta(now, first);
  const day =
    delta === 0 || delta === 1 || delta === -1 || (delta > 1 && delta < 7)
      ? relativeDay(first, now)
      : formatDay(first, now);
  const word = eventDatedWord(event);
  return `${day} · ${word}`;
}
