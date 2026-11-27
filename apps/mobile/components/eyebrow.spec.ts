import { signetDarkTokens } from "@repo/theme/signet";
import { describe, expect, it } from "vitest";
import { eyebrowStyle } from "./eyebrow";

/*
 * #6115 (Paul, 2026-11-26): section titles are small and in sentence case on
 * both apps, as web's `EYEBROW` draws them; never capitals or letter-spacing.
 */
describe("eyebrowStyle, the section title", () => {
  it("is the caption size, in sentence case and untracked", () => {
    const style = eyebrowStyle(signetDarkTokens);
    expect(style.fontSize).toBe(signetDarkTokens.typography.role.caption.size);
    expect(style).not.toHaveProperty("textTransform");
    expect(style).not.toHaveProperty("letterSpacing");
  });
});
