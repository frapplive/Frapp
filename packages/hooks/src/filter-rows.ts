import { matchesWordStarts, normalizeWords } from "./fuzzy-match";

/**
 * One filter of a list, as both apps draw it (rulebook § 9,
 * `spec/ui/design-system/components.md` § 13 Filter bar): web's `FilterMenu`
 * gives each a menu row that opens its options, and the phone's `FilterSheet`
 * gives each a sheet row that opens them in place. A screen on both apps
 * builds its rows in one shared function (the Directory's is
 * `directoryFilterRows`), so either app draws the same rows in one order.
 */
export type FilterRow = {
  key: string;
  label: string;
  options: readonly FilterRowOption[];
  value: string;
  /** The option that means "no filter" (All, Any). Not counted as on. */
  anyValue: string;
  onChange: (value: string) => void;
  /** A sort row is listed with the filters but never counted or cleared. */
  isSort?: boolean;
};

export type FilterRowOption = {
  value: string;
  label: string;
  /**
   * A dot before the label in the colour of what the option names (a role's
   * colour on the phone's Role list). `null` draws the neutral dot.
   */
  color?: string | null;
};

/**
 * Past this many options (the "any" option not counted), a filter's list
 * gets a type-to-filter field. 8 is Frapp's number (`components.md` § 13
 * Picker); NN/g finds lists past about 15 hard to scan.
 */
export const FILTER_SEARCH_THRESHOLD = 8;

/** The "no filter" value `anyFilterRow` gives a row; no id or value can be it. */
export const ANY_FILTER = "\u0000any";

/**
 * A filter whose state is `null` for "any", as one row: its "any" option
 * leads the list. The Directory and Tasks keep their filters this way.
 */
export function anyFilterRow({
  key,
  label,
  anyLabel,
  options,
  value,
  onChange,
}: {
  key: string;
  label: string;
  anyLabel: string;
  options: readonly FilterRowOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}): FilterRow {
  return {
    key,
    label,
    options: [{ value: ANY_FILTER, label: anyLabel }, ...options],
    value: value ?? ANY_FILTER,
    anyValue: ANY_FILTER,
    onChange: (next) => onChange(next === ANY_FILTER ? null : next),
  };
}

/** The filters that are on: off their "any" value, sorts never counted. */
export function filtersOn(filters: readonly FilterRow[]): FilterRow[] {
  return filters.filter((f) => !f.isSort && f.value !== f.anyValue);
}

/** Puts every filter that is on back to its "any" value; sorts stay. */
export function clearFilters(filters: readonly FilterRow[]): void {
  for (const filter of filtersOn(filters)) filter.onChange(filter.anyValue);
}

/** The label of a row's current option, for its value and its applied chip. */
export function filterValueLabel(filter: FilterRow): string {
  return filter.options.find((o) => o.value === filter.value)?.label ?? "";
}

/** Whether a row's options get a search field (sorts never do). */
export function isFilterSearchable(filter: FilterRow): boolean {
  if (filter.isSort) return false;
  const choices = filter.options.filter((o) => o.value !== filter.anyValue);
  return choices.length > FILTER_SEARCH_THRESHOLD;
}

/**
 * Whether a typed query narrows anything. Punctuation alone doesn't (the
 * matcher drops it), so "(" on the way to "(Exec)" still lists "Any role".
 */
export function hasFilterQuery(query: string): boolean {
  return normalizeWords(query).length > 0;
}

/**
 * A row's options for a typed query. Every word typed starts a word of the
 * label, case, accents and punctuation ignored (`matchesWordStarts`: "exec"
 * finds "(Exec) Treasurer"), and the "any" option steps aside while a query
 * is typed, so a query never clears the filter by matching "Any role". A
 * query with no words in it lists every option, "any" first.
 */
export function searchFilterOptions(
  filter: FilterRow,
  query: string,
): readonly FilterRowOption[] {
  if (!hasFilterQuery(query)) return filter.options;
  return filter.options.filter(
    (o) => o.value !== filter.anyValue && matchesWordStarts(o.label, query),
  );
}
