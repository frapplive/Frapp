import type { CustomFieldType, CustomFieldVisibility } from "./chapter-config";
import { isPhoneNumber, PHONE_INVALID_MESSAGE } from "./phone";

/**
 * A member's own value for one of the chapter's custom fields (#581): the rule
 * the API enforces on `PATCH /v1/members/me/custom-fields` and the rule both
 * forms check before they send, so the two can't disagree about what a
 * T-shirt size or an emergency phone may be (`spec/behavior/members.md`
 * § Custom Fields).
 *
 * Every value is stored as text (`member_custom_field_values.value`); this is
 * what that text may say for each field type.
 */

/**
 * The longest text value a field takes when its definition sets no
 * `options.max_length`. A field's own `max_length` may lower it, never raise
 * it, so no value grows past what a profile row can show.
 */
export const CUSTOM_FIELD_TEXT_MAX_LENGTH = 500;

/** How many values one save may carry: more than any chapter defines. */
export const CUSTOM_FIELD_VALUES_PER_SAVE_MAX = 100;

/**
 * The seeded field keys the profile already owns as its own fields: Major and
 * Graduation year live on the member's account (`users.major`,
 * `users.graduation_year`, set on web `/profile` and the phone's Edit profile
 * sheet, and correctable by an officer since #4367). Chapters onboarded before
 * #581 still carry seeded custom fields with these keys, which nobody can
 * write a value to; the member's own "More details" list leaves them out, and
 * the write path refuses them, so a member is never asked for their major
 * twice and the two can't disagree. New chapters are no longer seeded with
 * them (`CUSTOM_FIELDS_SEED`).
 */
export const PROFILE_OWNED_CUSTOM_FIELD_KEYS: readonly string[] = Object.freeze(
  ["major", "graduation_year"],
);

/** The subset of a field definition the value rule reads. */
export type CustomFieldValueRule = {
  label: string;
  type: CustomFieldType;
  required: boolean;
  options?: { choices?: string[]; max_length?: number } | null;
};

/** What `true` and `false` are stored as for a `boolean` field. */
export const CUSTOM_FIELD_BOOLEAN_VALUES = ["true", "false"] as const;

const INTEGER = /^-?\d+$/;
const DECIMAL = /^-?(\d+(\.\d*)?|\.\d+)$/;

/** The longest text a field of this definition takes. */
export function customFieldTextMaxLength(rule: CustomFieldValueRule): number {
  const own = rule.options?.max_length;
  return typeof own === "number" && own > 0
    ? Math.min(own, CUSTOM_FIELD_TEXT_MAX_LENGTH)
    : CUSTOM_FIELD_TEXT_MAX_LENGTH;
}

export type CustomFieldValueCheck =
  { ok: true; value: string | null } | { ok: false; message: string };

/**
 * Check one value a member typed for a field, and return what is stored:
 * trimmed, with `null` for "no value" (an empty string, or only spaces).
 * A required field can't be cleared once set; its first value can still wait,
 * since a save of one field never has to fill every other.
 *
 * A phone number is checked here and stored normalized by the API
 * (`normalizePhone` in `@repo/formatting`), as the profile's own Phone is.
 */
export function checkCustomFieldValue(
  rule: CustomFieldValueRule,
  raw: string | null | undefined,
): CustomFieldValueCheck {
  const value = typeof raw === "string" ? raw.trim() : null;
  if (value === null || value === "") {
    return rule.required
      ? { ok: false, message: `${rule.label} is required.` }
      : { ok: true, value: null };
  }
  switch (rule.type) {
    case "text": {
      const max = customFieldTextMaxLength(rule);
      return value.length > max
        ? {
            ok: false,
            message: `${rule.label} is ${max.toLocaleString("en-US")} characters at most.`,
          }
        : { ok: true, value };
    }
    case "number":
      return INTEGER.test(value) && Number.isSafeInteger(Number(value))
        ? { ok: true, value: String(Number(value)) }
        : { ok: false, message: `${rule.label} takes a whole number.` };
    case "decimal": {
      const parsed = Number(value);
      return DECIMAL.test(value) &&
        Number.isFinite(parsed) &&
        value.length <= 32
        ? { ok: true, value: String(parsed) }
        : { ok: false, message: `${rule.label} takes a number, like 3.42.` };
    }
    case "phone":
      return isPhoneNumber(value)
        ? { ok: true, value }
        : { ok: false, message: PHONE_INVALID_MESSAGE };
    case "select":
      return (rule.options?.choices ?? []).includes(value)
        ? { ok: true, value }
        : { ok: false, message: `Pick one of the choices for ${rule.label}.` };
    case "boolean":
      return (CUSTOM_FIELD_BOOLEAN_VALUES as readonly string[]).includes(value)
        ? { ok: true, value }
        : { ok: false, message: `${rule.label} is yes or no.` };
  }
}

/**
 * Who sees a field besides its member, said under it on the member's own form
 * so they know before they type an allergy who reads it. Settings' Fields tab
 * sets the tier; `rbac.md` § Custom field visibility tiers is the rule.
 */
export const CUSTOM_FIELD_AUDIENCE_LINE: Record<CustomFieldVisibility, string> =
  {
    chapter: "Your chapter sees this",
    exec: "Officers see this",
    president: "Your president sees this",
    self: "Only you see this",
  };

/** The member's own "More details", on web `/profile` and the phone's You tab. */
export const OWN_CUSTOM_FIELDS_COPY = {
  title: "More details",
  hint: "Your chapter asks for these. Each says who sees it.",
  notSet: "Not set",
  save: "Save details",
  saved: "Details saved",
  saveFailed: "Couldn't save your details",
} as const;

/**
 * One of the member's own fields as `GET /v1/members/me/custom-fields` serves
 * it: the definition flattened (`choices`, `max_length`) with their value.
 */
export type OwnCustomFieldShape = {
  field_id: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  choices?: string[] | null;
  max_length?: number | null;
  value: string | null;
};

/** The value rule for a field in its served, flattened shape. */
export function ownCustomFieldRule(
  field: OwnCustomFieldShape,
): CustomFieldValueRule {
  return {
    label: field.label,
    type: field.type,
    required: field.required,
    options: {
      choices: field.choices ?? undefined,
      max_length: field.max_length ?? undefined,
    },
  };
}

/**
 * What a save of the member's form sends, from what they typed per field
 * (`draft`, keyed by field id; a field they didn't touch may be absent):
 * only the fields whose value changed, each checked by
 * {@link checkCustomFieldValue}. A field left empty that had no value isn't
 * sent, so a required field nobody has filled in never refuses a save of
 * another. `problems` holds each refused field's message, keyed by field id;
 * a save with any problem sends nothing.
 */
export function ownCustomFieldChanges(
  fields: readonly OwnCustomFieldShape[],
  draft: Readonly<Record<string, string>>,
): {
  values: { field_id: string; value: string | null }[];
  problems: Record<string, string>;
} {
  const values: { field_id: string; value: string | null }[] = [];
  const problems: Record<string, string> = {};
  for (const field of fields) {
    const typed = draft[field.field_id];
    if (typed === undefined) continue;
    const saved = field.value ?? "";
    if (typed.trim() === saved.trim()) continue;
    if (typed.trim() === "" && saved === "") continue;
    const checked = checkCustomFieldValue(ownCustomFieldRule(field), typed);
    if (!checked.ok) {
      problems[field.field_id] = checked.message;
      continue;
    }
    values.push({ field_id: field.field_id, value: checked.value });
  }
  return { values, problems };
}
