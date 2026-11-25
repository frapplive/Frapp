/** @vitest-environment jsdom */
import React, { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEW_PICKABLE_ROLE_COPY } from "@repo/validation";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";

/**
 * Add role under Non-chapter business (#5736): one name, and the role is
 * created outside the tiers, holding nothing, already pickable.
 */

const state = vi.hoisted(() => ({ createRole: vi.fn() }));

vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useCreateRole: () => ({ mutateAsync: state.createRole, isPending: false }),
  useChapterRoleColors: () => [],
  useViewerDisplayName: () => "Marcus Ellison",
}));

vi.mock("@/lib/chapter-branding", () => ({
  useChapterBranding: () => ({ accent: "#DDB844" }),
}));

vi.mock("@/lib/haptics", () => ({ successHaptic: vi.fn() }));

import { NewRoleSheet } from "./new-role-sheet";

function render(onCreated: (roleId: string) => void): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <NewRoleSheet onCreated={onCreated} />
      </FrappThemeProvider>,
    );
  });
  return tree;
}

const nameField = (tree: ReactTestRenderer) =>
  tree.root.find(
    (node) =>
      node.props.accessibilityLabel === "Role name" &&
      typeof node.props.onChangeText === "function",
  );

const addButton = (tree: ReactTestRenderer) =>
  tree.root.find(
    (node) =>
      node.props.label === NEW_PICKABLE_ROLE_COPY.add &&
      typeof node.type === "function",
  );

beforeEach(() => {
  state.createRole.mockReset();
});

describe("New Non-chapter business role sheet (#5736)", () => {
  it("holds Add role until the role has a name", () => {
    const tree = render(vi.fn());
    expect(addButton(tree).props.disabled).toBe(true);
    act(() => nameField(tree).props.onChangeText("   "));
    expect(addButton(tree).props.disabled).toBe(true);
    act(() => nameField(tree).props.onChangeText("Intramural soccer"));
    expect(addButton(tree).props.disabled).toBe(false);
    act(() => tree.unmount());
  });

  it("creates it outside the tiers, holding nothing, pickable, then opens it", async () => {
    state.createRole.mockResolvedValue({ id: "new-im" });
    const onCreated = vi.fn();
    const tree = render(onCreated);
    act(() => nameField(tree).props.onChangeText(" Intramural soccer "));
    await act(async () => {
      addButton(tree).props.onPress();
    });
    expect(state.createRole).toHaveBeenCalledWith({
      name: "Intramural soccer",
      permissions: [],
      tier_id: null,
      self_assignable: true,
    });
    expect(onCreated).toHaveBeenCalledWith("new-im");
    expect(nameField(tree).props.value).toBe("");
    act(() => tree.unmount());
  });

  it("keeps the name and says why when the save fails", async () => {
    state.createRole.mockRejectedValue(new Error("boom"));
    const onCreated = vi.fn();
    const tree = render(onCreated);
    act(() => nameField(tree).props.onChangeText("Intramural soccer"));
    await act(async () => {
      addButton(tree).props.onPress();
    });
    expect(onCreated).not.toHaveBeenCalled();
    expect(nameField(tree).props.value).toBe("Intramural soccer");
    expect(screenText(tree)).toContain(NEW_PICKABLE_ROLE_COPY.failed);
    act(() => tree.unmount());
  });
});

describe("New role sheet from Chapter settings (#5296)", () => {
  const chapterRole = {
    tierLabel: "Tier",
    placements: [
      { value: "t-chairs", label: "Chairs" },
      { value: "t-members", label: "Members" },
      { value: null, label: "Outside the tiers" },
    ],
  };

  function renderChapter(onCreated: (roleId: string) => void) {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <FrappThemeProvider>
          <NewRoleSheet onCreated={onCreated} chapterRole={chapterRole} />
        </FrappThemeProvider>,
      );
    });
    return tree;
  }

  const swatch = (tree: ReactTestRenderer, label: string) =>
    tree.root.find(
      (node) =>
        node.props.accessibilityRole === "radio" &&
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === "function",
    );

  const tierSheet = (tree: ReactTestRenderer) =>
    tree.root.find(
      (node) =>
        node.props.title === "Tier" &&
        typeof node.props.onSelect === "function",
    );

  it("starts in the bottom tier on offer, with no color", () => {
    const tree = renderChapter(vi.fn());
    expect(screenText(tree)).toContain("New role");
    // Not outside the tiers, where a role that is only named would hold
    // nothing: the bottom tier, so it starts with that tier's permissions.
    expect(tierSheet(tree).props.selected).toBe("t-members");
    expect(swatch(tree, "No color").props.accessibilityState.checked).toBe(
      true,
    );
    act(() => tree.unmount());
  });

  it("creates it in the picked tier, with its tier's permissions and the picked color, then opens it", async () => {
    state.createRole.mockResolvedValue({ id: "new-role" });
    const onCreated = vi.fn();
    const tree = renderChapter(onCreated);
    act(() => nameField(tree).props.onChangeText(" Philanthropy chair "));
    act(() => tierSheet(tree).props.onSelect("t-chairs"));
    act(() => swatch(tree, "Teal").props.onPress());
    await act(async () => {
      addButton(tree).props.onPress();
    });
    expect(state.createRole).toHaveBeenCalledWith({
      name: "Philanthropy chair",
      permissions: [],
      tier_id: "t-chairs",
      color: "#3DD6C4",
    });
    expect(onCreated).toHaveBeenCalledWith("new-role");
    // Ready for the next one: the default place and no color again.
    expect(tierSheet(tree).props.selected).toBe("t-members");
    act(() => tree.unmount());
  });

  it("sends no color when none is picked, and never marks it pickable", async () => {
    state.createRole.mockResolvedValue({ id: "r" });
    const tree = renderChapter(vi.fn());
    act(() => nameField(tree).props.onChangeText("Scholarship"));
    await act(async () => {
      addButton(tree).props.onPress();
    });
    expect(state.createRole).toHaveBeenCalledWith({
      name: "Scholarship",
      permissions: [],
      tier_id: "t-members",
    });
    act(() => tree.unmount());
  });

  it("sends the default, not a tier the officer no longer has on offer", async () => {
    state.createRole.mockResolvedValue({ id: "r" });
    const tree = renderChapter(vi.fn());
    act(() => tierSheet(tree).props.onSelect("t-chairs"));
    // The officer's role changed while the sheet was open: Chairs is gone.
    act(() =>
      tree.update(
        <FrappThemeProvider>
          <NewRoleSheet
            onCreated={vi.fn()}
            chapterRole={{
              ...chapterRole,
              placements: chapterRole.placements.filter(
                (p) => p.value !== "t-chairs",
              ),
            }}
          />
        </FrappThemeProvider>,
      ),
    );
    act(() => nameField(tree).props.onChangeText("Scholarship"));
    await act(async () => {
      addButton(tree).props.onPress();
    });
    expect(state.createRole).toHaveBeenCalledWith(
      expect.objectContaining({ tier_id: "t-members" }),
    );
    act(() => tree.unmount());
  });
});
