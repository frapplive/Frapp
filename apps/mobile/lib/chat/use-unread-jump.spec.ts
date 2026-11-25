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

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("@/lib/use-reduce-motion", () => ({
  useReduceMotion: () => motion.reduce,
}));

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
  type Props = { targets: UnreadJumpTarget[]; layout?: unknown };

  function setup(initial: UnreadJumpTarget[] = [t("row:a"), t("row:b", true)]) {
    const inner = {};
    const scrollTo = vi.fn();
    const scrollRef = {
      current: {
        getInnerViewRef: () => inner,
        scrollTo,
      } as unknown as ScrollView,
    };
    // Where each row is drawn now; a test moves one to stand in for a pin.
    const tops = new Map<string, number>([
      ["row:a", 100],
      ["row:b", 1000],
      ["row:c", 1500],
    ]);
    const measured = vi.fn();
    const node = (key: string) =>
      ({
        measureLayout: (
          relativeTo: unknown,
          onSuccess: (x: number, y: number, w: number, h: number) => void,
        ) => {
          expect(relativeTo).toBe(inner);
          measured(key);
          onSuccess(0, tops.get(key)!, 300, 50);
        },
      }) as unknown as View;
    const renders = { count: 0 };
    const hook = renderHook(
      ({ targets, layout }: Props) => {
        renders.count += 1;
        return useUnreadJump({ targets, scrollRef, insets: INSETS, layout });
      },
      { initialProps: { targets: initial } as Props },
    );
    act(() => {
      for (const key of ["row:a", "row:b", "row:c"]) {
        hook.result.current.refFor(key)(node(key));
      }
    });
    return { hook, scrollTo, tops, measured, renders };
  }

  const settle = () =>
    act(async () => {
      vi.advanceTimersByTime(200);
    });

  it("measures the rows against the content and scrolls to the nearest one, lit", async () => {
    vi.useFakeTimers();
    motion.reduce = false;
    const { hook, scrollTo } = setup();
    act(() => {
      hook.result.current.onScroll({ y: 0, viewport: 600, content: 2000 });
    });
    await settle();
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

  it("jumps without animating under reduced motion", async () => {
    vi.useFakeTimers();
    motion.reduce = true;
    const { hook, scrollTo } = setup();
    act(() => {
      hook.result.current.onScroll({ y: 0, viewport: 600, content: 2000 });
    });
    await settle();
    act(() => hook.result.current.jump("below"));
    expect(scrollTo).toHaveBeenCalledWith({ y: 725, animated: false });
    motion.reduce = false;
    vi.useRealTimers();
  });

  it("shows a pill when a message lands below with the list still", async () => {
    vi.useFakeTimers();
    const { hook } = setup([t("row:a")]);
    act(() => {
      hook.result.current.onScroll({ y: 0, viewport: 600, content: 2000 });
    });
    await settle();
    expect(hook.result.current.state.below).toBeNull();
    // No scroll, no content change: only the counts move.
    hook.rerender({ targets: [t("row:a"), t("row:c")] });
    await settle();
    expect(hook.result.current.state.below?.next.key).toBe("row:c");
    vi.useRealTimers();
  });

  it("measures again when rows move without the content's height changing", async () => {
    vi.useFakeTimers();
    const targets = [t("row:b")];
    const { hook, tops, measured } = setup(targets);
    act(() => {
      hook.result.current.onScroll({ y: 0, viewport: 600, content: 2000 });
    });
    await settle();
    expect(hook.result.current.state.below?.next.key).toBe("row:b");
    // A pin lifts row b into view; the targets are the same array.
    tops.set("row:b", 300);
    measured.mockClear();
    hook.rerender({ targets, layout: "pinned" });
    await settle();
    expect(measured).toHaveBeenCalledWith("row:b");
    expect(hook.result.current.state.below).toBeNull();
    vi.useRealTimers();
  });

  it("renders the screen only when a pill changes, not on every scroll", async () => {
    vi.useFakeTimers();
    const { hook, renders } = setup();
    act(() => {
      hook.result.current.onScroll({ y: 0, viewport: 600, content: 2000 });
    });
    await settle();
    const before = renders.count;
    act(() => {
      for (let y = 1; y <= 30; y++) {
        hook.result.current.onScroll({ y, viewport: 600, content: 2000 });
      }
    });
    await settle();
    expect(renders.count).toBe(before);
    vi.useRealTimers();
  });
});
