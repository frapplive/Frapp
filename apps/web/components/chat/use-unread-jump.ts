"use client";

import {
  NO_UNREAD_JUMP,
  sameUnreadJumpState,
  UNREAD_JUMP_HIGHLIGHT_MS,
  unreadJumpEdgeOf,
  unreadJumpState,
  type UnreadJumpState,
  type UnreadJumpTarget,
} from "@repo/hooks";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { prefersReducedMotion } from "./use-rail-flip";
import { scrollerOf } from "./use-rail-reorder";

/**
 * The web rail's "New unreads" pills (#6045): which unread rows and folded
 * headings are scrolled out of view above and below, and the jump to the
 * nearest one. What counts is `unreadJumpTargets` (`@repo/hooks`), the
 * phone's rule too; this hook only measures where each one is drawn.
 *
 * A target is found by the `data-flip` key the rail already puts on every row
 * (`row:<id>`) and heading (`head:<key>`), which hold ids and section keys
 * only, so they go into the selector unescaped. The part of the list on screen is
 * its nearest scrolling ancestor, less the pinned section heading over its
 * top for a row (a heading pinned there is itself in view).
 */
export function useUnreadJump(
  listRef: RefObject<HTMLElement | null>,
  targets: readonly UnreadJumpTarget[],
): {
  state: UnreadJumpState;
  jump: (side: "above" | "below") => void;
  /** The target the last jump landed on, lit for a moment. */
  litKey: string | null;
} {
  const [state, setState] = useState<UnreadJumpState>(NO_UNREAD_JUMP);
  const [litKey, setLitKey] = useState<string | null>(null);
  const targetsRef = useRef(targets);
  // Where focus goes if the pill it is on goes away under it.
  const landedOn = useRef<{ key: string; side: "above" | "below" } | null>(
    null,
  );

  // Found once by the listener below, so a scroll frame walks no ancestors.
  const scrollerRef = useRef<HTMLElement | null>(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    const scroller =
      scrollerRef.current ??
      (list ? scrollerOf(list.parentElement, { overflowing: false }) : null);
    if (!list || !scroller) {
      setState((prev) =>
        sameUnreadJumpState(prev, NO_UNREAD_JUMP) ? prev : NO_UNREAD_JUMP,
      );
      return;
    }
    const view = scroller.getBoundingClientRect();
    const pinnedHead = list
      .querySelector<HTMLElement>('[data-flip^="head:"]')
      ?.getBoundingClientRect().height;
    const next = unreadJumpState(targetsRef.current, (target) => {
      const el = list.querySelector<HTMLElement>(`[data-flip="${target.key}"]`);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const isHead = target.key.startsWith("head:");
      return unreadJumpEdgeOf(rect, {
        top: view.top + (isHead ? 0 : (pinnedHead ?? 0)),
        bottom: view.bottom,
      });
    });
    setState((prev) => (sameUnreadJumpState(prev, next) ? prev : next));
  }, [listRef]);

  // Every render that changes the targets.
  useLayoutEffect(() => {
    targetsRef.current = targets;
    measure();
  }, [measure, targets]);

  useEffect(() => {
    const list = listRef.current;
    const scroller = list
      ? scrollerOf(list.parentElement, { overflowing: false })
      : null;
    scrollerRef.current = scroller;
    if (!list || !scroller) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    };
    scroller.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resize =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(schedule)
        : null;
    resize?.observe(scroller);
    resize?.observe(list);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resize?.disconnect();
      scrollerRef.current = null;
    };
  }, [listRef, measure]);

  // The lit row fades back after a moment.
  useEffect(() => {
    if (!litKey) return;
    const timer = setTimeout(() => setLitKey(null), UNREAD_JUMP_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [litKey]);

  // A pill pressed from the keyboard that goes away once nothing is left on
  // its side would drop focus to the page; it goes to the row it landed on.
  useEffect(() => {
    const landed = landedOn.current;
    if (!landed || state[landed.side] || typeof document === "undefined")
      return;
    landedOn.current = null;
    if (document.activeElement && document.activeElement !== document.body)
      return;
    const key = landed.key;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-flip="${key}"]`,
    );
    const focusable =
      el?.tagName === "BUTTON" ? el : el?.querySelector<HTMLElement>("button");
    focusable?.focus({ preventScroll: true });
  }, [state, listRef]);

  const jump = useCallback(
    (side: "above" | "below") => {
      const target = state[side]?.next;
      const list = listRef.current;
      if (!target || !list) return;
      const el = list.querySelector<HTMLElement>(`[data-flip="${target.key}"]`);
      // Centred, so the pinned heading never covers it and the next press
      // has the one after it to go to.
      el?.scrollIntoView?.({
        block: "center",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      landedOn.current = { key: target.key, side };
      setLitKey(target.key);
    },
    [state, listRef],
  );

  return { state, jump, litKey };
}
