import type {
  ChapterCustomField,
  CreateCustomField,
  CustomFieldType,
  CustomFieldVisibility,
} from "./chapter-config";
import { keyFromLabel } from "./custom-field-key";
import {
  MEMBER_FIELDS_COPY,
  memberFieldSortPatches,
  moveId,
} from "./people-settings-copy";

/**
 * The rules behind both apps' Member fields pages (#6029): web's
 * `settings-fields-tab.tsx` and the phone's `member-fields.tsx` and
 * `member-field.tsx` read these, so a picker's order, a new field's checks
 * and its create body are the same on both.
 */

/** The types in the Type picker's order: the everyday ones first. */
export const MEMBER_FIELD_TYPES: readonly CustomFieldType[] = [
  "text",
  "select",
  "boolean",
  "phone",
  "number",
  "decimal",
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
    return MEMBER_FIELDS_COPY.maxLengthFloor;
  }
  return null;
}

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
 * a key made from the name (the officer never types one). No `sort`: the API
 * puts a new field at the end, which a list read earlier could tie with.
 */
export function createFieldBody(
  draft: NewFieldDraft,
  existing: readonly Pick<ChapterCustomField, "key">[],
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
  const choice = choices[index];
  return choice === undefined ? null : moveId(choices, choice, by);
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
