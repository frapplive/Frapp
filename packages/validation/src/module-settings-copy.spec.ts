import { describe, expect, it } from "vitest";
import {
  moduleRulesFootnote,
  moduleSwitchLine,
  moduleTierLabel,
  readBoundedNumber,
  rushContactsSkippedLine,
  serviceRateHint,
} from "./module-settings-copy";

describe("module page words (#6030)", () => {
  it("says what a module being off hides, then the role's line", () => {
    expect(
      moduleSwitchLine({
        on: false,
        alwaysOn: false,
        offNote: "No one can post a new poll in chat.",
        canManage: false,
      }),
    ).toBe(
      "Off. No one can post a new poll in chat. Turning it back on brings everything back; nothing was deleted. Your role can't switch modules on or off.",
    );
    expect(
      moduleSwitchLine({
        on: true,
        alwaysOn: false,
        offNote: "",
        canManage: true,
      }),
    ).toBeUndefined();
    expect(
      moduleSwitchLine({
        on: true,
        alwaysOn: true,
        offNote: "",
        canManage: false,
      }),
    ).toBeUndefined();
  });

  it("calls a paid module Chapter Pro, never Paid", () => {
    expect(moduleTierLabel("paid")).toBe("Chapter Pro");
    expect(moduleTierLabel("free")).toBe("Free");
  });

  it("adds the role's line to the Rules footnote for a reader", () => {
    expect(moduleRulesFootnote(true)).toBe("Changes are recorded in Logs.");
    expect(moduleRulesFootnote(false, "Limits.")).toBe(
      "Limits. Changes are recorded in Logs. Your role can't change these.",
    );
  });

  it("works the point rate for a real shift", () => {
    expect(serviceRateHint(6, 30)).toBe(
      "A 3-hour shift earns 6 points, and 10 points take 5 hours. Entries already approved keep theirs.",
    );
    expect(serviceRateHint(1, 9)).toContain(
      "1 point, and 10 points take 1.5 hours",
    );
  });

  it("reads a bounded whole number, or says why it isn't one", () => {
    expect(readBoundedNumber(" 12 ", 1, 100)).toEqual({ value: 12 });
    expect(readBoundedNumber("", 1, 100)).toEqual({ error: "Enter a number." });
    expect(readBoundedNumber("0", 1, 100)).toEqual({
      error: "Use a whole number from 1.",
    });
    expect(readBoundedNumber("1.5", 1, 100)).toEqual({
      error: "Use a whole number from 1.",
    });
    expect(readBoundedNumber("5000", 1, 1000)).toEqual({
      error: "Use 1,000 or less.",
    });
  });

  it("names who in the contacts Group isn't told", () => {
    expect(rushContactsSkippedLine(["Ana"])).toBe(
      "Ana can't open recruitment, so isn't told.",
    );
    expect(rushContactsSkippedLine(["Ana", "Ben", "Cal"])).toBe(
      "Ana, Ben and Cal can't open recruitment, so aren't told.",
    );
  });
});
