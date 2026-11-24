/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { StyleSheet } from "react-native";
import { afterEach, describe, expect, it } from "vitest";
import { signetDarkTokens } from "@repo/theme/signet";
import { FrappThemeProvider } from "@/lib/theme";
import { Segmented } from "@/components/segmented";

const OPTIONS = [
  { value: "none", label: "None" },
  { value: "photo", label: "Photo" },
] as const;

const trees: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => trees.splice(0).forEach((tree) => tree.unmount()));
});

function render(quiet: boolean) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <Segmented
          accessibilityLabel="Proof to mark it done"
          options={OPTIONS}
          value="photo"
          onChange={() => {}}
          quiet={quiet}
        />
      </FrappThemeProvider>,
    );
  });
  trees.push(tree);
  const segment = (label: string) =>
    tree.root.find(
      (node) =>
        node.props.accessibilityRole === "radio" &&
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === "function",
    );
  const style = (label: string) =>
    StyleSheet.flatten(segment(label).props.style);
  const word = (label: string) =>
    StyleSheet.flatten(
      segment(label).find(
        (node) => (node.type as unknown as string) === "Text",
      ).props.style,
    );
  return { style, word };
}

describe("Segmented: neutral since 2026-11-24 (#5947)", () => {
  const { color } = signetDarkTokens;

  it("raises the held answer on the card step with foreground text, never the accent", () => {
    const { style, word } = render(false);
    expect(style("Photo").backgroundColor).toBe(color.surface.card);
    expect(style("Photo").borderColor).toBe(color.border.hairline);
    expect(word("Photo").color).toBe(color.text.foreground);
    expect(style("None").backgroundColor).toBeUndefined();
    expect(word("None").color).toBe(color.text.muted);
  });

  it("holds a quiet answer with the edge alone", () => {
    const { style, word } = render(true);
    expect(style("Photo").backgroundColor).toBeUndefined();
    expect(style("Photo").borderColor).toBe(color.border.hairline);
    expect(word("Photo").color).toBe(color.text.foreground);
  });
});
