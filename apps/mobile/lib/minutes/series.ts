import type { MeetingSummary } from "@repo/hooks";
import { localWeekStart } from "@repo/validation";

/**
 * One repeating meeting's minutes, for the series screen
 * (`app/(app)/minutes-series.tsx`, #5290). What is left of the phone's
 * Minutes list helpers once that list was folded into Documents (#5949),
 * where a series' posted minutes are filed in their own folder.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const startOf = (row: { event_start_time: string }) =>
  Date.parse(row.event_start_time);

/** The meetings of one series, newest first. */
export function seriesRows(
  rows: readonly MeetingSummary[],
  key: string,
): MeetingSummary[] {
  return rows
    .filter((row) => row.series_key === key)
    .sort((a, b) => startOf(b) - startOf(a));
}

/**
 * The time on a row's right: the weekday and time for a meeting this
 * calendar week, else the date, with the year only when it isn't this one.
 */
export function minutesRowTime(start: string, now: number): string {
  const at = new Date(start);
  if (Number.isNaN(at.getTime())) return "";
  // A weekday names one day only inside this calendar week.
  const week = localWeekStart(new Date(now)).getTime();
  if (at.getTime() >= week && at.getTime() < week + 7 * DAY_MS) {
    return at.toLocaleString("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const sameYear = at.getFullYear() === new Date(now).getFullYear();
  return at.toLocaleDateString(
    "en-US",
    sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
}
