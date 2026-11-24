import { describe, expect, it } from "vitest";
import { aboutYouCustomFields, needsAboutYou } from "./onboarding-about";

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

describe("aboutYouCustomFields", () => {
  it("asks the required fields and keeps the rest behind More details, in order", () => {
    const fields = [
      { id: "allergies", required: false, value: null },
      { id: "contact", required: true, value: null },
      { id: "shirt", required: false, value: "M" },
      { id: "contact-phone", required: true, value: "+15185550142" },
    ];
    const { asked, more } = aboutYouCustomFields(fields);
    expect(asked.map((field) => field.id)).toEqual([
      "contact",
      "contact-phone",
    ]);
    expect(more.map((field) => field.id)).toEqual(["allergies", "shirt"]);
  });

  it("is empty before the fields load", () => {
    expect(aboutYouCustomFields(undefined)).toEqual({ asked: [], more: [] });
  });
});
