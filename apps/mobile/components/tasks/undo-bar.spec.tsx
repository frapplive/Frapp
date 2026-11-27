/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { StyleSheet } from "react-native";
import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { FloatingCreateButton } from "@/components/floating-create-button";
import { GlassSurface } from "@/components/glass-surface";
import {
  FLOATING_TAB_BAR,
  floatingScreenLayout,
  floatingTabBarTop,
} from "@/lib/floating-chrome";
import { FrappThemeProvider } from "@/lib/theme";
import { UndoBar } from "./undo-bar";

/**
 * What floats over a tab screen sits just above the tab bar, for every member:
 * nothing else floats there since the Frapp Intelligence bar went (#5983). On
 * a screen pushed over the tabs, where no bar is drawn, it sits clear of the
 * inset.
 */

vi.mock("@/lib/chapter-branding", () => ({
  useChapterBranding: () => ({
    accent: "#8B5CF6",
    accentPrimary: "#7C3AED",
    accentOnPrimary: "#FFFFFF",
  }),
}));

// The safe-area mock has no bottom inset.
const ABOVE_TAB_BAR = floatingTabBarTop(0) + FLOATING_TAB_BAR.gap;

/** How far off the screen's bottom edge the floating surface is drawn. */
function bottomOf(children: React.ReactNode, onATab: boolean): number {
  let tree!: ReturnType<typeof create>;
  const themed = <FrappThemeProvider>{children}</FrappThemeProvider>;
  act(() => {
    tree = create(
      onATab
        ? floatingScreenLayout({
            route: { name: "tasks" },
            navigation: { addListener: () => () => {} },
            children: themed,
          })
        : themed,
    );
  });
  const style = StyleSheet.flatten(
    tree.root.findByType(GlassSurface).props.style,
  ) as { bottom: number };
  return style.bottom;
}

const undo = <UndoBar message="Marked done" onUndo={() => undefined} />;
const createButton = (
  <FloatingCreateButton label="New task" onPress={() => undefined} />
);

describe.each([
  ["the undo bar", undo],
  ["the create button", createButton],
])("%s over a tab screen", (_, surface) => {
  it("sits just above the tab bar", () => {
    expect(bottomOf(surface, true)).toBe(ABOVE_TAB_BAR);
  });

  it("sits clear of the inset on a pushed screen, which draws no bar", () => {
    // The safe-area mock's 0 inset plus the 16pt step.
    expect(bottomOf(surface, false)).toBe(16);
  });
});
