/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import {
  floatingScreenLayout,
  floatingTabBarBottom,
  floatingTabBarTop,
  ScreenScrollWatchProvider,
  useScreenScroll,
  useTabBarClearance,
} from "./floating-chrome";

describe("floatingTabBarBottom", () => {
  it("tucks 8pt into a home indicator or gesture bar", () => {
    expect(floatingTabBarBottom(34)).toBe(26);
    expect(floatingTabBarBottom(24)).toBe(16);
  });

  it("keeps 12pt off the edge with no inset", () => {
    expect(floatingTabBarBottom(0)).toBe(12);
  });

  it("sits wholly above Android's three-button bar", () => {
    expect(floatingTabBarBottom(48)).toBeGreaterThan(48);
  });

  it("measures the bar's top as its bottom plus the drawn 62pt", () => {
    expect(floatingTabBarTop(34)).toBe(26 + 62);
  });
});

/**
 * What a screen pads its scroll end by, read through the layout every tab
 * screen gets. The safe-area mock's bottom inset is 0, so the bar's top is
 * 12 + 62 off the edge, and the gap adds 14.
 */
describe("useTabBarClearance", () => {
  function clearanceOnATab(): number {
    let seen = -1;
    function Probe() {
      seen = useTabBarClearance();
      return null;
    }
    act(() => {
      create(
        floatingScreenLayout({
          route: { name: "tasks" },
          navigation: { addListener: () => () => {} },
          children: <Probe />,
        }),
      );
    });
    return seen;
  }

  it("clears the bar's top plus the gap on a tab, which the bar floats over", () => {
    expect(clearanceOnATab()).toBe(12 + 62 + 14);
  });

  it("is 0 outside the tab layout, as on a screen pushed over it", () => {
    let seen = -1;
    function Probe() {
      seen = useTabBarClearance();
      return null;
    }
    act(() => {
      create(<Probe />);
    });
    expect(seen).toBe(0);
  });
});

/**
 * A screen that watches its own scroll (#6045) hears every move through the
 * shell's handlers. Nothing folds any more: the fold went with the Frapp
 * Intelligence bar (#5983).
 */
describe("useScreenScroll", () => {
  const VIEW = 700;
  const CONTENT = 3000;

  it("gives a screen nobody watches nothing to attach, on a tab or not", () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useScreenScroll());
      return null;
    }
    act(() => {
      create(<Probe />);
    });
    act(() => {
      create(
        floatingScreenLayout({
          route: { name: "index" },
          navigation: { addListener: () => () => {} },
          children: <Probe />,
        }),
      );
    });
    expect(seen).toEqual([{}, {}]);
  });

  it("reports every move to a screen that watches its own scroll", () => {
    const seen: unknown[] = [];
    let watched: ReturnType<typeof useScreenScroll> = {};
    function Watched() {
      watched = useScreenScroll();
      return null;
    }
    act(() => {
      create(
        <ScreenScrollWatchProvider value={(s) => seen.push(s)}>
          <Watched />
        </ScreenScrollWatchProvider>,
      );
    });
    expect(watched.scrollEventThrottle).toBe(16);
    act(() =>
      watched.onScroll?.({
        nativeEvent: {
          contentOffset: { y: 120 },
          layoutMeasurement: { height: VIEW },
          contentSize: { height: CONTENT },
        },
      } as never),
    );
    act(() => watched.onContentSizeChange?.(0, CONTENT + 40));
    act(() =>
      watched.onLayout?.({
        nativeEvent: { layout: { height: VIEW - 100 } },
      } as never),
    );
    expect(seen).toEqual([
      { y: 120, viewport: VIEW, content: CONTENT },
      { y: 120, viewport: VIEW, content: CONTENT + 40 },
      { y: 120, viewport: VIEW - 100, content: CONTENT + 40 },
    ]);
  });
});
