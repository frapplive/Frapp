import { describe, expect, it } from "vitest";
import {
  ANY_FILTER,
  FILTER_SEARCH_THRESHOLD,
  anyFilterRow,
  clearFilters,
  filterValueLabel,
  filtersOn,
  hasFilterQuery,
  isFilterSearchable,
  searchFilterOptions,
  type FilterRow,
} from "./filter-rows";

function row(
  overrides: Partial<FilterRow> & { changes?: string[] } = {},
): FilterRow {
  const { changes = [], ...rest } = overrides;
  return {
    key: "status",
    label: "Status",
    options: [
      { value: "any", label: "Any status" },
      { value: "active", label: "Active" },
      { value: "pending", label: "Pending" },
    ],
    value: "any",
    anyValue: "any",
    onChange: (value) => changes.push(value),
    ...rest,
  };
}

describe("anyFilterRow", () => {
  it("leads with the any row and maps it to and from null", () => {
    const changes: (string | null)[] = [];
    const filter = anyFilterRow({
      key: "role",
      label: "Role",
      anyLabel: "Any role",
      options: [{ value: "r1", label: "Treasurer" }],
      value: null,
      onChange: (value) => changes.push(value),
    });
    expect(filter.options[0]).toEqual({ value: ANY_FILTER, label: "Any role" });
    expect(filter.value).toBe(ANY_FILTER);
    expect(filter.anyValue).toBe(ANY_FILTER);
    filter.onChange("r1");
    filter.onChange(ANY_FILTER);
    expect(changes).toEqual(["r1", null]);
  });
});

describe("filtersOn and clearFilters", () => {
  it("counts a filter off its any value, never a sort", () => {
    const status = row({ value: "active" });
    const idle = row({ key: "idle" });
    const sort = row({ key: "sort", value: "active", isSort: true });
    expect(filtersOn([status, idle, sort])).toEqual([status]);
  });

  it("puts only the filters that are on back to any, leaving the sort", () => {
    const statusChanges: string[] = [];
    const sortChanges: string[] = [];
    clearFilters([
      row({ value: "active", changes: statusChanges }),
      row({ key: "idle", changes: [] }),
      row({
        key: "sort",
        value: "pending",
        isSort: true,
        changes: sortChanges,
      }),
    ]);
    expect(statusChanges).toEqual(["any"]);
    expect(sortChanges).toEqual([]);
  });
});

describe("filterValueLabel", () => {
  it("names the current option, or nothing for a value no option has", () => {
    expect(filterValueLabel(row({ value: "pending" }))).toBe("Pending");
    expect(filterValueLabel(row({ value: "gone" }))).toBe("");
  });
});

describe("searching a row's options", () => {
  const many = (n: number) => [
    { value: "any", label: "Any role" },
    ...Array.from({ length: n }, (_, i) => ({
      value: `r${i}`,
      label: i === 0 ? "(Exec) Treasurer" : `Role ${i}`,
    })),
  ];

  it("offers a search only past the threshold, the any option not counted", () => {
    expect(
      isFilterSearchable(row({ options: many(FILTER_SEARCH_THRESHOLD) })),
    ).toBe(false);
    expect(
      isFilterSearchable(row({ options: many(FILTER_SEARCH_THRESHOLD + 1) })),
    ).toBe(true);
    expect(
      isFilterSearchable(
        row({ options: many(FILTER_SEARCH_THRESHOLD + 1), isSort: true }),
      ),
    ).toBe(false);
  });

  it("matches word starts, and the any option steps aside while typing", () => {
    const filter = row({ options: many(12) });
    expect(searchFilterOptions(filter, "")).toBe(filter.options);
    expect(searchFilterOptions(filter, "exec").map((o) => o.value)).toEqual([
      "r0",
    ]);
    expect(searchFilterOptions(filter, "any")).toEqual([]);
    // Punctuation alone, on the way to "(Exec)", is no query yet.
    expect(searchFilterOptions(filter, "(")).toBe(filter.options);
  });
});

describe("hasFilterQuery", () => {
  it("counts punctuation and spaces alone as no query", () => {
    expect(hasFilterQuery("(")).toBe(false);
    expect(hasFilterQuery(" / ")).toBe(false);
    expect(hasFilterQuery("(e")).toBe(true);
  });
});
