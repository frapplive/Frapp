import { describe, expect, it } from "vitest";
import {
  datedDaysThisYear,
  lastYearEventDay,
  nameForThisYear,
  sameWeekdayThisYear,
} from "./last-year";

describe("last-year dates (#3930)", () => {
  it("moves an event 52 weeks on, so its weekday stays", () => {
    const held = new Date("2025-12-06T21:00:00Z");
    const moved = sameWeekdayThisYear(
      held.toISOString(),
      new Date("2026-11-12T00:00:00Z"),
    )!;
    expect(moved.getDay()).toBe(held.getDay());
    expect(Math.round((moved.getTime() - held.getTime()) / 86_400_000)).toBe(
      364,
    );
  });

  it("never lands on a day already gone: the next same weekday still ahead", () => {
    const held = new Date("2025-11-15T21:00:00Z");
    // Its day this year was November 14; the officer opens it on the 20th.
    const moved = sameWeekdayThisYear(
      held.toISOString(),
      new Date("2026-11-20T12:00:00Z"),
    )!;
    expect(moved.toISOString()).toBe("2026-11-21T21:00:00.000Z");
    expect(moved.getDay()).toBe(held.getDay());
  });

  it("carries the year in a name forward, and only that year", () => {
    const start = new Date("2026-12-05T21:00:00Z");
    expect(
      nameForThisYear("Winter Formal 2025", "2025-12-06T21:00:00Z", start),
    ).toBe("Winter Formal 2026");
    expect(
      nameForThisYear("Room 2024 mixer", "2025-12-06T21:00:00Z", start),
    ).toBe("Room 2024 mixer");
    expect(nameForThisYear("Formal 20255", "2025-12-06T21:00:00Z", start)).toBe(
      "Formal 20255",
    );
    expect(nameForThisYear("Formal", "2025-12-06T21:00:00Z", start)).toBe(
      "Formal",
    );
    expect(nameForThisYear("Formal 2025", "not a date", start)).toBe(
      "Formal 2025",
    );
  });
});

describe("datedDaysThisYear (#6144)", () => {
  // Saturday, November 22, 2025 to Sunday the 23rd, an all-day retreat.
  const now = new Date(2026, 10, 12, 15);

  it("moves the days 52 weeks on, to the same weekdays, keeping the span", () => {
    expect(datedDaysThisYear("2025-11-22", "2025-11-23", now)).toEqual({
      startDate: "2026-11-21",
      lastDay: "2026-11-22",
    });
  });

  it("moves a week further while the first day is before today", () => {
    expect(datedDaysThisYear("2025-11-08", null, now)).toEqual({
      startDate: "2026-11-14",
      lastDay: null,
    });
  });

  it("keeps today, since an all-day event today hasn't passed", () => {
    // November 13, 2025 is 52 weeks before November 12, 2026.
    expect(datedDaysThisYear("2025-11-13", null, now)?.startDate).toBe(
      "2026-11-12",
    );
  });

  it("drops a last day that isn't after the first, and reads no bad day", () => {
    expect(datedDaysThisYear("2025-11-22", "2025-11-22", now)?.lastDay).toBe(
      null,
    );
    expect(datedDaysThisYear("2025-02-30", null, now)).toBe(null);
    expect(datedDaysThisYear(null, null, now)).toBe(null);
  });
});

// The suite runs in Los Angeles, west of a New York saver.
describe("lastYearEventDay (#6148)", () => {
  // An all-day retreat on November 22, 2025, saved in New York: its stored
  // start is New York's midnight, still the 21st in California.
  const NY_MIDNIGHT = "2025-11-22T05:00:00.000Z";

  it("reads a dated event by its own day, not its stored midnight", () => {
    expect(
      lastYearEventDay({
        last_year_at: NY_MIDNIGHT,
        last_year_date: "2025-11-22",
      }),
    ).toBe("November 22, 2025");
  });

  it("reads a suggestion stored without the day as before", () => {
    expect(lastYearEventDay({ last_year_at: NY_MIDNIGHT })).toBe(
      "November 21, 2025",
    );
    expect(
      lastYearEventDay({ last_year_at: NY_MIDNIGHT, last_year_date: null }),
    ).toBe("November 21, 2025");
  });

  it("reads a timed event's start in the reader's zone", () => {
    expect(lastYearEventDay({ last_year_at: "2025-11-22T03:00:00.000Z" })).toBe(
      "November 21, 2025",
    );
    expect(lastYearEventDay({ last_year_at: null })).toBe("");
  });
});
