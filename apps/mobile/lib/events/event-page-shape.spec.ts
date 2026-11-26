import { describe, expect, it } from "vitest";
import { eventPageShows } from "./event-page-shape";

describe("what Event details draws for an event's shape (#6098)", () => {
  it("draws everything for a timed event", () => {
    expect(eventPageShows({ timing: "timed" })).toEqual({
      checkIn: true,
      points: true,
      roster: true,
      excuses: true,
      tentative: false,
    });
  });

  it("draws nothing about attending for an event on the calendar only", () => {
    expect(
      eventPageShows({ timing: "all_day", calendar_only: true }),
    ).toMatchObject({
      checkIn: false,
      points: false,
      roster: false,
      excuses: false,
    });
  });

  it("offers nothing to attend until a time-TBD event has a time", () => {
    expect(eventPageShows({ timing: "time_tbd" })).toMatchObject({
      checkIn: false,
      points: false,
      roster: false,
      excuses: false,
    });
  });

  it("checks in to an all-day event", () => {
    expect(eventPageShows({ timing: "all_day" })).toMatchObject({
      checkIn: true,
    });
  });

  it("marks a tentative event", () => {
    expect(eventPageShows({ is_tentative: true }).tentative).toBe(true);
  });
});
