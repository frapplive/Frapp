import { formatServiceHours } from "@repo/hooks";

/**
 * The numbers at the top of the member's Service hours panel (#4669, #5950):
 * the viewer's own approved hours this semester and all time, and what is
 * still waiting on review.
 *
 * Approved only for the two totals, as Directory's standings and the phone's
 * summary card count (`apps/mobile/lib/more/service-hours.ts`): pending time
 * isn't credited yet, so it stands beside them rather than inside them.
 */
export type OwnServiceTotals = {
  /** `null` while the semester's start is unknown (loading, or its read failed). */
  semesterMinutes: number | null;
  allTimeMinutes: number;
  pendingMinutes: number;
  pendingCount: number;
};

type TotalsEntry = { status: string; date: string; duration_minutes: number };

/**
 * `semesterStart` is the first day of this semester as `YYYY-MM-DD`
 * (`serviceSemesterStartDate`), `null` for a chapter that never rolled over
 * (this semester is all time), and `undefined` while it is unknown. Entries are
 * the viewer's own; the caller filters them.
 */
export function ownServiceTotals(
  entries: readonly TotalsEntry[],
  semesterStart: string | null | undefined,
): OwnServiceTotals {
  let allTimeMinutes = 0;
  let semesterMinutes = 0;
  let pendingMinutes = 0;
  let pendingCount = 0;
  for (const entry of entries) {
    const minutes = Number.isFinite(entry.duration_minutes)
      ? entry.duration_minutes
      : 0;
    if (entry.status === "PENDING") {
      pendingMinutes += minutes;
      pendingCount += 1;
    } else if (entry.status === "APPROVED") {
      allTimeMinutes += minutes;
      // Bare `YYYY-MM-DD` on both sides, so a string compare is a date compare
      // and no time zone can move an entry across the line.
      if (
        semesterStart === null ||
        (semesterStart !== undefined &&
          entry.date.slice(0, 10) >= semesterStart)
      ) {
        semesterMinutes += minutes;
      }
    }
  }
  return {
    semesterMinutes: semesterStart === undefined ? null : semesterMinutes,
    allTimeMinutes,
    pendingMinutes,
    pendingCount,
  };
}

/** `90` → `"1.5 h"`, `0` → `"0 h"`: a stat's number. */
export function hoursLabel(minutes: number): string {
  return `${formatServiceHours(minutes)} h`;
}
