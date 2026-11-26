import { describe, expect, it } from "vitest";
import {
  EVENT_DATED_SPAN_MAX_DAYS,
  addEventDays,
  eventCoversDay,
  eventDatedPhase,
  eventDaySpan,
  eventLastDay,
  eventDatesProblem,
  eventDayNumber,
  eventIsDated,
  eventTakesAttendance,
  eventTiming,
} from "./event-timing";

describe("eventTiming", () => {
  it("reads a row from before the column as timed", () => {
    expect(eventTiming({})).toBe("timed");
    expect(eventTiming({ timing: null })).toBe("timed");
    expect(eventTiming({ timing: "nonsense" })).toBe("timed");
    expect(eventTiming({ timing: "all_day" })).toBe("all_day");
  });

  it("calls all-day and TBD events dated", () => {
    expect(eventIsDated({ timing: "timed" })).toBe(false);
    expect(eventIsDated({ timing: "all_day" })).toBe(true);
    expect(eventIsDated({ timing: "time_tbd" })).toBe(true);
  });
});

describe("eventTakesAttendance", () => {
  it("is true for timed and all-day events", () => {
    expect(eventTakesAttendance({})).toBe(true);
    expect(eventTakesAttendance({ timing: "all_day" })).toBe(true);
  });

  it("is false on the calendar only and while the time is TBD", () => {
    expect(eventTakesAttendance({ calendar_only: true })).toBe(false);
    expect(eventTakesAttendance({ timing: "time_tbd" })).toBe(false);
  });
});

describe("day arithmetic", () => {
  it("rejects dates that aren't real", () => {
    expect(eventDayNumber("2027-02-29")).toBeNull();
    expect(eventDayNumber("2027-1-5")).toBeNull();
    expect(eventDayNumber(20270105)).toBeNull();
  });

  it("moves across months and years", () => {
    expect(addEventDays("2027-01-31", 1)).toBe("2027-02-01");
    expect(addEventDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addEventDays("2027-02-12", -21)).toBe("2027-01-22");
  });
});

describe("eventDatesProblem", () => {
  it("accepts one day and a span", () => {
    expect(eventDatesProblem("all_day", "2027-01-11", undefined)).toBeNull();
    expect(eventDatesProblem("all_day", "2027-01-22", "2027-02-12")).toBeNull();
    expect(
      eventDatesProblem("time_tbd", "2027-01-14", "2027-01-14"),
    ).toBeNull();
  });

  it("needs a first day for a dated event", () => {
    expect(eventDatesProblem("all_day", null, null)).toMatch(/day/);
  });

  it("refuses a last day before the first, and a TBD event over days", () => {
    expect(eventDatesProblem("all_day", "2027-02-12", "2027-01-22")).toMatch(
      /before/,
    );
    expect(eventDatesProblem("time_tbd", "2027-01-14", "2027-01-15")).toMatch(
      /one day/,
    );
  });

  it("caps a span", () => {
    const last = addEventDays("2027-01-01", EVENT_DATED_SPAN_MAX_DAYS - 1);
    const past = addEventDays("2027-01-01", EVENT_DATED_SPAN_MAX_DAYS);
    expect(eventDatesProblem("all_day", "2027-01-01", last)).toBeNull();
    expect(eventDatesProblem("all_day", "2027-01-01", past)).toMatch(/at most/);
  });

  it("refuses days on a timed event", () => {
    expect(eventDatesProblem("timed", "2027-01-11", null)).toMatch(/timed/);
    expect(eventDatesProblem("timed", null, null)).toBeNull();
  });
});

describe("dated days", () => {
  const span = {
    timing: "all_day",
    start_date: "2027-01-22",
    end_date: "2027-02-12",
  };
  it("reads the last day and span", () => {
    expect(eventLastDay(span)).toBe("2027-02-12");
    expect(eventLastDay({ timing: "time_tbd", start_date: "2027-01-22" })).toBe(
      "2027-01-22",
    );
    expect(eventLastDay({ timing: "timed" })).toBeNull();
    expect(eventDaySpan(span)).toBe(22);
    expect(eventDaySpan({ timing: "timed" })).toBe(0);
  });

  it("covers each of its days and no other", () => {
    expect(eventCoversDay(span, "2027-01-22")).toBe(true);
    expect(eventCoversDay(span, "2027-02-12")).toBe(true);
    expect(eventCoversDay(span, "2027-02-13")).toBe(false);
    expect(eventCoversDay({ timing: "timed" }, "2027-01-22")).toBe(false);
  });

  it("phases by the viewer's own day", () => {
    const at = (iso: string) => new Date(`${iso}T23:30:00`);
    expect(eventDatedPhase(span, at("2027-01-21"))).toBe("before");
    expect(eventDatedPhase(span, at("2027-01-22"))).toBe("during");
    expect(eventDatedPhase(span, at("2027-02-12"))).toBe("during");
    expect(eventDatedPhase(span, at("2027-02-13"))).toBe("after");
    expect(eventDatedPhase({}, at("2027-02-13"))).toBeNull();
  });
});
