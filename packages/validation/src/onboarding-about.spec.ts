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

describe("needsAboutYou with the chapter's fields (#5926)", () => {
  it("shows the step when a required field has no value", () => {
    expect(needsAboutYou(full, [{ required: true, value: null }])).toBe(true);
    expect(needsAboutYou(full, [{ required: true, value: "  " }])).toBe(true);
  });

  it("skips it when every required field has one", () => {
    expect(needsAboutYou(full, [{ required: true, value: "Ann" }])).toBe(false);
  });

  it("never asks for an empty optional field alone", () => {
    expect(needsAboutYou(full, [{ required: false, value: null }])).toBe(false);
  });
});
