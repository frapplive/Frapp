import { describe, expect, it } from "vitest";
import { directoryFilterRows } from "./directory-filter-rows";
import { ANY_FILTER } from "./filter-rows";

const noop = () => {};
const one = [{ value: "x", label: "X" }];

function rows(
  overrides: Partial<Parameters<typeof directoryFilterRows>[0]> = {},
) {
  return directoryFilterRows({
    role: { options: one, value: null, onChange: noop },
    group: { options: one, value: null, onChange: noop },
    year: {
      options: [{ value: "2027", label: "2027" }],
      value: null,
      onChange: noop,
    },
    pledgeClass: { label: "Line", options: one, value: null, onChange: noop },
    status: { value: null, onChange: noop },
    phoneReach: {
      label: "Phone app",
      options: one,
      value: null,
      onChange: noop,
    },
    sort: {
      options: [
        { value: "name", label: "Name" },
        { value: "points", label: "Most points" },
      ],
      value: "points",
      defaultValue: "name",
      onChange: noop,
    },
    period: {
      options: [{ value: "semester", label: "This semester" }],
      value: "semester",
      onChange: noop,
    },
    ...overrides,
  });
}

describe("directoryFilterRows (#5739)", () => {
  it("lists the Directory's rows in one order, with one set of words, on both apps", () => {
    const all = rows();
    expect(all.map((r) => r.label)).toEqual([
      "Role",
      "Group",
      "Graduation year",
      "Line",
      "Status",
      "Phone app",
      "Sort",
      "Period",
    ]);
    expect(all.map((r) => r.options[0]?.label)).toEqual([
      "Any role",
      "Any group",
      "Any year",
      "Any",
      "Any status",
      "Any",
      "Name",
      "This semester",
    ]);
    expect(all.filter((r) => r.isSort).map((r) => r.key)).toEqual([
      "sort",
      "period",
    ]);
  });

  it("leaves out a filter with nothing to offer, and Sort with one order", () => {
    const sparse = rows({
      group: { options: [], value: null, onChange: noop },
      year: { options: [], value: null, onChange: noop },
      pledgeClass: { label: "Line", options: [], value: null, onChange: noop },
      phoneReach: null,
      sort: {
        options: [{ value: "name", label: "Name" }],
        value: "name",
        defaultValue: "name",
        onChange: noop,
      },
      period: null,
    });
    expect(sparse.map((r) => r.key)).toEqual(["role", "status"]);
  });

  it("maps a row's any value to null for the app's state", () => {
    const picks: (string | null)[] = [];
    const [role] = rows({
      role: { options: one, value: "x", onChange: (v) => picks.push(v) },
    });
    expect(role!.value).toBe("x");
    role!.onChange(ANY_FILTER);
    expect(picks).toEqual([null]);
  });
});
