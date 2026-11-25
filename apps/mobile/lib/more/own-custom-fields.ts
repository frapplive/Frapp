import { type OwnCustomField, ownCustomFieldOffersNotSet } from "@repo/hooks";
import { formatCustomFieldValue } from "@repo/formatting";
import {
  CUSTOM_FIELD_AUDIENCE_LINE,
  customFieldTextMaxLength,
  OWN_CUSTOM_FIELDS_COPY,
  ownCustomFieldRule,
  PHONE_MAX_LENGTH,
} from "@repo/validation";
import type { SheetOption } from "@/components/option-sheet";

/**
 * The You tab's "More details" rows (#581): one per field the chapter keeps on
 * a member, every tier, with the member's value and who else sees it. A tap
 * opens the control for the field's type: the pick sheet for a select, a
 * switch in the row for yes or no, and a one-field sheet for the rest. The
 * same fields, words and order as web `/profile`.
 */
export type OwnCustomFieldRow = {
  fieldId: string;
  label: string;
  /** The value as it reads, or "Not set". */
  value: string;
  /** Who else sees it ("Officers see this"). */
  audience: string;
  control: "pick" | "switch" | "type";
  /** A switch row's state. */
  on: boolean;
};

/** The control a field's type gets: a pick, a switch, or typed text. */
export function ownCustomFieldControl(
  type: OwnCustomField["type"],
): OwnCustomFieldRow["control"] {
  return type === "select" ? "pick" : type === "boolean" ? "switch" : "type";
}

export function ownCustomFieldRows(
  fields: readonly OwnCustomField[] | undefined,
): OwnCustomFieldRow[] {
  return (fields ?? []).map((field) => ({
    fieldId: field.field_id,
    label: field.label,
    value:
      formatCustomFieldValue(field.type, field.value) ??
      OWN_CUSTOM_FIELDS_COPY.notSet,
    audience: CUSTOM_FIELD_AUDIENCE_LINE[field.visibility],
    control: ownCustomFieldControl(field.type),
    on: field.value === "true",
  }));
}

/**
 * A select field's choices for the pick sheet, with "Not set" first unless
 * the field is required and already has a value (it can't go back to empty).
 */
export function ownCustomFieldOptions(field: OwnCustomField): SheetOption[] {
  const choices = (field.choices ?? []).map((choice) => ({
    value: choice,
    label: choice,
  }));
  return ownCustomFieldOffersNotSet(field)
    ? [{ value: null, label: OWN_CUSTOM_FIELDS_COPY.notSet }, ...choices]
    : choices;
}

/** The keyboard a typed field opens with. */
export function ownCustomFieldKeyboard(
  type: OwnCustomField["type"],
): "default" | "number-pad" | "decimal-pad" | "phone-pad" {
  if (type === "number") return "number-pad";
  if (type === "decimal") return "decimal-pad";
  if (type === "phone") return "phone-pad";
  return "default";
}

/**
 * A typed field's input rules, the same in the You tab's sheet and About you
 * after a join (#5926): its keyboard, the phone's autofill hint, and the
 * longest value it takes.
 */
export function ownCustomFieldInputProps(field: OwnCustomField): {
  keyboardType: ReturnType<typeof ownCustomFieldKeyboard>;
  textContentType: "telephoneNumber" | undefined;
  maxLength: number;
} {
  return {
    keyboardType: ownCustomFieldKeyboard(field.type),
    textContentType: field.type === "phone" ? "telephoneNumber" : undefined,
    maxLength:
      field.type === "phone"
        ? PHONE_MAX_LENGTH
        : customFieldTextMaxLength(ownCustomFieldRule(field)),
  };
}
