/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import type { ScrollView, View } from "react-native";
import { describe, expect, it, vi } from "vitest";
import type { UnreadJumpTarget } from "@repo/hooks";
import {
  phoneUnreadJumpState,
  unreadJumpScrollY,
  useUnreadJump,
  type ContentSpan,
} from "./use-unread-jump";

vi.mock("@/lib/use-reduce-motion", () => ({ useReduceMotion: () => false }));

const INSETS = { top: 44, bottom: 100 };
const t = (key: string, addressed = false): UnreadJumpTarget => ({
  key,
  addressed,
});

describe("phoneUnreadJumpState", () => {
  // A 600pt body: the pinned heading covers its top 44, the floating bar its
  // bottom 100, so rows read in view from y + 44 to y + 500.
  const spans = new Map<string, ContentSpan>([
    ["row:a", { top: 100, bottom: 150 }],
    ["head:category:x", { top: 300, bottom: 344 }],
    ["row:b", { top: 1000, bottom: 1050 }],
    ["row:c", { top: 1400, bottom: 1450 }],
  ]);
  const targets = [
    t("row:a"),
    t("head:category:x"),
    t("row:b"),
    t("row:c", true),
  ];

  it("has a pill only on the sides with an unread out of view", () => {
    const state = phoneUnreadJumpState(
      targets,
      spans,
      { y: 0, viewport: 600, content: 2000 },
      INSETS,
    );
    expect(state.above).toBeNull();
    expect(state.below).toEqual({ next: t("row:b"), addressed: true });
  });

  it("counts a row under the floating bar as out of view", () => {
    const state = phoneUnreadJumpState(
      [t("row:low")],
      new Map([["row:low", { top: 520, bottom: 570 }]]),
      { y: 0, viewport: 600, content: 2000 },
      INSETS,
    );
    expect(state.below?.next.key).toBe("row:low");
  });

  it("counts a row under the pinned heading as out of view, but not a heading pinned there", () => {
    const state = phoneUnreadJumpState(
      targets,
      spans,
      { y: 290, viewport: 600, content: 2000 },
      INSETS,
    );
    // row:a is far above; the heading at 300 sits just under the top edge.
    expect(state.above).toEqual({ next: t("row:a"), addressed: false });
  });

  it("draws nothing before the body has been measured", () => {
    expect(phoneUnreadJumpState(targets, spans, null, INSETS)).toEqual({
      above: null,
      below: null,
    });
  });
});

describe("unreadJumpScrollY", () => {
  it("centres the target, inside the content", () => {
    const scroll = { y: 0, viewport: 600, content: 2000 };
    expect(unreadJumpScrollY({ top: 1000, bottom: 1050 }, scroll)).toBe(725);
    expect(unreadJumpScrollY({ top: 100, bottom: 150 }, scroll)).toBe(0);
    expect(unreadJumpScrollY({ top: 1950, bottom: 2000 }, scroll)).toBe(1400);
  });
});

describe("useUnreadJump", () => {
  function setup() {
    const inner = {};
    const scrollTo = vi.fn();
    const scrollRef = {
      current: {
        getInnerViewRef: () => inner,
        scrollTo,
      } as unknown as ScrollView,
    };
    const node = (top: number, height: number) =>
      ({
        measureLayout: (
          relativeTo: unknown,
          onSuccess: (x: number, y: number, w: number, h: number) => void,
        ) => {
          expect(relativeTo).toBe(inner);
          onSuccess(0, top, 300, height);
        },
      }) as unknown as View;
    const targets = [t("row:a"), t("row:b", true)];
    const hook = renderHook(() =>
      useUnreadJump({ targets, scrollRef, insets: INSETS }),
    );
    act(() => {
      hook.result.current.refFor("row:a")(node(100, 50));
      hook.result.current.refFor("row:b")(node(1000, 50));
    });
    return { hook, scrollTo };
  }

  it("measures the rows against the content and scrolls to the nearest one, lit", async () => {
    vi.useFakeTimers();
    const { hook, scrollTo } = setup();
    act(() => {
      hook.result.current.onScroll({ y: 0, viewport: 600, content: 2000 });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(hook.result.current.state.below).toEqual({
      next: t("row:b", true),
      addressed: true,
    });
    act(() => hook.result.current.jump("below"));
    expect(scrollTo).toHaveBeenCalledWith({ y: 725, animated: true });
    expect(hook.result.current.litKey).toBe("row:b");
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });
    expect(hook.result.current.litKey).toBeNull();
    vi.useRealTimers();
  });
});
