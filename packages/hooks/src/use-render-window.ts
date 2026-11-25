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
  /**
   * Draws the next step of rows. Calls before the new rows render add one
   * step, not one each, and it is a new function once they have, so a caller
   * that watches it (the web sentinel) asks again for the next step.
   */
  showMore: () => void;
}

export interface RenderWindowOptions<T> {
  size?: { first: number; step: number };
  /**
   * A row that must be drawn wherever it sits: the window stretches to the
   * last one it matches. For a row focus has to come back to, such as one
   * whose Star just moved it, or the file a viewer stepped to.
   */
  reveal?: (item: T) => boolean;
}

/**
 * A long list drawn a page at a time (#6088). The Documents screen mounted a
 * row for every file before it painted any: 400 rows for 400 files, so a
 * chapter with a few hundred sat on a blank list while the screen built
 * them all. Now it draws the first {@link RENDER_WINDOW.first} and adds
 * {@link RENDER_WINDOW.step} more as the reader nears the end.
 *
 * The window goes back to its first page whenever `resetKey` changes (a new
 * folder, search, filter or order: a different list), and only then, never
 * because the rows were rebuilt, so starring a file deep in the list doesn't
 * throw the reader back to the top.
 */
export function useRenderWindow<T>(
  items: readonly T[],
  resetKey: string,
  options: RenderWindowOptions<T> = {},
): RenderWindow<T> {
  const { first, step } = options.size ?? RENDER_WINDOW;
  const [state, setState] = useState({ key: resetKey, count: first });
  // A new list starts over at once, so coming back to an earlier key later
  // doesn't bring back how deep the reader had gone in it.
  if (state.key !== resetKey) setState({ key: resetKey, count: first });
  const base = state.key === resetKey ? state.count : first;
  const { reveal } = options;
  let through = -1;
  if (reveal) {
    for (let i = items.length - 1; i >= base; i--) {
      if (reveal(items[i]!)) {
        through = i;
        break;
      }
    }
  }
  const count = Math.max(base, through + 1);
  const hasMore = items.length > count;
  const showMore = useCallback(() => {
    setState((previous) =>
      previous.key === resetKey && previous.count > count
        ? previous
        : { key: resetKey, count: count + step },
    );
  }, [resetKey, count, step]);
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
