import { describe, expect, it } from "vitest";
import {
  isLivePointsPeriod,
  pointRowText,
  pointsPeriodOptions,
  signedPoints,
} from "./point-history";

describe("point history (#5950)", () => {
  it("offers the live periods, then each archived semester", () => {
    expect(
      pointsPeriodOptions([{ id: "arch-1", label: "Spring 2026" }]),
    ).toEqual([
      { value: "all", label: "All time" },
      { value: "semester", label: "This semester" },
      { value: "month", label: "This month" },
      { value: "arch-1", label: "Spring 2026" },
    ]);
    expect(isLivePointsPeriod("month")).toBe(true);
    expect(isLivePointsPeriod("arch-1")).toBe(false);
    expect(isLivePointsPeriod("toString")).toBe(false);
  });

  it("titles a row by its reason, else its category, never saying it twice", () => {
    expect(
      pointRowText({ description: "Chapter meeting", category: "ATTENDANCE" }),
    ).toEqual({ title: "Chapter meeting", metaCategory: "Attendance" });
    expect(pointRowText({ description: "  ", category: "FINE" })).toEqual({
      title: "Fine",
      metaCategory: null,
    });
    expect(pointRowText({ description: null, category: null })).toEqual({
      title: "Points",
      metaCategory: null,
    });
  });

  it("writes an award with its plus and a fine with its minus", () => {
    expect(signedPoints(10)).toBe("+10");
    expect(signedPoints(0)).toBe("+0");
    expect(signedPoints(-5)).toBe("-5");
  });
});
