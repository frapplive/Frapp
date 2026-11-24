/** @vitest-environment jsdom */
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrappThemeProvider } from "@/lib/theme";

const mocks = vi.hoisted(() => ({
  permissions: ["members:view"] as string[],
  queryOptions: [] as { enabled?: boolean }[],
  data: undefined as unknown,
  mutate: vi.fn(),
  pickProps: null as null | {
    selected: string | null;
    onSelect: (value: string | null) => void;
    options: readonly { value: string | null }[];
  },
}));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  usePermissionList: () => mocks.permissions,
  useOwnCustomFields: (options: { enabled?: boolean }) => {
    mocks.queryOptions.push(options);
    return {
      data: options.enabled ? mocks.data : undefined,
      isError: false,
      refetch: vi.fn(),
    };
  },
  useUpdateOwnCustomFields: () => ({ mutate: mocks.mutate, isPending: false }),
}));

vi.mock("@/lib/chapter-branding", () => ({
  useChapterBranding: () => ({ accent: "#DDB844" }),
}));

// The pick sheet is its own spec's business; this one checks what the
// section hands it and what a pick saves.
vi.mock("@/components/option-sheet", () => ({
  OptionSheet: (props: NonNullable<typeof mocks.pickProps>) => {
    mocks.pickProps = props;
    return null;
  },
}));

import { OwnCustomFieldsSection } from "./own-custom-fields";

const field = (over: Record<string, unknown>) => ({
  key: "k",
  visibility: "chapter",
  required: false,
  choices: null,
  max_length: null,
  value: null,
  ...over,
});

const FIELDS = [
  field({
    field_id: "shirt",
    label: "T-shirt size",
    type: "select",
    choices: ["S", "M", "L"],
    value: "L",
  }),
  field({
    field_id: "allergy",
    label: "Allergies",
    type: "text",
    visibility: "exec",
    value: "Peanuts",
  }),
  field({
    field_id: "car",
    label: "Has a car",
    type: "boolean",
    value: "true",
  }),
];

const trees: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => trees.splice(0).forEach((tree) => tree.unmount()));
});

beforeEach(() => {
  mocks.permissions = ["members:view"];
  mocks.queryOptions = [];
  mocks.data = FIELDS;
  mocks.mutate.mockReset();
  mocks.pickProps = null;
});

function render() {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <OwnCustomFieldsSection />
      </FrappThemeProvider>,
      {
        createNodeMock: () => ({ present: vi.fn(), dismiss: vi.fn() }),
      },
    );
  });
  trees.push(tree);
  return tree;
}

const texts = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => typeof node.props.children === "string")
    .map((node) => node.props.children as string);

describe("OwnCustomFieldsSection (#581)", () => {
  it("draws each field with its value and who sees it", () => {
    const tree = render();
    const shown = texts(tree);
    expect(shown).toEqual(
      expect.arrayContaining([
        "T-shirt size",
        "L",
        "Allergies",
        "Peanuts",
        "Officers see this",
        "Has a car",
      ]),
    );
  });

  it("draws nothing, and reads nothing, without the Directory's permission", () => {
    mocks.permissions = [];
    const tree = render();
    expect(tree.toJSON()).toBeNull();
    expect(mocks.queryOptions.every((o) => o.enabled === false)).toBe(true);
  });

  it("saves the switch's new state on the flip", () => {
    const tree = render();
    const toggle = tree.root.find(
      (node) =>
        node.props.accessibilityLabel === "Has a car" &&
        typeof node.props.onValueChange === "function",
    );
    act(() => toggle.props.onValueChange(false));
    expect(mocks.mutate).toHaveBeenCalledWith(
      [{ field_id: "car", value: "false" }],
      expect.anything(),
    );
  });

  it("saves a different pick, a Not set pick as null, and never the same pick", () => {
    const tree = render();
    const shirtRow = tree.root.find(
      (node) =>
        node.props.accessibilityLabel === "T-shirt size" &&
        typeof node.props.onPress === "function",
    );
    act(() => shirtRow.props.onPress());
    const pick = () => mocks.pickProps!;
    expect(pick().selected).toBe("L");
    expect(pick().options.map((o) => o.value)).toEqual([null, "S", "M", "L"]);

    act(() => pick().onSelect("L"));
    expect(mocks.mutate).not.toHaveBeenCalled();

    act(() => pick().onSelect("M"));
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      [{ field_id: "shirt", value: "M" }],
      expect.anything(),
    );

    act(() => pick().onSelect(null));
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      [{ field_id: "shirt", value: null }],
      expect.anything(),
    );
  });
});
