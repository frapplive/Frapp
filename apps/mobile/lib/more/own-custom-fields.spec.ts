import { describe, expect, it } from "vitest";
import type { OwnCustomField } from "@repo/hooks";
import {
  ownCustomFieldKeyboard,
  ownCustomFieldOptions,
  ownCustomFieldRows,
} from "./own-custom-fields";

const field = (over: Partial<OwnCustomField>): OwnCustomField => ({
  field_id: "f",
  key: "k",
  label: "Field",
  type: "text",
  visibility: "chapter",
  required: false,
  choices: null,
  max_length: null,
  value: null,
  ...over,
});

describe("ownCustomFieldRows (#581)", () => {
  it("reads each field's value, who sees it, and the control for its type", () => {
    const rows = ownCustomFieldRows([
      field({
        field_id: "a",
        label: "Allergies",
        visibility: "exec",
        value: "Peanuts",
      }),
      field({
        field_id: "s",
        label: "T-shirt size",
        type: "select",
        choices: ["S"],
      }),
      field({
        field_id: "d",
        label: "Can drive",
        type: "boolean",
        visibility: "self",
        value: "true",
      }),
      field({
        field_id: "p",
        label: "Emergency contact (phone)",
        type: "phone",
        value: "+15185550142",
      }),
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        value: "Peanuts",
        audience: "Officers see this",
        control: "type",
      }),
      expect.objectContaining({
        value: "Not set",
        audience: "Your chapter sees this",
        control: "pick",
      }),
      expect.objectContaining({
        value: "Yes",
        audience: "Only you see this",
        control: "switch",
        on: true,
      }),
      expect.objectContaining({ value: "(518) 555-0142" }),
    ]);
  });

  it("offers Not set on a pick unless a required field already has a value", () => {
    const shirt = field({ type: "select", choices: ["S", "M"] });
    expect(ownCustomFieldOptions(shirt).map((o) => o.value)).toEqual([
      null,
      "S",
      "M",
    ]);
    expect(
      ownCustomFieldOptions({ ...shirt, required: true, value: "S" }).map(
        (o) => o.value,
      ),
    ).toEqual(["S", "M"]);
  });

  it("opens the keyboard for the type", () => {
    expect(ownCustomFieldKeyboard("decimal")).toBe("decimal-pad");
    expect(ownCustomFieldKeyboard("phone")).toBe("phone-pad");
    expect(ownCustomFieldKeyboard("text")).toBe("default");
  });
});
