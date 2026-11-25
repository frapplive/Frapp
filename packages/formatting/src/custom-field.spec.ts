import { describe, expect, it } from "vitest";
import { formatCustomFieldValue } from "./custom-field";

describe("formatCustomFieldValue", () => {
  it("reads booleans as Yes or No, formats phones, and keeps the rest", () => {
    expect(formatCustomFieldValue("boolean", "true")).toBe("Yes");
    expect(formatCustomFieldValue("boolean", "false")).toBe("No");
    expect(formatCustomFieldValue("phone", "+15185550142")).toBe(
      "(518) 555-0142",
    );
    expect(formatCustomFieldValue("select", "M")).toBe("M");
  });

  it("is null with no value", () => {
    expect(formatCustomFieldValue("text", null)).toBeNull();
    expect(formatCustomFieldValue("text", " ")).toBeNull();
  });
});
