/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ASK_COPY } from "@repo/validation";
import { FrappCrest } from "@/components/frapp-crest";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";

/**
 * Frapp Intelligence at the top of the + panel, which is New (#5983; Paul,
 * 2026-11-24, decision 2 on #5943).
 */

// A purple chapter: the crest, the field's edge and its arrow take the accent.
vi.mock("@/lib/chapter-branding", () => ({
  useChapterBranding: () => ({ accent: "#8B5CF6" }),
}));
const haptics = vi.hoisted(() => ({ selectionHaptic: vi.fn() }));
vi.mock("@/lib/haptics", () => haptics);

import { ASK_ENTRY_HINT, AskEntry } from "./ask-entry";

function render(onPress = vi.fn()): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <AskEntry onPress={onPress} />
      </FrappThemeProvider>,
    );
  });
  return tree;
}
const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const press = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => (node.type as unknown) === "Pressable")[0];

describe("AskEntry", () => {
  it("names Frapp Intelligence from its first frame, over the field's own words", () => {
    expect(screenText(render())).toBe(
      `${ASK_COPY.name}\n${ASK_COPY.placeholder}`,
    );
  });

  it("is one button named for what it shows, which says what it is for", () => {
    const button = press(render());
    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityLabel).toBe(
      "Frapp Intelligence, What do you need?",
    );
    expect(button.props.accessibilityHint).toBe(ASK_ENTRY_HINT);
  });

  it("draws the crest, the field's edge and its arrow in the chapter's colour", () => {
    const tree = render();
    expect(tree.root.findByType(FrappCrest).props.color).toBe("#8B5CF6");
    const edge = tree.root
      .findAll((node) => flat(node.props.style).borderWidth === 1)
      .map((node) => String(flat(node.props.style).borderColor));
    expect(edge.length).toBeGreaterThan(0);
    for (const color of edge) expect(color).toMatch(/139,\s*92,\s*246/);
    const strokes = tree.root
      .findAll((node) => node.props.stroke !== undefined)
      .map((node) => node.props.stroke);
    expect(strokes).toContain("#8B5CF6");
  });

  it("draws the field at the 48pt control step, fully round", () => {
    const field = flat(
      render().root.findAll(
        (node) => flat(node.props.style).borderWidth === 1,
      )[0].props.style,
    );
    expect(field.minHeight).toBe(48);
    expect(field.borderRadius).toBe(24);
  });

  it("opens the conversation on a tap, with the selection tick", () => {
    const onPress = vi.fn();
    const tree = render(onPress);
    act(() => press(tree).props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(haptics.selectionHaptic).toHaveBeenCalledTimes(1);
  });
});
