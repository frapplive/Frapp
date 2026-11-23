/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MIN_CHARS_PER_SECOND,
  nextRevealLength,
  revealCut,
  useSmoothText,
} from "./use-smooth-text";

describe("nextRevealLength", () => {
  it("never passes the target", () => {
    expect(nextRevealLength(0, 10, 10_000)).toBe(10);
    expect(nextRevealLength(10, 10, 16)).toBe(10);
  });

  it("reveals at least one character a frame", () => {
    expect(nextRevealLength(0, 5, 16)).toBeGreaterThanOrEqual(1);
  });

  it("holds the reading-pace floor on a short backlog", () => {
    // 3 chars waiting, one second elapsed: the floor alone would allow 90.
    expect(nextRevealLength(0, 3, 1000)).toBe(3);
    const oneFrame = nextRevealLength(0, 1000, 16);
    expect(oneFrame).toBeGreaterThanOrEqual(
      Math.ceil((MIN_CHARS_PER_SECOND * 16) / 1000),
    );
  });

  it("catches a large backlog up within about a third of a second", () => {
    let shown = 0;
    for (let frame = 0; frame < 20; frame++) {
      shown = nextRevealLength(shown, 2000, 16);
    }
    expect(shown).toBeGreaterThan(1900);
  });

  it("does not move without elapsed time", () => {
    expect(nextRevealLength(4, 100, 0)).toBe(4);
  });
});

describe("revealCut", () => {
  it("ends on the end of the word it falls in", () => {
    expect(revealCut("Bring the agenda", 7)).toBe(9);
    expect(revealCut("Bring the agenda", 5)).toBe(5);
  });

  it("never splits a surrogate pair in a long unbroken run", () => {
    const link = `https://example.com/${"a".repeat(30)}\u{1F600}${"b".repeat(30)}`;
    const at = link.indexOf("\u{1F600}") + 1;
    expect(revealCut(link, at)).toBe(at + 1);
  });
});

describe("useSmoothText", () => {
  let frames: FrameRequestCallback[] = [];
  let clock = 0;
  beforeEach(() => {
    frames = [];
    clock = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  function runFrames(count: number) {
    for (let i = 0; i < count; i++) {
      const due = frames;
      frames = [];
      clock += 16;
      act(() => due.forEach((cb) => cb(clock)));
    }
  }

  it("returns the text as it is when not paced", () => {
    const { result } = renderHook(() => useSmoothText("Hello there", false));
    expect(result.current).toBe("Hello there");
  });

  it("reveals the text over frames and ends on all of it", () => {
    const text = "Your next chapter meeting is Sunday at 7 PM.";
    const { result } = renderHook(() => useSmoothText(text, true));
    expect(result.current).toBe("");
    runFrames(2);
    expect(result.current.length).toBeGreaterThan(0);
    expect(result.current.length).toBeLessThan(text.length);
    expect(text.startsWith(result.current)).toBe(true);
    runFrames(60);
    expect(result.current).toBe(text);
  });

  it("starts over when the preview is cleared and begun again", () => {
    const { result, rerender } = renderHook(
      ({ text }) => useSmoothText(text, true),
      { initialProps: { text: "First answer words" } },
    );
    runFrames(60);
    expect(result.current).toBe("First answer words");
    rerender({ text: "" });
    rerender({ text: "Second" });
    expect(result.current).toBe("");
    runFrames(60);
    expect(result.current).toBe("Second");
  });
});
