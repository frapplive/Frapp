import { describe, expect, it } from "vitest";
import {
  currentSemesterStart,
  dayAfter,
  newSemesterDefaults,
  SEMESTER_SETTINGS_COPY,
  semesterRolloverOpensOn,
} from "./semester-settings";

const spring = {
  start_date: "2026-01-12",
  end_date: "2026-05-08",
  created_at: "2026-05-09T14:00:00Z",
};
const fall = {
  start_date: "2025-08-25",
  end_date: "2025-12-15",
  created_at: "2025-12-16T14:00:00Z",
};

describe("the Semester page's rules (#6028)", () => {
  it("starts the current semester the day after the newest archive ends", () => {
    expect(currentSemesterStart([fall, spring])).toBe("2026-05-09");
    // Newest by when it was filed, as the API picks it, not by its dates.
    expect(
      currentSemesterStart([
        spring,
        { ...fall, created_at: "2026-06-01T00:00:00Z" },
      ]),
    ).toBe("2025-12-16");
    expect(currentSemesterStart([])).toBeNull();
  });

  it("rolls a month and a year over", () => {
    expect(dayAfter("2026-01-31")).toBe("2026-02-01");
    expect(dayAfter("2026-12-31")).toBe("2027-01-01");
    expect(dayAfter("not a day")).toBeNull();
  });

  it("says when the next rollover opens only within the month of the last one (UTC)", () => {
    expect(
      semesterRolloverOpensOn([spring], new Date("2026-05-20T12:00:00Z")),
    ).toBe("2026-06-01");
    expect(
      semesterRolloverOpensOn([spring], new Date("2026-06-01T00:00:00Z")),
    ).toBeNull();
    expect(
      semesterRolloverOpensOn(
        [{ ...fall, created_at: "2026-12-02T00:00:00Z" }],
        new Date("2026-12-20T00:00:00Z"),
      ),
    ).toBe("2027-01-01");
    expect(semesterRolloverOpensOn([], new Date())).toBeNull();
  });

  it("fills the new page's dates from the archives and today", () => {
    expect(newSemesterDefaults([spring], "2026-12-15")).toEqual({
      start: "2026-05-09",
      end: "2026-12-15",
    });
    expect(newSemesterDefaults([], "2026-12-15").start).toBe("");
  });

  it("names the semester that ends, which is what the API archives", () => {
    expect(SEMESTER_SETTINGS_COPY.confirmTitle("Fall 2026")).toBe(
      "End Fall 2026 and start a new semester?",
    );
    expect(
      SEMESTER_SETTINGS_COPY.confirmBody(
        "Fall 2026",
        "May 9 – December 15, 2026",
        "December 16",
        null,
      ),
    ).toBe(
      "Fall 2026, May 9 – December 15, 2026, is archived and standings count from December 16. Points already awarded are kept.",
    );
  });
});
