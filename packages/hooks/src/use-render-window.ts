import { useCallback, useMemo, useState } from "react";

/**
 * How many rows a long list draws at first, and how many more each time the
 * reader nears its end.
 */
export const RENDER_WINDOW = { first: 40, step: 40 } as const;

export interface RenderWindow<T> {
  /** The rows to draw: the first `count` of the list. */
  shown: readonly T[];
  /** Whether rows past `shown` are waiting to be drawn. */
  hasMore: boolean;
  /** Draws the next step of rows; nothing when every row is drawn. */
  showMore: () => void;
}

/**
 * A long list drawn a page at a time (#6088). The Documents screen mounted a
 * row for every file before it painted any: 400 rows for 400 files, so a
 * chapter with a few hundred sat on a blank list while the phone built
 * them all. Now it draws the first {@link RENDER_WINDOW.first} and adds
 * {@link RENDER_WINDOW.step} more as the reader nears the end.
 *
 * The window goes back to its first page only when `resetKey` changes (a new
 * folder, search, filter or order: a different list), never because the rows
 * were rebuilt, so starring a file deep in the list doesn't throw the reader
 * back to the top.
 */
export function useRenderWindow<T>(
  items: readonly T[],
  resetKey: string,
  size: { first: number; step: number } = RENDER_WINDOW,
): RenderWindow<T> {
  const [state, setState] = useState({ key: resetKey, count: size.first });
  const count = state.key === resetKey ? state.count : size.first;
  const hasMore = items.length > count;
  const showMore = useCallback(() => {
    setState((previous) => {
      const from = previous.key === resetKey ? previous.count : size.first;
      return { key: resetKey, count: from + size.step };
    });
  }, [resetKey, size.first, size.step]);
  const shown = useMemo(
    () => (hasMore ? items.slice(0, count) : items),
    [items, count, hasMore],
  );
  return { shown, hasMore, showMore: hasMore ? showMore : noop };
}

function noop(): void {}

/**
 * Whether a scrolled view is within `margin` of its end: one more screen's
 * worth by default, so the next rows are drawn before the reader reaches
 * them. A list shorter than its view counts as at its end, so a window that
 * doesn't fill the screen keeps growing until it does.
 */
export function nearScrollEnd(
  scroll: { y: number; viewport: number; content: number },
  margin = scroll.viewport,
): boolean {
  return scroll.y + scroll.viewport >= scroll.content - margin;
}
