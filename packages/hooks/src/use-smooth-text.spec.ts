import { describe, expect, it } from "vitest";
import { MIN_CHARS_PER_SECOND, nextRevealLength } from "./use-smooth-text";

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
