import { parseBareDateLocalNoon } from "./bare-date";
import { parseInstant } from "./instant";

/** 52 weeks: last year's Saturday lands on a Saturday (#3930). */
const SHIFT_DAYS = 364;

/**
 * A date written out in full, with its year ("April 13, 2026"): a line about
 * last year must say which year, and dates are never abbreviated.
 */
function fullDate(at: Date | null): string {
  return at
    ? at.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";
}

/** An instant (an event's start), as the reader's own calendar day. */
export function lastYearDay(instant: string | null | undefined): string {
  return fullDate(parseInstant(instant));
}

/** A stored `YYYY-MM-DD` (a task's due date), in every time zone that day. */
export function lastYearBareDay(day: string | null | undefined): string {
  return fullDate(day ? parseBareDateLocalNoon(day) : null);
}

/**
 * The same weekday and time of day this year, in the reader's zone: 52 weeks
 * on by the calendar, so a clock change in between doesn't move the hour.
 * A suggestion waits up to two weeks, so by the time an officer opens it that
 * day may have passed: it then moves on a week at a time to the next one
 * still ahead, and the form never opens on a date already gone.
 */
export function sameWeekdayThisYear(
  instant: unknown,
  notBefore: Date = new Date(),
): Date | null {
  const at = parseInstant(instant);
  if (!at) return null;
  const moved = new Date(at);
  moved.setDate(moved.getDate() + SHIFT_DAYS);
  while (moved.getTime() < notBefore.getTime()) {
    moved.setDate(moved.getDate() + 7);
  }
  return moved;
}

const DAY_MS = 86_400_000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A `YYYY-MM-DD` day as a whole UTC day number, or null when it isn't one. */
function dayNumber(day: string | null | undefined): number | null {
  const match = day ? ISO_DAY.exec(day) : null;
  if (!match) return null;
  const time = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return new Date(time).toISOString().slice(0, 10) === day
    ? Math.round(time / DAY_MS)
    : null;
}

/**
 * An all-day or time-TBD event's days this year (#6144), the dated twin of
 * {@link sameWeekdayThisYear}: its first day 52 weeks on, then a week at a
 * time until it isn't before the reader's today, and its last day moved with
 * it. Read from the event's zone-free days, never its stored midnights
 * (`spec/behavior/events.md` § Dates, tentative and on the calendar only),
 * and today counts as ahead, since an all-day event today hasn't passed.
 * Null when the first day doesn't read.
 */
export function datedDaysThisYear(
  startDate: string | null | undefined,
  lastDay: string | null | undefined,
  now: Date = new Date(),
): { startDate: string; lastDay: string | null } | null {
  const first = dayNumber(startDate);
  if (first === null) return null;
  const today = Math.round(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS,
  );
  let moved = first + SHIFT_DAYS;
  while (moved < today) moved += 7;
  const offset = moved - first;
  const last = dayNumber(lastDay);
  const iso = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
  return {
    startDate: iso(moved),
    lastDay: last !== null && last > first ? iso(last + offset) : null,
  };
}

/**
 * Last year's name, for this year's event: "Winter Formal 2025" held in 2025
 * becomes "Winter Formal 2026". Only the year the event was held in moves, so
 * a count or a room number that happens to be four digits stays.
 */
export function nameForThisYear(
  name: string,
  lastYearStart: unknown,
  thisYearStart: Date | null,
): string {
  const held = parseInstant(lastYearStart);
  if (!held || !thisYearStart) return name;
  const from = String(held.getFullYear());
  const to = String(thisYearStart.getFullYear());
  return from === to
    ? name
    : name.replace(new RegExp(`(?<!\\d)${from}(?!\\d)`, "g"), to);
}
