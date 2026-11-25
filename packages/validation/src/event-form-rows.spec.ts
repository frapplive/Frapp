import { describe, expect, it } from "vitest";
import {
  EVENT_FORM_ROWS,
  EVENT_FORM_ROW_LABELS,
  describeCheckIn,
  describeEventTypeSets,
  eventLengthLabel,
  eventTypeFromForm,
  type EventFormRow,
} from "./event-form-rows";

describe("the event form's rows (#5561)", () => {
  it("names every row, in the order both apps draw them", () => {
    // Notes takes its name from the meetings module (#4934), so each app
    // names it; it sits after Description.
    expect(EVENT_FORM_ROWS.indexOf("notes")).toBe(
      EVENT_FORM_ROWS.indexOf("description") + 1,
    );
    expect(
      EVENT_FORM_ROWS.filter(
        (row): row is Exclude<EventFormRow, "notes"> => row !== "notes",
      ).map((row) => EVENT_FORM_ROW_LABELS[row]),
    ).toEqual([
      "Type",
      "When",
      "Repeat",
      "Location",
      "Who's coming",
      "Points",
      "Agenda",
      "Description",
      "Check-in",
    ]);
  });
});

describe("describeEventTypeSets", () => {
  it("says the points and whether the type makes everyone required", () => {
    expect(describeEventTypeSets({ point_value: 10, is_mandatory: true })).toBe(
      "10 points · Required",
    );
    expect(describeEventTypeSets({ point_value: 1, is_mandatory: false })).toBe(
      "1 point",
    );
    expect(describeEventTypeSets({ point_value: 0, is_mandatory: false })).toBe(
      "No points",
    );
  });
});

describe("describeCheckIn", () => {
  it("says when check-in opens, and that a zone is drawn", () => {
    expect(describeCheckIn(10)).toBe("Opens 10 minutes early");
    expect(describeCheckIn(1)).toBe("Opens 1 minute early");
    expect(describeCheckIn(0, true)).toBe("Opens at the start · In a zone");
  });

  it("asks for a fix when the field holds what it refuses", () => {
    expect(describeCheckIn(null)).toBe("Opening time needs a fix");
  });
});

describe("eventLengthLabel", () => {
  it("says a length the way the end-time list does", () => {
    expect(eventLengthLabel(30)).toBe("30 min");
    expect(eventLengthLabel(60)).toBe("1 hr");
    expect(eventLengthLabel(90)).toBe("1.5 hrs");
    expect(eventLengthLabel(120)).toBe("2 hrs");
    expect(eventLengthLabel(105)).toBe("1.75 hrs");
  });
});

describe("eventTypeFromForm", () => {
  it("carries the form's points and whether everyone must come", () => {
    expect(eventTypeFromForm("Work party", " 10 ", true)).toEqual({
      name: "Work party",
      point_value: 10,
      is_mandatory: true,
    });
  });

  it("caps points the field holds past the limit, as both apps read them", () => {
    expect(eventTypeFromForm("A", "150000", false).point_value).toBe(100_000);
  });

  it("makes 0 points from a blank, refused or member's field", () => {
    expect(eventTypeFromForm("A", "", false).point_value).toBe(0);
    expect(eventTypeFromForm("A", "-3", false).point_value).toBe(0);
    expect(eventTypeFromForm("A", "1.5", false).point_value).toBe(0);
    expect(eventTypeFromForm("A", null, false).point_value).toBe(0);
  });
});
