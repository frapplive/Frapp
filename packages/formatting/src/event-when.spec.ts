import { describe, expect, it } from "vitest";
import {
  eventChipWords,
  formatEventDayTime,
  formatEventRelativeWhen,
  formatEventRowTime,
  formatEventWhen,
} from "./event-when";

// Package tests run in America/Los_Angeles. Wednesday, November 25, 2026.
const now = new Date("2026-11-25T10:00:00-08:00");

const allDay = (start: string, end?: string) => ({
  timing: "all_day",
  start_date: start,
  end_date: end ?? start,
  // The saver's midnights, in another zone: never what's shown.
  start_time: `${start}T05:00:00Z`,
  end_time: `${end ?? start}T05:00:00Z`,
});

describe("formatEventWhen", () => {
  it("reads a timed event as formatEventWindow does", () => {
    expect(
      formatEventWhen(
        {
          start_time: "2026-11-25T19:00:00-08:00",
          end_time: "2026-11-25T20:00:00-08:00",
        },
        now,
      ),
    ).toBe("Tonight · 7:00 – 8:00 PM");
  });

  it("reads a one-day event by its day, never its midnight", () => {
    expect(formatEventWhen(allDay("2026-11-25"), now)).toBe("Today · All day");
    expect(formatEventWhen(allDay("2026-11-26"), now)).toBe(
      "Tomorrow · All day",
    );
    expect(formatEventWhen(allDay("2026-11-28"), now)).toBe(
      "Saturday · All day",
    );
    expect(formatEventWhen(allDay("2026-12-14"), now)).toBe(
      "Monday, December 14 · All day",
    );
  });

  it("reads a span as its first and last day", () => {
    expect(formatEventWhen(allDay("2027-01-22", "2027-02-12"), now)).toBe(
      "January 22, 2027 – February 12, 2027",
    );
    expect(formatEventWhen(allDay("2026-12-01", "2026-12-04"), now)).toBe(
      "December 1 – December 4",
    );
  });

  it("says Time TBD for a day whose time isn't set", () => {
    expect(
      formatEventWhen(
        { timing: "time_tbd", start_date: "2026-11-27", end_date: null },
        now,
      ),
    ).toBe("Friday · Time TBD");
  });
});

describe("formatEventDayTime", () => {
  it("writes the full date", () => {
    expect(formatEventDayTime(allDay("2026-12-14"), now)).toBe(
      "Monday, December 14 · All day",
    );
    expect(formatEventDayTime(allDay("2026-12-01", "2026-12-04"), now)).toBe(
      "Tuesday, December 1 – Friday, December 4",
    );
  });
});

describe("formatEventRowTime", () => {
  it("is the time range, or the word, under a day heading", () => {
    expect(
      formatEventRowTime(
        {
          start_time: "2026-11-25T19:00:00-08:00",
          end_time: "2026-11-25T21:00:00-08:00",
        },
        now,
      ),
    ).toBe("7:00 – 9:00 PM");
    expect(formatEventRowTime(allDay("2026-11-25"), now)).toBe("All day");
    expect(
      formatEventRowTime({ timing: "time_tbd", start_date: "2026-11-27" }, now),
    ).toBe("Time TBD");
    expect(formatEventRowTime(allDay("2026-12-01", "2026-12-04"), now)).toBe(
      "All day · December 1 – December 4",
    );
  });
});

describe("formatEventRelativeWhen", () => {
  it("says the day relative to now", () => {
    expect(formatEventRelativeWhen(allDay("2026-11-24"), now)).toBe(
      "Yesterday · All day",
    );
    expect(formatEventRelativeWhen(allDay("2026-12-14"), now)).toBe(
      "December 14 · All day",
    );
  });
});

describe("eventChipWords", () => {
  it("says the name, when, required and tentative in one order", () => {
    expect(
      eventChipWords("Rush BBQ", "Time TBD", {
        required: true,
        tentative: true,
      }),
    ).toEqual({
      label: "Open Rush BBQ, Time TBD, required, tentative",
      visible: "Time TBD",
    });
    expect(eventChipWords("Chapter", null, {}).label).toBe("Open Chapter");
  });
});
