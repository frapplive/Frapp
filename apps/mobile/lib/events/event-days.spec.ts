import { describe, expect, it } from "vitest";
import { eventDayKeys, eventsByDay } from "./event-days";

/** A timed event at a local wall-clock time, so the spec reads in any zone. */
const timed = (id: string, day: number, hour: number) => ({
  id,
  start_time: new Date(2026, 10, day, hour).toISOString(),
  timing: "timed",
});

// Stored with a saver's midnight five hours west of UTC: never read for its day.
const formal = {
  id: "formal",
  start_time: "2026-11-20T05:00:00.000Z",
  timing: "all_day",
  start_date: "2026-11-20",
  end_date: "2026-11-22",
};
const tbd = {
  id: "tbd",
  start_time: "2026-11-21T05:00:00.000Z",
  timing: "time_tbd",
  start_date: "2026-11-21",
  end_date: null,
};

describe("which days an event sits on (#6098)", () => {
  it("files a timed event on its start's local day", () => {
    expect(eventDayKeys(timed("a", 9, 19))).toEqual(["2026-11-09"]);
  });

  it("files a dated event on each of its own days, never by its instants", () => {
    expect(eventDayKeys(formal)).toEqual([
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
    expect(eventDayKeys(tbd)).toEqual(["2026-11-21"]);
  });

  it("leads each day with its dated events, timed ones after in order", () => {
    const byDay = eventsByDay([timed("early", 21, 9), formal, tbd]);
    expect(byDay.get("2026-11-21")?.map((event) => event.id)).toEqual([
      "formal",
      "tbd",
      "early",
    ]);
    expect(byDay.get("2026-11-22")?.map((event) => event.id)).toEqual([
      "formal",
    ]);
    expect(byDay.has("2026-11-23")).toBe(false);
  });
});
