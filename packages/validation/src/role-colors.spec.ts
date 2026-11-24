import {
  AA_NORMAL,
  contrastRatio,
  hexToOklch,
  hsvToHex,
  parseHex,
} from "@repo/color";
import { describe, expect, it } from "vitest";

import {
  adjustRoleColor,
  chapterRoleColors,
  commitRoleColorHex,
  isPaintableRoleColor,
  isRoleColorSwatch,
  parseRoleColorInput,
  pickRoleColor,
  reservedBandForHue,
  reservedRoleHue,
  ROLE_COLOR_HEXES,
  ROLE_COLOR_PALETTE,
  ROLE_COLOR_RESERVED_BANDS,
  ROLE_COLOR_SURFACES,
  ROLE_COLOR_SWATCH_COLUMNS,
  ROLE_COLOR_SWATCHES,
  roleColor,
  roleColorLabel,
  roleColorOrNull,
  roleColorPickNote,
  roleColorPreviewName,
  topRoleColor,
} from "./role-colors";

function minContrast(hex: string): number {
  return Math.min(
    ...Object.values(ROLE_COLOR_SURFACES).map((surface) =>
      contrastRatio(parseHex(hex)!, parseHex(surface)!),
    ),
  );
}

// The palette's contrast against the Signet surfaces is guarded in
// apps/web/components/roles/role-colors-contrast.spec.ts, which reads the
// surfaces from the token source.

