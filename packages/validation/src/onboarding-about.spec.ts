import { describe, expect, it } from "vitest";
import { needsAboutYou } from "./onboarding-about";

const full = {
  phone: "+15185550142",
  major: "Physics",
  graduationYear: 2028,
  birthdayMonth: 3,
  birthdayDay: 14,
};

describe("needsAboutYou", () => {
  it("skips the step when all four are filled in", () => {
    expect(needsAboutYou(full)).toBe(false);
  });

  it("shows it when any one is empty", () => {
    expect(needsAboutYou({ ...full, phone: null })).toBe(true);
    expect(needsAboutYou({ ...full, major: "  " })).toBe(true);
    expect(needsAboutYou({ ...full, graduationYear: undefined })).toBe(true);
    expect(needsAboutYou({ ...full, birthdayMonth: null })).toBe(true);
    expect(needsAboutYou({ ...full, birthdayDay: null })).toBe(true);
  });

  it("doesn't need the birth year", () => {
    expect(needsAboutYou(full)).toBe(false);
  });
});
