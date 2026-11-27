import {
  keyFromLabel,
  MEMBER_FIELDS_COPY,
  memberFieldSortPatches,
  moveId,
  type ChapterCustomField,
  type CreateCustomField,
  type CustomFieldType,
  type CustomFieldVisibility,
} from "@repo/validation";

/**
 * The rules behind the phone's Member fields pages (#6029): Chapter settings →
 * Member fields (`app/(app)/member-fields.tsx`) and one field's page
 * (`app/(app)/member-field.tsx`). The words and the order writes are shared
 * with web (`@repo/validation`'s `people-settings-copy.ts`).
 */

/** The types in the Type picker's order, as `MEMBER_FIELD_TYPE_LABEL` lists them. */
export const MEMBER_FIELD_TYPES: readonly CustomFieldType[] = [
  "text",
  "number",
  "decimal",
  "phone",
  "select",
  "boolean",
];

/** Who can see a field, in the Visible to picker's order. */
export const MEMBER_FIELD_VISIBILITIES: readonly CustomFieldVisibility[] = [
  "chapter",
  "exec",
  "president",
  "self",
];

/** A new field as its page holds it until "Add field". */
export type NewFieldDraft = {
  label: string;
  type: CustomFieldType;
  choices: string[];
  /** The longest answer as typed, "" for no limit. */
  maxLength: string;
  visibility: CustomFieldVisibility;
  required: boolean;
  sensitive: boolean;
};

export const EMPTY_FIELD_DRAFT: NewFieldDraft = {
  label: "",
  type: "text",
  choices: [],
  maxLength: "",
  visibility: "chapter",
  required: false,
  sensitive: false,
};

/**
 * What "Add field" says while it can't be pressed, or `null` once it can:
 * a name first, then a pick-one field's first option.
 */
export function newFieldBlocker(draft: NewFieldDraft): string | null {
  if (!draft.label.trim()) return MEMBER_FIELDS_COPY.needsName;
  if (draft.type === "select" && draft.choices.length === 0) {
    return MEMBER_FIELDS_COPY.needsOption;
  }
  if (draft.type === "text" && parseMaxLength(draft.maxLength) === undefined) {
    return MAX_LENGTH_INVALID;
  }
  return null;
}

/** Said under Longest answer for something that isn't a whole number over 0. */
export const MAX_LENGTH_INVALID = "Longest answer is a whole number";

/**
 * The longest answer as typed: a whole number over 0, `null` for blank (no
 * limit), `undefined` for anything the API would refuse.
 */
export function parseMaxLength(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/**
 * `POST /v1/custom-fields`' body for a draft that `newFieldBlocker` passes:
 * a key made from the name (the officer never types one), and the field at
 * the end of the list.
 */
export function createFieldBody(
  draft: NewFieldDraft,
  existing: readonly Pick<ChapterCustomField, "key" | "sort">[],
): CreateCustomField {
  const label = draft.label.trim();
  const maxLength =
    draft.type === "text" ? parseMaxLength(draft.maxLength) : null;
  const options =
    draft.type === "select"
      ? { choices: draft.choices }
      : typeof maxLength === "number"
        ? { max_length: maxLength }
        : undefined;
  return {
    key: keyFromLabel(
      label,
      existing.map((field) => field.key),
      "field",
    ),
    label,
    type: draft.type,
    required: draft.required,
    sensitive: draft.sensitive,
    visibility: draft.visibility,
    sort: existing.reduce((last, field) => Math.max(last, field.sort + 1), 0),
    ...(options ? { options } : {}),
  };
}

/**
 * The writes that move one field a place up or down, in the list's order:
 * `memberFieldSortPatches` for the new order, or `[]` at an end.
 */
export function moveFieldPatches(
  fields: readonly Pick<ChapterCustomField, "id" | "sort">[],
  id: string,
  by: -1 | 1,
): { id: string; sort: number }[] {
  const order = moveId(
    fields.map((field) => field.id),
    id,
    by,
  );
  return order ? memberFieldSortPatches(order, fields) : [];
}

/**
 * A pick-one field's options with one added at the end; unchanged for a blank
 * or one already there (ignoring case), so a list never holds the same twice.
 */
export function addChoice(choices: readonly string[], typed: string): string[] {
  const next = typed.trim();
  if (!next) return [...choices];
  const lower = next.toLowerCase();
  if (choices.some((choice) => choice.toLowerCase() === lower)) {
    return [...choices];
  }
  return [...choices, next];
}

/** Why an option can't be added, or `null` when it can. */
export function choiceProblem(
  choices: readonly string[],
  typed: string,
): string | null {
  const lower = typed.trim().toLowerCase();
  return choices.some((choice) => choice.toLowerCase() === lower)
    ? `“${typed.trim()}” is already an option.`
    : null;
}

/** One option a place up or down, or `null` at an end. */
export function moveChoice(
  choices: readonly string[],
  index: number,
  by: -1 | 1,
): string[] | null {
  const target = index + by;
  if (index < 0 || target < 0 || target >= choices.length) return null;
  const next = [...choices];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** A field's stored options with new choices, for `PATCH`. */
export function withChoices(
  options: ChapterCustomField["options"],
  choices: string[],
): NonNullable<ChapterCustomField["options"]> {
  return { ...(options ?? {}), choices };
}

/** A text field's stored options with a new longest answer (`null`: none). */
export function withMaxLength(
  options: ChapterCustomField["options"],
  maxLength: number | null,
): ChapterCustomField["options"] {
  const { max_length: _dropped, ...rest } = options ?? {};
  void _dropped;
  const next = maxLength === null ? rest : { ...rest, max_length: maxLength };
  return Object.keys(next).length > 0 ? next : null;
}
