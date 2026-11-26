import { describe, expect, it } from "vitest";
import { EYEBROW } from "./typography";

/*
 * #6115 (Paul, 2026-11-26): section titles are small and in sentence case,
 * "more like claude and discord", never bold capitals or letter-spacing.
 */
describe("EYEBROW, the section title", () => {
  it("is the caption role at 600, in sentence case and untracked", () => {
    const classes = EYEBROW.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining(["text-caption", "font-semibold"]),
    );
    expect(classes).not.toContain("uppercase");
    expect(classes.some((c) => c.startsWith("tracking-"))).toBe(false);
  });
});
