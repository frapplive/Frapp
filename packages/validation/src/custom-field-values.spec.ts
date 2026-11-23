import { describe, expect, it } from "vitest";
import {
  checkCustomFieldValue,
  CUSTOM_FIELD_TEXT_MAX_LENGTH,
  type CustomFieldValueRule,
  ownCustomFieldChanges,
  type OwnCustomFieldShape,
} from "./custom-field-values";

const rule = (
  type: CustomFieldValueRule["type"],
  extra: Partial<CustomFieldValueRule> = {},
): CustomFieldValueRule => ({
  label: "Field",
  type,
  required: false,
  ...extra,
});

describe("checkCustomFieldValue", () => {
  it("stores an empty or blank value as no value", () => {
    expect(checkCustomFieldValue(rule("text"), "")).toEqual({
      ok: true,
      value: null,
    });
    expect(checkCustomFieldValue(rule("text"), "   ")).toEqual({
      ok: true,
      value: null,
    });
    expect(checkCustomFieldValue(rule("select"), null)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("refuses clearing a required field", () => {
    expect(
      checkCustomFieldValue(rule("text", { required: true }), " "),
    ).toEqual({ ok: false, message: "Field is required." });
  });

  it("trims text and caps it at the field's max_length or the house cap", () => {
    expect(checkCustomFieldValue(rule("text"), "  Peanuts ")).toEqual({
      ok: true,
      value: "Peanuts",
    });
    expect(
      checkCustomFieldValue(
        rule("text", { options: { max_length: 3 } }),
        "abcd",
      ).ok,
    ).toBe(false);
    expect(
      checkCustomFieldValue(
        rule("text"),
        "x".repeat(CUSTOM_FIELD_TEXT_MAX_LENGTH + 1),
      ).ok,
    ).toBe(false);
    // A field's own cap never raises the house one.
    expect(
      checkCustomFieldValue(
        rule("text", { options: { max_length: 10_000 } }),
        "x".repeat(CUSTOM_FIELD_TEXT_MAX_LENGTH + 1),
      ).ok,
    ).toBe(false);
  });

  it("takes whole numbers for number and canonicalizes them", () => {
    expect(checkCustomFieldValue(rule("number"), "007")).toEqual({
      ok: true,
      value: "7",
    });
    expect(checkCustomFieldValue(rule("number"), "-3")).toEqual({
      ok: true,
      value: "-3",
    });
    expect(checkCustomFieldValue(rule("number"), "3.5").ok).toBe(false);
    expect(checkCustomFieldValue(rule("number"), "abc").ok).toBe(false);
    expect(checkCustomFieldValue(rule("number"), "1e3").ok).toBe(false);
    expect(
      checkCustomFieldValue(rule("number"), "99999999999999999999").ok,
    ).toBe(false);
  });

  it("takes decimals for decimal", () => {
    expect(checkCustomFieldValue(rule("decimal"), "3.40")).toEqual({
      ok: true,
      value: "3.4",
    });
    expect(checkCustomFieldValue(rule("decimal"), ".5")).toEqual({
      ok: true,
      value: "0.5",
    });
    expect(checkCustomFieldValue(rule("decimal"), "3,4").ok).toBe(false);
    expect(checkCustomFieldValue(rule("decimal"), "Infinity").ok).toBe(false);
    expect(checkCustomFieldValue(rule("decimal"), "1e5").ok).toBe(false);
  });

  it("takes a phone number for phone", () => {
    expect(checkCustomFieldValue(rule("phone"), "(518) 555-0142")).toEqual({
      ok: true,
      value: "(518) 555-0142",
    });
    expect(checkCustomFieldValue(rule("phone"), "call my mom").ok).toBe(false);
  });

  it("takes only a listed choice for select", () => {
    const shirt = rule("select", { options: { choices: ["S", "M", "L"] } });
    expect(checkCustomFieldValue(shirt, "M")).toEqual({ ok: true, value: "M" });
    expect(checkCustomFieldValue(shirt, "m").ok).toBe(false);
    expect(checkCustomFieldValue(shirt, "XXL").ok).toBe(false);
  });

  it("takes true or false for boolean", () => {
    expect(checkCustomFieldValue(rule("boolean"), "true")).toEqual({
      ok: true,
      value: "true",
    });
    expect(checkCustomFieldValue(rule("boolean"), "false")).toEqual({
      ok: true,
      value: "false",
    });
    expect(checkCustomFieldValue(rule("boolean"), "yes").ok).toBe(false);
  });
});

describe("ownCustomFieldChanges", () => {
  const fields: OwnCustomFieldShape[] = [
    {
      field_id: "shirt",
      label: "T-shirt size",
      type: "select",
      required: false,
      choices: ["S", "M"],
      value: "S",
    },
    {
      field_id: "ec",
      label: "Emergency contact (name)",
      type: "text",
      required: true,
      value: null,
    },
    {
      field_id: "gpa",
      label: "Cumulative GPA",
      type: "decimal",
      required: false,
      value: "3.4",
    },
    {
      field_id: "kids",
      label: "Siblings",
      type: "number",
      required: false,
      value: null,
    },
  ];

  it("sends only what changed, and never an untouched empty required field", () => {
    expect(
      ownCustomFieldChanges(fields, {
        shirt: "M",
        ec: "",
        gpa: "3.4 ",
        kids: "",
      }),
    ).toEqual({ values: [{ field_id: "shirt", value: "M" }], problems: {} });
  });

  it("sends a cleared optional value as null", () => {
    expect(ownCustomFieldChanges(fields, { gpa: "" }).values).toEqual([
      { field_id: "gpa", value: null },
    ]);
  });

  it("reports each refused field by id and sends it nowhere", () => {
    const { values, problems } = ownCustomFieldChanges(fields, {
      kids: "two",
      shirt: "M",
    });
    expect(Object.keys(problems)).toEqual(["kids"]);
    expect(values).toEqual([{ field_id: "shirt", value: "M" }]);
  });
});
