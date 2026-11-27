/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { StyleSheet } from "react-native";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { signetDarkTokens } from "@repo/theme/signet";
import { FrappThemeProvider } from "@/lib/theme";
import { screenText } from "@/test/screen-text";
import { UnreadJumpPill } from "./unread-jump-pill";

function render(direction: "above" | "below", addressed: boolean) {
  const onPress = vi.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <FrappThemeProvider>
        <UnreadJumpPill
          direction={direction}
          side={{ next: { key: "row:a", addressed }, addressed }}
          onPress={onPress}
          style={direction === "above" ? { top: 100 } : { bottom: 100 }}
        />
      </FrappThemeProvider>,
    );
  });
  const button = tree.root.findByProps({ testID: `unread-jump-${direction}` });
  return { tree, button, onPress };
}

describe("UnreadJumpPill (#6045)", () => {
  it("reads New unreads with its arrow and names where it jumps", () => {
    const { tree, button } = render("above", false);
    expect(screenText(tree)).toContain("↑ New unreads");
    expect(button.props.accessibilityLabel).toBe(
      "Jump to unread channels above",
    );
    expect(button.props.accessibilityRole).toBe("button");
  });

  it("is neutral, or the mention red when an unread out of view addresses the member", () => {
    const style = (addressed: boolean) => {
      const { button } = render("below", addressed);
      return StyleSheet.flatten(button.props.style({ pressed: false })) as {
        backgroundColor: string;
      };
    };
    expect(style(false).backgroundColor).toBe(
      signetDarkTokens.color.surface.popover,
    );
    expect(style(true).backgroundColor).toBe(
      signetDarkTokens.color.semantic.mention,
    );
  });

  it("jumps on a press", () => {
    const { button, onPress } = render("below", false);
    act(() => button.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
