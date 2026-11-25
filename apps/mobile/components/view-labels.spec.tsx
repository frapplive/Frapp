/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { StyleSheet } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signetDarkTokens } from "@repo/theme/signet";
import { FrappThemeProvider, fontFamilyFor } from "@/lib/theme";
import { ViewLabels } from "@/components/view-labels";

const VIEWS = [
  { value: "mine", label: "Mine" },
  { value: "all", label: "Everyone's" },
] as const;

const trees: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => trees.splice(0).forEach((tree) => tree.unmount()));
});

function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FrappThemeProvider>{element}</FrappThemeProvider>);
  });
  trees.push(tree);
  return tree;
}

function tab(tree: ReactTestRenderer, label: string) {
  return tree.root.find(
    (node) =>
      node.props.accessibilityRole === "tab" &&
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === "function",
  );
}

/** The word a label draws: its second text, over the unseen sizer. */
function wordStyle(tree: ReactTestRenderer, label: string) {
  const texts = tab(tree, label).findAll(
    (node) =>
      (node.type as unknown as string) === "Text" &&
      node.props.children === label,
  );
  return {
    sizer: StyleSheet.flatten(texts[0]!.props.style),
    word: StyleSheet.flatten(texts[1]!.props.style),
  };
}

describe("ViewLabels (#5947)", () => {
  it("is a tab list that says which view is held", () => {
    const tree = render(
      <ViewLabels
        accessibilityLabel="Whose tasks"
        options={VIEWS}
        value="mine"
        onChange={() => {}}
      />,
    );
    const list = tree.root.find(
      (node) =>
        node.props.accessibilityRole === "tablist" &&
        node.props.accessibilityLabel === "Whose tasks",
    );
    expect(list).toBeTruthy();
    expect(tab(tree, "Mine").props.accessibilityState).toEqual({
      selected: true,
    });
    expect(tab(tree, "Everyone's").props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it("carries the pick by weight as well as colour, with no fill or accent", () => {
    const tree = render(
      <ViewLabels
        accessibilityLabel="Whose tasks"
        options={VIEWS}
        value="mine"
        onChange={() => {}}
      />,
    );
    const held = wordStyle(tree, "Mine").word;
    const rest = wordStyle(tree, "Everyone's").word;
    expect(held.fontFamily).toBe(fontFamilyFor(600));
    expect(held.color).toBe(signetDarkTokens.color.text.foreground);
    expect(rest.fontFamily).toBe(fontFamilyFor(400));
    expect(rest.color).toBe(signetDarkTokens.color.text.muted);
    expect(rest.fontSize).toBe(held.fontSize);
    for (const label of ["Mine", "Everyone's"]) {
      const pressable = StyleSheet.flatten(
        tab(tree, label).props.style({ pressed: false }),
      );
      expect(pressable.backgroundColor).toBeUndefined();
      expect(pressable.borderWidth).toBeUndefined();
    }
  });

  it("holds each word's semibold width, so picking one moves nothing", () => {
    const tree = render(
      <ViewLabels
        accessibilityLabel="Whose tasks"
        options={VIEWS}
        value="mine"
        onChange={() => {}}
      />,
    );
    for (const label of ["Mine", "Everyone's"]) {
      const { sizer, word } = wordStyle(tree, label);
      expect(sizer.fontFamily).toBe(fontFamilyFor(600));
      expect(sizer.opacity).toBe(0);
      expect(word.position).toBe("absolute");
    }
  });

  it("gives each word a thumb-tall target, with room either side", () => {
    const tree = render(
      <ViewLabels
        accessibilityLabel="Show"
        options={[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread" },
        ]}
        value="all"
        onChange={() => {}}
      />,
    );
    const all = tab(tree, "All");
    const style = StyleSheet.flatten(all.props.style({ pressed: false }));
    const { top, bottom, left, right } = all.props.hitSlop;
    expect(style.minHeight + top + bottom).toBe(signetDarkTokens.touch.minimum);
    // Sideways: the word, 8 of padding and 4 of slop on each side.
    expect(style.paddingHorizontal * 2 + left + right).toBe(24);
  });

  it("picks on press, and not again on the held view", () => {
    const onChange = vi.fn();
    const tree = render(
      <ViewLabels
        accessibilityLabel="Whose tasks"
        options={VIEWS}
        value="mine"
        onChange={onChange}
      />,
    );
    act(() => tab(tree, "Mine").props.onPress());
    expect(onChange).not.toHaveBeenCalled();
    act(() => tab(tree, "Everyone's").props.onPress());
    expect(onChange).toHaveBeenCalledExactlyOnceWith("all");
  });

  it("draws nothing for a member with one view", () => {
    const tree = render(
      <ViewLabels
        accessibilityLabel="Whose tasks"
        options={[{ value: "mine", label: "Mine" }]}
        value="mine"
        onChange={() => {}}
      />,
    );
    expect(tree.toJSON()).toBeNull();
  });

  it("steps down to the label size when compact", () => {
    const tree = render(
      <ViewLabels
        compact
        accessibilityLabel="Whose action items"
        options={VIEWS}
        value="mine"
        onChange={() => {}}
      />,
    );
    const held = wordStyle(tree, "Mine").word;
    const rest = wordStyle(tree, "Everyone's").word;
    expect(held.fontSize).toBe(signetDarkTokens.typography.role.label.size);
    expect(rest.fontSize).toBe(held.fontSize);
    expect(held.fontFamily).toBe(fontFamilyFor(600));
    expect(rest.fontFamily).toBe(fontFamilyFor(400));
  });
});
