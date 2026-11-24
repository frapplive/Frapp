/** @vitest-environment jsdom */
import React, { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import {
  isPaintableRoleColor,
  pickRoleColor,
  ROLE_COLOR_SWATCHES,
} from "@repo/validation";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";

import { RoleColorSheet } from "./role-color-sheet";

/**
 * The phone's role and group color picker (#5966): the same grid, chapter
 * colors, Custom and preview as web's `RoleColorPicker`.
 */

function sheet(
  value: string | null,
  onChange: (next: string | null) => void,
  chapterColors: readonly string[] = [],
  subject = "role-1",
) {
  return (
    <FrappThemeProvider>
      <RoleColorSheet
        value={value}
        subject={subject}
        onChange={onChange}
        previewName="Social chair"
        memberName="Marcus Ellison"
        chapterColors={chapterColors}
      />
    </FrappThemeProvider>
  );
}

function render(
  value: string | null,
  onChange: (next: string | null) => void,
  chapterColors: readonly string[] = [],
): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(sheet(value, onChange, chapterColors));
  });
  return tree;
}

/** Closes the sheet however a person would: a swipe, Back or the scrim. */
function dismiss(tree: ReactTestRenderer) {
  const modal = tree.root.find(
    (node) =>
      typeof node.props.onDismiss === "function" &&
      node.props.snapPoints !== undefined,
  );
  act(() => modal.props.onDismiss());
}

/** The Pan gesture on the square or the hue bar, by its accessibility label. */
function pan(tree: ReactTestRenderer, label: string) {
  const detector = tree.root.find(
    (node) =>
      node.props.gesture !== undefined &&
      node.findAll((child) => child.props.accessibilityLabel === label).length >
        0,
  );
  return detector.props.gesture.handlers as {
    onBegin: (event: { x: number; y: number }) => void;
    onUpdate: (event: { x: number; y: number }) => void;
  };
}

const pressable = (tree: ReactTestRenderer, label: string) =>
  tree.root.find(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === "function",
  );

const hexField = (tree: ReactTestRenderer) =>
  tree.root.find(
    (node) =>
      node.props.accessibilityLabel === "Hex" &&
      typeof node.props.onChangeText === "function",
  );

function typeHex(tree: ReactTestRenderer, text: string) {
  act(() => hexField(tree).props.onChangeText(text));
  act(() => hexField(tree).props.onSubmitEditing());
}

describe("RoleColorSheet", () => {
  it("offers every swatch, No color and Custom, and previews the color", () => {
    const tree = render("#3DD6C4", vi.fn());
    for (const swatch of ROLE_COLOR_SWATCHES) {
      expect(pressable(tree, swatch.label)).toBeTruthy();
    }
    expect(pressable(tree, "No color")).toBeTruthy();
    expect(pressable(tree, "Teal").props.accessibilityState.checked).toBe(true);
    const text = screenText(tree);
    expect(text).toContain("Social chair");
    expect(text).toContain("Marcus Ellison");
    act(() => tree.unmount());
  });

  it("applies a swatch, a chapter color and No color", () => {
    const onChange = vi.fn();
    const tree = render(null, onChange, ["#10B981"]);
    expect(screenText(tree)).toContain("In your chapter");
    act(() => pressable(tree, "Lavender").props.onPress());
    expect(onChange).toHaveBeenLastCalledWith("#D4C9FB");
    act(() => pressable(tree, "Custom color #10B981").props.onPress());
    expect(onChange).toHaveBeenLastCalledWith("#10B981");
    act(() => pressable(tree, "No color").props.onPress());
    expect(onChange).toHaveBeenLastCalledWith(null);
    act(() => tree.unmount());
  });

  it("lightens a dark hex and says so, and applies it once the sheet closes", () => {
    const onChange = vi.fn();
    const tree = render(null, onChange);
    act(() => pressable(tree, "Custom color").props.onPress());
    typeHex(tree, "1e3a8a");
    const saved = pickRoleColor("#1E3A8A")!.hex;
    expect(onChange).not.toHaveBeenCalled();
    expect(hexField(tree).props.value).toBe(saved);
    expect(screenText(tree)).toContain("Made lighter so names stay readable.");
    dismiss(tree);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(saved);
    expect(isPaintableRoleColor(saved)).toBe(true);
    act(() => tree.unmount());
  });

  it("moves gold to the nearest allowed hue and says why", () => {
    const onChange = vi.fn();
    const tree = render(null, onChange);
    act(() => pressable(tree, "Custom color").props.onPress());
    typeHex(tree, "#FFD700");
    expect(screenText(tree)).toContain("Gold is kept for Frapp's own color.");
    dismiss(tree);
    expect(onChange).toHaveBeenLastCalledWith(pickRoleColor("#FFD700")!.hex);
    act(() => tree.unmount());
  });

  it("says a hex that isn't one is wrong and applies nothing", () => {
    const onChange = vi.fn();
    const tree = render(null, onChange);
    act(() => pressable(tree, "Custom color").props.onPress());
    typeHex(tree, "blue");
    expect(screenText(tree)).toContain("Enter a hex color, like #4A90E2.");
    dismiss(tree);
    expect(onChange).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("opens on Custom for a stored custom color", () => {
    const tree = render("#10B981", vi.fn());
    expect(hexField(tree).props.value).toBe("#10B981");
    act(() => tree.unmount());
  });

  it("saves a whole drag session once, when the sheet closes", () => {
    const onChange = vi.fn();
    const tree = render("#10B981", onChange);
    const square = pan(tree, "Saturation and brightness");
    act(() => square.onBegin({ x: 0, y: 0 }));
    act(() => square.onUpdate({ x: 0, y: 160 }));
    const hue = pan(tree, "Hue");
    act(() => hue.onUpdate({ x: 0, y: 0 }));
    expect(onChange).not.toHaveBeenCalled();
    dismiss(tree);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(isPaintableRoleColor(onChange.mock.calls[0]![0])).toBe(true);
  });

  it("applies nothing on close when Custom wasn't moved", () => {
    const onChange = vi.fn();
    const tree = render("#10B981", onChange);
    dismiss(tree);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("starts fresh for each thing it colors", () => {
    const onChange = vi.fn();
    const tree = render("#10B981", onChange);
    expect(hexField(tree).props.value).toBe("#10B981");
    act(() => tree.update(sheet("#3DD6C4", onChange, [], "role-2")));
    // A swatch color: Custom starts closed for it.
    expect(
      tree.root.findAll(
        (node) =>
          node.props.accessibilityLabel === "Hex" &&
          typeof node.props.onChangeText === "function",
      ),
    ).toHaveLength(0);
    act(() => tree.update(sheet("#10B981", onChange, [], "role-3")));
    expect(hexField(tree).props.value).toBe("#10B981");
    act(() => tree.unmount());
  });
});
