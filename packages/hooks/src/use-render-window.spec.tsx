/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  nearScrollEnd,
  RENDER_WINDOW,
  useRenderWindow,
} from "./use-render-window";

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("useRenderWindow (#6088)", () => {
  it("draws only the first page of a long list, not every row", () => {
    const items = rows(400);
    const { result } = renderHook(() => useRenderWindow(items, "all"));

    expect(result.current.shown).toHaveLength(RENDER_WINDOW.first);
    expect(result.current.hasMore).toBe(true);
  });

  it("draws a short list whole", () => {
    const items = rows(12);
    const { result } = renderHook(() => useRenderWindow(items, "all"));

    expect(result.current.shown).toBe(items);
    expect(result.current.hasMore).toBe(false);
  });

  it("adds a step each time the reader nears the end, up to the whole list", () => {
    const items = rows(100);
    const { result } = renderHook(() => useRenderWindow(items, "all"));

    act(() => result.current.showMore());
    expect(result.current.shown).toHaveLength(
      RENDER_WINDOW.first + RENDER_WINDOW.step,
    );
    act(() => result.current.showMore());
    expect(result.current.shown).toHaveLength(100);
    expect(result.current.hasMore).toBe(false);
  });

  it("keeps its depth when the rows are rebuilt (a star), and starts over for a new list", () => {
    let items = rows(400);
    let key = "all";
    const { result, rerender } = renderHook(() => useRenderWindow(items, key));
    act(() => result.current.showMore());
    const deep = RENDER_WINDOW.first + RENDER_WINDOW.step;

    items = [...items];
    rerender();
    expect(result.current.shown).toHaveLength(deep);

    key = "folder:Rush";
    rerender();
    expect(result.current.shown).toHaveLength(RENDER_WINDOW.first);
  });
});

describe("useRenderWindow, after review (#6088)", () => {
  it("starts over on a key it has had before, rather than at that key's old depth", () => {
    const items = rows(400);
    let key = "all";
    const { result, rerender } = renderHook(() => useRenderWindow(items, key));
    act(() => result.current.showMore());
    act(() => result.current.showMore());

    key = "search:a";
    rerender();
    key = "all";
    rerender();
    expect(result.current.shown).toHaveLength(RENDER_WINDOW.first);
  });

  it("adds one step for calls made before the new rows render", () => {
    const items = rows(400);
    const { result } = renderHook(() => useRenderWindow(items, "all"));
    const { showMore } = result.current;
    act(() => {
      showMore();
      showMore();
      showMore();
    });

    expect(result.current.shown).toHaveLength(
      RENDER_WINDOW.first + RENDER_WINDOW.step,
    );
  });

  it("stretches to draw a row it is told to reveal, and grows on from there", () => {
    const items = rows(400);
    let reveal: number | null = 150;
    const { result, rerender } = renderHook(() =>
      useRenderWindow(items, "all", {
        reveal: (item) => item === reveal,
      }),
    );
    expect(result.current.shown).toHaveLength(151);

    act(() => result.current.showMore());
    expect(result.current.shown).toHaveLength(151 + RENDER_WINDOW.step);

    reveal = null;
    rerender();
    expect(result.current.shown).toHaveLength(151 + RENDER_WINDOW.step);
  });
});

describe("nearScrollEnd", () => {
  it("is true within a screen of the end, and for a list shorter than its view", () => {
    expect(nearScrollEnd({ y: 0, viewport: 800, content: 4000 })).toBe(false);
    expect(nearScrollEnd({ y: 2500, viewport: 800, content: 4000 })).toBe(true);
    expect(nearScrollEnd({ y: 0, viewport: 800, content: 500 })).toBe(true);
  });
});