describe("ROLE_COLOR_PALETTE", () => {
  it("has unique keys and uppercase #RRGGBB values", () => {
    const keys = ROLE_COLOR_PALETTE.map((swatch) => swatch.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(ROLE_COLOR_HEXES).size).toBe(ROLE_COLOR_HEXES.length);
    for (const hex of ROLE_COLOR_HEXES) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("roleColorOrNull", () => {
  it("returns the palette hex for a palette value in any case", () => {
    expect(roleColorOrNull("#f2994a")).toBe("#F2994A");
    expect(roleColorOrNull(" #F2994A ")).toBe("#F2994A");
  });

  it("returns null for gold, red, too-dark hexes and non-strings", () => {
    // Pre-#3485 seeds: gold is reserved, the grey is too dark to read.
    expect(roleColorOrNull("#FFD700")).toBeNull();
    expect(roleColorOrNull("#6B7280")).toBeNull();
    expect(roleColorOrNull("#FF665C")).toBeNull();
    expect(roleColorOrNull("#EFB63B")).toBeNull();
    // A red that reads (5.5:1 on --card-hover): only the red band refuses it.
    expect(minContrast("#FF8A80")).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(roleColorOrNull("#FF8A80")).toBeNull();
    expect(roleColorOrNull("#123456")).toBeNull();
    expect(roleColorOrNull(null)).toBeNull();
    expect(roleColorOrNull(undefined)).toBeNull();
    expect(roleColorOrNull(42)).toBeNull();
    // A short #RGB is refused even when its long form reads (#77CCEE does).
    expect(roleColorOrNull("#77CCEE")).toBe("#77CCEE");
    expect(roleColorOrNull("#7ce")).toBeNull();
    expect(roleColorOrNull("blue")).toBeNull();
  });

  it("paints a custom hex that reads on every surface, uppercased", () => {
    // Emerald, the pre-#3485 seed: it reads at AA everywhere and isn't red
    // or gold, so since #5784 it paints.
    expect(roleColorOrNull("#10b981")).toBe("#10B981");
    expect(minContrast("#10B981")).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("paints every palette value exactly as listed, including the two that need a hover lift", () => {
    for (const hex of ROLE_COLOR_HEXES) {
      expect(roleColorOrNull(hex)).toBe(hex);
      expect(roleColorOrNull(hex.toLowerCase())).toBe(hex);
    }
  });
});

describe("reserved hues", () => {
  it("reserves the danger reds and the brand golds, and none of the palette", () => {
    expect(reservedRoleHue("#FF665C")).toBe("red"); // --destructive
    expect(reservedRoleHue("#E5484D")).toBe("red"); // --mention
    expect(reservedRoleHue("#FF0000")).toBe("red");
    expect(reservedRoleHue("#EFB63B")).toBe("gold"); // house gold
    expect(reservedRoleHue("#FFD700")).toBe("gold");
    for (const hex of ROLE_COLOR_HEXES) expect(reservedRoleHue(hex)).toBeNull();
  });

  it("leaves greys and beiges alone whatever their hue", () => {
    expect(reservedRoleHue("#D9B99B")).toBeNull(); // Sand, 65°
    expect(reservedRoleHue("#C8BFB0")).toBeNull();
  });

  it("reads band edges as from-inclusive, to-exclusive", () => {
    for (const band of ROLE_COLOR_RESERVED_BANDS) {
      expect(reservedBandForHue(band.from)).toBe(band.key);
      expect(reservedBandForHue(band.to - 0.01)).toBe(band.key);
      expect(reservedBandForHue(band.to)).toBeNull();
      expect(reservedBandForHue(band.from - 0.01)).toBeNull();
    }
  });
});

describe("ROLE_COLOR_SWATCH_COLUMNS", () => {
  it("offers thirty distinct swatches in ten columns of three", () => {
    expect(ROLE_COLOR_SWATCH_COLUMNS).toHaveLength(10);
    for (const column of ROLE_COLOR_SWATCH_COLUMNS) {
      expect(column.swatches).toHaveLength(3);
    }
    const hexes = ROLE_COLOR_SWATCHES.map((swatch) => swatch.hex.toUpperCase());
    expect(new Set(hexes).size).toBe(30);
    const labels = ROLE_COLOR_SWATCHES.map((swatch) => swatch.label);
    expect(new Set(labels).size).toBe(30);
  });

  it("reads every swatch at AA on every surface, outside red and gold", () => {
    for (const swatch of ROLE_COLOR_SWATCHES) {
      expect(roleColorOrNull(swatch.hex), swatch.label).toBe(swatch.hex);
      expect(minContrast(swatch.hex), swatch.label).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
      expect(reservedRoleHue(swatch.hex), swatch.label).toBeNull();
    }
  });

  it("keeps the ten palette colors, as listed and with their names", () => {
    const hexes: readonly string[] = ROLE_COLOR_SWATCHES.map(
      (swatch) => swatch.hex,
    );
    for (const hex of ROLE_COLOR_HEXES) expect(hexes).toContain(hex);
    for (const swatch of ROLE_COLOR_PALETTE) {
      expect(roleColorLabel(swatch.hex)).toBe(swatch.label);
      expect(isRoleColorSwatch(swatch.hex.toLowerCase())).toBe(true);
    }
  });
});

describe("roleColorLabel", () => {
  it("names no color, a swatch, and anything else as custom", () => {
    expect(roleColorLabel(null)).toBe("No color");
    expect(roleColorLabel("#f96b9f")).toBe("Bright rose");
    expect(roleColorLabel("#10B981")).toBe("Custom color");
  });
});

describe("parseRoleColorInput", () => {
  it("takes a hex with or without #, short or long, in any case", () => {
    expect(parseRoleColorInput("#4a90e2")).toBe("#4A90E2");
    expect(parseRoleColorInput("4A90E2")).toBe("#4A90E2");
    expect(parseRoleColorInput("  #abc ")).toBe("#AABBCC");
    expect(parseRoleColorInput("fff")).toBe("#FFFFFF");
  });

  it("refuses anything that isn't a hex color", () => {
    for (const text of ["", "#", "blue", "#12345", "#GGGGGG", "##123456"]) {
      expect(parseRoleColorInput(text), text).toBeNull();
    }
  });
});

describe("pickRoleColor", () => {
  it("keeps a color that already reads, and says nothing", () => {
    const pick = pickRoleColor("#10b981");
    expect(pick).toEqual({ hex: "#10B981", nudged: null, lightened: false });
    expect(roleColorPickNote(pick)).toBeNull();
    expect(pickRoleColor("#f2994a")!.hex).toBe("#F2994A");
  });

  it("lightens a dark color to the nearest readable shade and says so", () => {
    const pick = pickRoleColor("#1E3A8A")!; // a dark navy
    expect(pick.lightened).toBe(true);
    expect(pick.nudged).toBeNull();
    expect(isPaintableRoleColor(pick.hex)).toBe(true);
    const hue = (hex: string) => hexToOklch(hex)!.h;
    expect(Math.abs(hue(pick.hex) - hue("#1E3A8A"))).toBeLessThan(5);
    expect(roleColorPickNote(pick)).toBe(
      "Made lighter so names stay readable.",
    );
  });

  it("moves red and gold to the nearest allowed hue and says why", () => {
    for (const [hex, band] of [
      ["#FF0000", "red"],
      ["#B91C1C", "red"],
      ["#EFB63B", "gold"],
      ["#FFD700", "gold"],
    ] as const) {
      const pick = pickRoleColor(hex)!;
      expect(pick.nudged, hex).toBe(band);
      expect(pick.lightened).toBe(false);
      expect(isPaintableRoleColor(pick.hex), `${hex} → ${pick.hex}`).toBe(true);
      expect(roleColorPickNote(pick)).toMatch(
        /is kept for .* This is the nearest color you can use\.$/,
      );
    }
  });

  it("makes every point of the custom square and hue bar paintable", () => {
    for (let h = 0; h < 360; h += 5) {
      for (const s of [0, 0.25, 0.5, 0.75, 1]) {
        for (const v of [0, 0.3, 0.6, 1]) {
          const hex = hsvToHex({ h, s, v });
          const pick = pickRoleColor(hex)!;
          expect(isPaintableRoleColor(pick.hex), `${hex} → ${pick.hex}`).toBe(
            true,
          );
          expect(reservedRoleHue(pick.hex)).toBeNull();
        }
      }
    }
  });

  it("refuses a non-color", () => {
    expect(pickRoleColor("blue")).toBeNull();
    expect(roleColorPickNote(null)).toBeNull();
  });
});

describe("chapterRoleColors", () => {
  it("lists the chapter's own custom colors, most used first", () => {
    expect(
      chapterRoleColors([
        "#10b981",
        null,
        "#F2994A", // a swatch: already in the grid
        "#FF0000", // may not paint
        "#4ADE80",
        "#10B981",
        undefined,
        "not a color",
      ]),
    ).toEqual(["#10B981", "#4ADE80"]);
  });

  it("puts the most used first, not the first seen", () => {
    expect(
      chapterRoleColors(["#4ADE80", "#10B981", "#10B981", "#10B981"]),
    ).toEqual(["#10B981", "#4ADE80"]);
  });

  it("offers at most ten", () => {
    const many = Array.from(
      { length: 14 },
      (_, index) =>
        pickRoleColor(hsvToHex({ h: 140 + index * 8, s: 0.6, v: 0.9 }))!.hex,
    );
    expect(chapterRoleColors(many).length).toBeLessThanOrEqual(10);
  });
});

describe("adjustRoleColor", () => {
  it("returns a color that already reads as it is", () => {
    expect(adjustRoleColor("#10B981")).toEqual({
      hex: "#10B981",
      nudged: null,
    });
  });

  it("lifts a dark color until it reads, keeping its hue", () => {
    const result = adjustRoleColor("#1E3A8A")!; // a dark navy
    expect(result.nudged).toBeNull();
    expect(minContrast(result.hex)).toBeGreaterThanOrEqual(AA_NORMAL);
    const hue = (hex: string) => hexToOklch(hex)!.h;
    expect(Math.abs(hue(result.hex) - hue("#1E3A8A"))).toBeLessThan(5);
  });

  it("moves red and gold out of their bands and says which", () => {
    expect(adjustRoleColor("#FF0000")!.nudged).toBe("red");
    expect(adjustRoleColor("#EFB63B")!.nudged).toBe("gold");
    for (const hex of ["#FF0000", "#EFB63B", "#FFD700", "#B91C1C"]) {
      const adjusted = adjustRoleColor(hex)!.hex;
      expect(isPaintableRoleColor(adjusted), `${hex} → ${adjusted}`).toBe(true);
    }
  });

  it("makes any color paintable", () => {
    // A deterministic sweep across the cube, every 17th step of each channel.
    for (let r = 0; r < 256; r += 51) {
      for (let g = 0; g < 256; g += 51) {
        for (let b = 0; b < 256; b += 51) {
          const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
          const adjusted = adjustRoleColor(hex)!.hex;
          expect(isPaintableRoleColor(adjusted), `${hex} → ${adjusted}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("refuses a non-color", () => {
    expect(adjustRoleColor("blue")).toBeNull();
  });
});

describe("topRoleColor", () => {
  const roles = [
    {
      id: "president",
      name: "president",
      color: roleColor("orange"),
      display_order: 1,
    },
    {
      id: "treasurer",
      name: "treasurer",
      color: roleColor("green"),
      display_order: 2,
    },
    { id: "member", name: "member", color: null, display_order: 5 },
    { id: "legacy", name: "legacy", color: "#FFD700", display_order: 0 },
  ];

  it("picks the lowest display_order role that has a palette color", () => {
    expect(topRoleColor(roles, ["member", "treasurer", "president"])).toBe(
      "#F2994A",
    );
    expect(topRoleColor(roles, ["member", "treasurer"])).toBe("#6FD08C");
  });

  it("skips uncolored and off-palette roles instead of letting them win", () => {
    expect(topRoleColor(roles, ["legacy", "treasurer"])).toBe("#6FD08C");
    expect(topRoleColor(roles, ["member"])).toBeNull();
  });

  it("returns null for no roles or unknown ids", () => {
    expect(topRoleColor(roles, [])).toBeNull();
    expect(topRoleColor(roles, ["gone"])).toBeNull();
  });

  it("ranks by tier before display_order, so an untiered role at 0 never wins", () => {
    const tiered = [
      {
        id: "pres",
        name: "President",
        color: roleColor("orange"),
        display_order: 1,
        tier_id: "cabinet",
      },
      {
        id: "floor",
        name: "First Floor",
        color: roleColor("sky"),
        display_order: 0,
        tier_id: null,
      },
    ];
    const positions = new Map([["cabinet", 1]]);
    expect(topRoleColor(tiered, ["floor", "pres"], positions)).toBe("#F2994A");
  });

  it("breaks display_order ties by role id, not row order", () => {
    const tied = [
      { id: "b", name: "Same", color: roleColor("sky"), display_order: 3 },
      { id: "a", name: "Same", color: roleColor("rose"), display_order: 3 },
    ];
    expect(topRoleColor(tied, ["a", "b"])).toBe("#F47FA4");
    expect(topRoleColor([...tied].reverse(), ["a", "b"])).toBe("#F47FA4");
  });
});

describe("commitRoleColorHex", () => {
  it("does nothing for the color already shown, in any case", () => {
    expect(commitRoleColorHex("#10b981", "#10B981")).toBeNull();
    expect(commitRoleColorHex(" #10B981 ", "#10B981")).toBeNull();
  });

  it("refuses text that isn't a hex", () => {
    expect(commitRoleColorHex("blue", null)).toBe("invalid");
  });

  it("makes the pick, even when it adjusts to the color already shown", () => {
    const shown = pickRoleColor("#FF0000")!.hex;
    const pick = commitRoleColorHex("#FF0000", shown);
    expect(pick).toEqual(pickRoleColor("#FF0000"));
  });
});

describe("roleColorPreviewName", () => {
  it("names the role, or the color while the role has no name", () => {
    expect(roleColorPreviewName("  Rush chair ", "#F2994A")).toBe("Rush chair");
    expect(roleColorPreviewName("  ", "#F2994A")).toBe("Orange");
    expect(roleColorPreviewName("", null)).toBe("No color");
  });
});
