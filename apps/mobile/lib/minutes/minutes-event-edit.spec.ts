import { describe, expect, it } from "vitest";
import { minutesEventPatch } from "./minutes-event-edit";

const START = new Date(2026, 10, 9, 19);
const END = new Date(2026, 10, 9, 20);
const stored = { name: "Chapter", start: START, end: END };

describe("what Edit details on minutes sends to its event", () => {
  it("sends only the name for a rename of a timed meeting", () => {
    expect(
      minutesEventPatch(
        { name: " Chapter II ", start: START, end: END },
        stored,
        false,
      ),
    ).toEqual({ name: "Chapter II" });
  });

  it("sends a moved time", () => {
    const later = new Date(2026, 10, 9, 20);
    const laterEnd = new Date(2026, 10, 9, 21);
    expect(
      minutesEventPatch(
        { name: "Chapter", start: later, end: laterEnd },
        stored,
        false,
      ),
    ).toEqual({
      start_time: later.toISOString(),
      end_time: laterEnd.toISOString(),
    });
  });

  it("never sends times for an all-day or time-TBD event, which would make it timed (#6098)", () => {
    expect(
      minutesEventPatch(
        { name: "Retreat", start: new Date(2026, 10, 10, 9), end: null },
        stored,
        true,
      ),
    ).toEqual({ name: "Retreat" });
  });
});
