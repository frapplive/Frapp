/** @vitest-environment jsdom */
import React, { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { useReducedMotion, withRepeat } from "react-native-reanimated";

const state = vi.hoisted(() => ({
  data: undefined as
    | { background: string; source: string; photo_url: string | null }
    | undefined,
}));

vi.mock("@/lib/chapter-branding", async () => {
  const { chapterBrandingMock, PURPLE_BRANDING } =
    await import("@/test/chapter-branding");
  return chapterBrandingMock({ ...PURPLE_BRANDING, chapterName: "Alpha Beta" });
});
vi.mock("@repo/hooks", () => ({
  useChatBackground: () => ({ data: state.data }),
}));

import { FrappThemeProvider } from "@/lib/theme";
import { ChatBackground, ChatBackgroundPaint } from "./chat-background";

/**
 * Holiday's snow on the phone (#6149): it drifts behind a thread, on the UI
 * thread, holds still under Reduce Motion, and a swatch draws it still.
 */
function render(node: React.ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FrappThemeProvider>{node}</FrappThemeProvider>);
  });
  return tree;
}

const snowfall = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.props.testID === "chat-background-snowfall");

describe("ChatBackground: Holiday", () => {
  it("lets the snow fall behind a thread", () => {
    vi.mocked(withRepeat).mockClear();
    state.data = { background: "holiday", source: "chapter", photo_url: null };
    const tree = render(<ChatBackground channelId="ch-1" />);
    expect(
      tree.root.findAll(
        (node) => node.props.testID === "chat-background-holiday",
      ).length,
    ).toBeGreaterThan(0);
    expect(snowfall(tree).length).toBeGreaterThan(0);
    expect(withRepeat).toHaveBeenCalled();
  });

  it("holds the snow still under Reduce Motion", () => {
    vi.mocked(withRepeat).mockClear();
    vi.mocked(useReducedMotion).mockReturnValue(true);
    state.data = { background: "holiday", source: "chapter", photo_url: null };
    const tree = render(<ChatBackground channelId="ch-1" />);
    expect(snowfall(tree).length).toBeGreaterThan(0);
    expect(withRepeat).not.toHaveBeenCalled();
    vi.mocked(useReducedMotion).mockReturnValue(false);
  });

  it("draws a swatch's snow still, with no moving layer", () => {
    const tree = render(
      <ChatBackgroundPaint paintKey="holiday" letters="AB" />,
    );
    expect(snowfall(tree)).toHaveLength(0);
  });
});
