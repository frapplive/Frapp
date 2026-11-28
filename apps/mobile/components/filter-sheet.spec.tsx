/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ANY_FILTER, anyFilterRow } from "@repo/hooks/filter-rows";
import { FrappThemeProvider } from "@/lib/theme";

/**
 * The phone's one Filters sheet (rulebook § 9, `components.md` § 13 Filter
 * bar): a row per filter with its value, each opening its options in place,
 * searchable past 8, Sort apart and uncounted, Clear all last, and one pill
 * that closes it; and the applied chips under a screen's search.
 */

vi.mock("@/lib/chapter-branding", () => ({
  useChapterBranding: () => ({
    accent: "#CB9FFF",
    accentPrimary: "#CB9FFF",
    accentOnPrimary: "#000000",
  }),
}));

import {
  ActiveFilterChips,
  FilterSheet,
  type FilterSheetFilter,
} from "./filter-sheet";
import { ListRow } from "./list-section";
import { Chip } from "./filter-chips";

const ROLES = [
  { value: "r-member", label: "Member", color: null },
  { value: "r-rush", label: "Rush/Recruitment Chair", color: "#F2994A" },
  { value: "r-exec", label: "(Exec) Treasurer", color: null },
];

/** A screen's rows, held in state the way a screen holds its filters. */
function Harness({
  roles = ROLES,
  roleNote,
  onState,
}: {
  roles?: { value: string; label: string; color?: string | null }[];
  roleNote?: FilterSheetFilter["optionsNote"];
  onState?: (state: Record<string, string | null>) => void;
}) {
  const [role, setRole] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState("name");
  onState?.({ role, status, sort });
  const filters: FilterSheetFilter[] = [
    {
      ...anyFilterRow({
        key: "role",
        label: "Role",
        anyLabel: "Any role",
        options: roles,
        value: role,
        onChange: setRole,
      }),
      optionsNote: roleNote,
      emptyNote: "This chapter has no roles yet.",
    },
    anyFilterRow({
      key: "status",
      label: "Status",
      anyLabel: "Any status",
      options: [
        { value: "active", label: "Active" },
        { value: "pending", label: "Pending" },
      ],
      value: status,
      onChange: setStatus,
    }),
    {
      key: "sort",
      label: "Sort",
      options: [
        { value: "name", label: "Name" },
        { value: "points", label: "Most points" },
      ],
      value: sort,
      anyValue: "name",
      onChange: setSort,
      isSort: true,
    },
  ];
  return (
    <>
      <FilterSheet
        title="Filter actives"
        filters={filters}
        showLabel="Show 2 members"
      />
      <ActiveFilterChips filters={filters} />
    </>
  );
}

function render(props: React.ComponentProps<typeof Harness> = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <Harness {...props} />
      </FrappThemeProvider>,
    );
  });
  return tree;
}

function rows(tree: ReactTestRenderer) {
  return tree.root
    .findAllByType(ListRow)
    .map((row) => row.props as React.ComponentProps<typeof ListRow>);
}

function rowNamed(tree: ReactTestRenderer, label: string) {
  const row = rows(tree).find((r) => r.label === label);
  if (!row) throw new Error(`no row ${label}`);
  return row;
}

function open(tree: ReactTestRenderer, label: string) {
  act(() => rowNamed(tree, label).onPress!());
}

function optionsList(tree: ReactTestRenderer) {
  return tree.root.find(
    (node) => (node.type as unknown) === "BottomSheetFlatList",
  );
}

function shown(tree: ReactTestRenderer): string[] {
  return (optionsList(tree).props.data as { value: string }[]).map((o) =>
    o.value === ANY_FILTER ? "any" : o.value,
  );
}

/** The FlatList stand-in never renders rows, so draw one to read and tap it. */
function option(tree: ReactTestRenderer, value: string) {
  const item = (
    optionsList(tree).props.data as { value: string; label: string }[]
  ).find((o) => o.value === value)!;
  return optionsList(tree).props.renderItem({ item }) as React.ReactElement<{
    onPress: () => void;
    accessibilityLabel: string;
    accessibilityState: { checked: boolean };
  }>;
}

/** An element in the options' header, which the stand-in doesn't mount. */
function inHeader(
  tree: ReactTestRenderer,
  match: (props: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  const visit = (node: unknown): Record<string, unknown> | null => {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    }
    if (!React.isValidElement(node)) return null;
    const props = node.props as Record<string, unknown>;
    if (match(props)) return props;
    return visit(props.children);
  };
  return visit(optionsList(tree).props.ListHeaderComponent);
}

function chips(tree: ReactTestRenderer) {
  return tree.root
    .findAllByType(Chip)
    .map((chip) => chip.props as React.ComponentProps<typeof Chip>);
}

