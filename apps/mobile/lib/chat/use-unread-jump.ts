import {
  NO_UNREAD_JUMP,
  UNREAD_JUMP_HIGHLIGHT_MS,
  unreadJumpEdgeOf,
  unreadJumpState,
  type UnreadJumpState,
  type UnreadJumpTarget,
} from "@repo/hooks";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { ScrollView, View } from "react-native";
import type { ScreenScroll } from "@/lib/floating-chrome";
import { useReduceMotion } from "@/lib/use-reduce-motion";

/**
 * Chat home's "New unreads" pills (#6045): which unread rows and folded
 * headings are scrolled out of view above and below, and the jump to the
 * nearest one. What counts is `unreadJumpTargets` (`@repo/hooks`), web's rule
 * too; this hook only knows where each one is drawn.
 *
 * Each target's view registers through `refFor(key)`, and is measured against
 * the scroll view's content (`measureLayout` on its inner view, as
 * `components/settings/setting-anchor.tsx` does) whenever the targets or the
 * content's height change, and again once a scroll settles (a heading
 * measured while pinned reads where it was pinned). The scroll position comes
 * from the shell's own handler (`ScreenScrollWatchProvider`).
 */

/** Where a target is drawn in the scroll view's content. */
export type ContentSpan = { top: number; bottom: number };

/** What covers the scroll view's edges: the pinned heading, the floating bar. */
export type ViewInsets = { top: number; bottom: number };

/** A scroll that has been still this long has settled: measure again. */
const SETTLE_MS = 180;

/**
 * The pills, from the targets' spans and where the body is scrolled. A row
 * under the pinned heading or the floating bar is out of view; a heading
 * pinned at the top is in it.
 */
export function phoneUnreadJumpState(
  targets: readonly UnreadJumpTarget[],
  spans: ReadonlyMap<string, ContentSpan>,
  scroll: ScreenScroll | null,
  insets: ViewInsets,
): UnreadJumpState {
  if (!scroll || scroll.viewport <= 0) return NO_UNREAD_JUMP;
  const bottom = scroll.y + scroll.viewport - insets.bottom;
  return unreadJumpState(targets, (target) => {
    const span = spans.get(target.key);
    if (!span) return null;
    const isHead = target.key.startsWith("head:");
    return unreadJumpEdgeOf(span, {
      top: scroll.y + (isHead ? 0 : insets.top),
      bottom,
    });
  });
}

/** Where to scroll so the target sits mid-screen, within the content. */
export function unreadJumpScrollY(
  span: ContentSpan,
  scroll: ScreenScroll,
): number {
  const middle = (span.top + span.bottom) / 2;
  const max = Math.max(0, scroll.content - scroll.viewport);
  return Math.min(max, Math.max(0, middle - scroll.viewport / 2));
}

type Measurable = View & {
  measureLayout: (
    relativeTo: unknown,
    onSuccess: (x: number, y: number, width: number, height: number) => void,
    onFail?: () => void,
  ) => void;
};

export function useUnreadJump({
  targets,
  scrollRef,
  insets,
}: {
  targets: readonly UnreadJumpTarget[];
  scrollRef: RefObject<ScrollView | null>;
  insets: ViewInsets;
}): {
  state: UnreadJumpState;
  jump: (side: "above" | "below") => void;
  /** Spread onto the target's view: `ref={refFor(key)}`. */
  refFor: (key: string) => (node: View | null) => void;
  /** The scroll watch for `ScreenScrollWatchProvider`. */
  onScroll: (scroll: ScreenScroll) => void;
  /** The target the last jump landed on, lit for a moment. */
  litKey: string | null;
} {
  const reduceMotion = useReduceMotion();
  const nodes = useRef(new Map<string, View>());
  const refs = useRef(new Map<string, (node: View | null) => void>());
  const [spans, setSpans] = useState<ReadonlyMap<string, ContentSpan>>(
    () => new Map(),
  );
  const [scroll, setScroll] = useState<ScreenScroll | null>(null);
  const [litKey, setLitKey] = useState<string | null>(null);
  const targetsRef = useRef(targets);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastContent = useRef(0);

  const measure = useCallback(() => {
    const scrollView = scrollRef.current as
      (ScrollView & { getInnerViewRef?: () => unknown }) | null;
    const inner = scrollView?.getInnerViewRef?.();
    if (!inner) return;
    const next = new Map<string, ContentSpan>();
    const keys = targetsRef.current
      .map((t) => t.key)
      .filter((key) => nodes.current.has(key));
    let left = keys.length;
    if (left === 0) {
      setSpans(next);
      return;
    }
    const done = () => {
      left -= 1;
      if (left === 0) setSpans(next);
    };
    for (const key of keys) {
      (nodes.current.get(key) as Measurable).measureLayout(
        inner,
        (_x, y, _width, height) => {
          next.set(key, { top: y, bottom: y + height });
          done();
        },
        done,
      );
    }
  }, [scrollRef]);

  const targetKeys = useMemo(
    () => targets.map((t) => t.key).join("|"),
    [targets],
  );
  useEffect(() => {
    targetsRef.current = targets;
  }, [targets]);
  useEffect(() => {
    // A frame for the rows to lay out.
    const timer = setTimeout(measure, 0);
    return () => clearTimeout(timer);
  }, [measure, targetKeys]);

  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  const onScroll = useCallback(
    (next: ScreenScroll) => {
      setScroll(next);
      if (next.content !== lastContent.current) {
        lastContent.current = next.content;
        measure();
      }
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(measure, SETTLE_MS);
    },
    [measure],
  );

  const refFor = useCallback((key: string) => {
    let ref = refs.current.get(key);
    if (!ref) {
      ref = (node: View | null) => {
        if (node) nodes.current.set(key, node);
        else nodes.current.delete(key);
      };
      refs.current.set(key, ref);
    }
    return ref;
  }, []);

  const state = useMemo(
    () => phoneUnreadJumpState(targets, spans, scroll, insets),
    [targets, spans, scroll, insets],
  );

  useEffect(() => {
    if (!litKey) return;
    const timer = setTimeout(() => setLitKey(null), UNREAD_JUMP_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [litKey]);

  const jump = useCallback(
    (side: "above" | "below") => {
      const target = state[side]?.next;
      const span = target ? spans.get(target.key) : undefined;
      if (!target || !span || !scroll) return;
      scrollRef.current?.scrollTo({
        y: unreadJumpScrollY(span, scroll),
        animated: !reduceMotion,
      });
      setLitKey(target.key);
    },
    [state, spans, scroll, scrollRef, reduceMotion],
  );

  return { state, jump, refFor, onScroll, litKey };
}
