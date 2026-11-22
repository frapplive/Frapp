import { ATTENDANCE_SEARCH_FROM } from "./event-attendance";

/**
 * The words and rules of the one Type menu (web) and Type sheet (phone) that
 * pick, make, rename and delete a chapter's own types: event types and
 * document types alike (Paul 2026-11-22, "yo what is this?" at the old
 * "Edit types" popover; `spec/ui/design-system/components.md` § Type menu).
 * Comparable: Notion's select options and Linear's labels, which find, create
 * and edit an option from the menu that applies it.
 */

/**
 * Past this many types, someone who can only pick gets a search too, as Who's
 * coming does past as many roles. Someone who can add a type always has it.
 */
export const TYPE_SEARCH_FROM = ATTENDANCE_SEARCH_FROM;

/** The search for someone who can add a type: it finds one, or offers to make it. */
export const TYPE_FIND_OR_ADD = "Find or add a type";

/** The search for someone who can only pick. */
export const TYPE_FIND = "Find a type";

/** The row that holds no type, first while the search is empty. */
export const TYPE_NONE = "No type";

/** Said when the search matches nothing and nothing can be made. */
export const TYPE_NO_MATCH = "No type by that name.";

/** The edit view's destructive action. */
export const TYPE_DELETE = "Delete type";

/** A type's edit view and its row's edit button, from its name. */
export function editTypeLabel(name: string): string {
  return `Edit ${name}`;
}

/** The row that makes the typed type: `Create “Work party”`. */
export function addTypeLabel(name: string): string {
  return `Create “${name}”`;
}

/** A typed name tidied as the server stores it: trimmed, inner runs of space collapsed. */
export function tidyTypeName(typed: string): string {
  return typed.trim().replace(/\s+/g, " ");
}

/** Whether a type's name holds what was typed in the search, ignoring case. */
export function typeMatchesSearch(name: string, typed: string): boolean {
  const query = tidyTypeName(typed).toLocaleLowerCase();
  return query === "" || name.toLocaleLowerCase().includes(query);
}

/**
 * The name "Create “…”" would make from what is typed, or `null` when it
 * offers nothing: a blank field, a name past `maxLength`, a list already at
 * `max`, or a type already called that. `keyOf` is how the server tells two
 * names apart (event types by case-folded name; document types by
 * `documentTypeKey`, letters and digits only).
 */
export function typeToAdd(
  typed: string,
  types: readonly { name: string }[],
  limits: {
    max: number;
    maxLength: number;
    keyOf?: (name: string) => string;
  },
): string | null {
  const name = tidyTypeName(typed);
  if (name === "" || name.length > limits.maxLength) return null;
  if (types.length >= limits.max) return null;
  const keyOf =
    limits.keyOf ?? ((value: string) => value.trim().toLocaleLowerCase());
  const key = keyOf(name);
  if (key === "") return null;
  return types.some((type) => keyOf(type.name) === key) ? null : name;
}