describe("FilterSheet (#5739)", () => {
  it("lists a row per filter with its value, and no Clear all while none is on", () => {
    const tree = render();
    expect(rows(tree).map((r) => [r.label, r.value])).toEqual([
      ["Role", "Any role"],
      ["Status", "Any status"],
      ["Sort", "Name"],
    ]);
  });

  it("opens a row's options in place, checked on the current one, and a pick applies and comes back", () => {
    let state: Record<string, string | null> = {};
    const tree = render({ onState: (s) => (state = s) });
    open(tree, "Status");
    expect(rows(tree)).toEqual([]);
    expect(shown(tree)).toEqual(["any", "active", "pending"]);
    expect(option(tree, ANY_FILTER).props.accessibilityState.checked).toBe(
      true,
    );
    // A short list has no search.
    expect(
      inHeader(tree, (p) => p.accessibilityLabel === "Search status"),
    ).toBe(null);

    act(() => option(tree, "pending").props.onPress());
    expect(state.status).toBe("pending");
    expect(rowNamed(tree, "Status").value).toBe("Pending");
  });

  it("goes back to the rows without a pick", () => {
    const tree = render();
    open(tree, "Role");
    const back = inHeader(
      tree,
      (p) => p.accessibilityLabel === "Back to filters",
    )!;
    act(() => (back.onPress as () => void)());
    expect(rows(tree).map((r) => r.label)).toContain("Role");
  });

  it("searches a list past 8 by word start, Any stepping aside, and Return picks the one left", () => {
    let state: Record<string, string | null> = {};
    const many = [
      ...ROLES,
      ...Array.from({ length: 7 }, (_, i) => ({
        value: `r-${i}`,
        label: `Committee ${i}`,
      })),
    ];
    const tree = render({ roles: many, onState: (s) => (state = s) });
    open(tree, "Role");
    const field = () =>
      inHeader(tree, (p) => p.accessibilityLabel === "Search role")!;
    expect(field()).not.toBeNull();
    expect(shown(tree)[0]).toBe("any");

    act(() => (field().onChangeText as (t: string) => void)("exec"));
    expect(shown(tree)).toEqual(["r-exec"]);
    act(() => (field().onSubmitEditing as () => void)());
    expect(state.role).toBe("r-exec");
  });

  it("draws a dot only for a list whose options carry a colour", () => {
    const tree = render();
    open(tree, "Role");
    const rush = option(tree, "r-rush");
    const json = JSON.stringify(
      (rush.props as unknown as { children: unknown }).children,
    );
    expect(json).toContain("#F2994A");
  });

  it("says a list that hasn't answered in one line, with Retry once it failed", () => {
    const onRetry = vi.fn();
    const tree = render({
      roleNote: { text: "Couldn't load roles.", onRetry },
    });
    open(tree, "Role");
    expect(shown(tree)).toEqual([]);
    const empty = optionsList(tree).props
      .ListEmptyComponent as React.ReactElement<{
      children: string;
      action: { label: string; onPress: () => void };
    }>;
    expect(empty.props.children).toBe("Couldn't load roles.");
    empty.props.action.onPress();
    expect(onRetry).toHaveBeenCalled();
  });

  it("keeps Sort apart and uncounted, and Clear all turns off the filters but not the sort", () => {
    let state: Record<string, string | null> = {};
    const tree = render({ onState: (s) => (state = s) });
    open(tree, "Sort");
    act(() => option(tree, "points").props.onPress());
    // A sort alone is no filter: no Clear all, no chip.
    expect(rows(tree).map((r) => r.label)).not.toContain("Clear all");
    expect(chips(tree)).toEqual([]);

    open(tree, "Status");
    act(() => option(tree, "active").props.onPress());
    const clear = rowNamed(tree, "Clear all");
    expect(clear.action).toBe(true);
    act(() => clear.onPress!());
    expect(state).toEqual({ role: null, status: null, sort: "points" });
  });

  it("ends in one pill that names what the list holds", () => {
    const tree = render();
    const modal = tree.root.find(
      (node) => (node.type as unknown) === "BottomSheetModal",
    );
    const footer = modal.props.footerComponent({}) as React.ReactElement<{
      children: React.ReactElement<{
        children: React.ReactElement<{ label: string }>;
      }>;
    }>;
    expect(footer.props.children.props.children.props.label).toBe(
      "Show 2 members",
    );
  });
});

describe("ActiveFilterChips (#5739)", () => {
  it("shows a removable chip per filter on, and Clear all once two are", () => {
    let state: Record<string, string | null> = {};
    const tree = render({ onState: (s) => (state = s) });
    open(tree, "Status");
    act(() => option(tree, "active").props.onPress());
    expect(chips(tree).map((c) => c.label)).toEqual(["Status: Active"]);

    open(tree, "Role");
    act(() => option(tree, "r-rush").props.onPress());
    expect(chips(tree).map((c) => c.accessibilityLabel ?? c.label)).toEqual([
      "Remove filter Role: Rush/Recruitment Chair",
      "Remove filter Status: Active",
      "Clear all",
    ]);

    act(() => chips(tree)[0]!.onPress());
    expect(state.role).toBeNull();
    expect(state.status).toBe("active");
  });
});
