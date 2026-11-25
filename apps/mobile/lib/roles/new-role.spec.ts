import { describe, expect, it } from "vitest";
import type { Reach, TierRow } from "@repo/hooks/role-tiers";
import { defaultNewRolePlacement, newRolePlacements } from "./new-role";

// #5296: Chapter settings → New role offers only the places the API lets the
// officer put a role: tiers ranked below their own, then outside the tiers.
const TIERS: TierRow[] = [
  {
    id: "t-exec",
    name: "Executive",
    position: 0,
    permissions: [],
    mentionable: true,
  },
  {
    id: "t-chairs",
    name: "Chairs",
    position: 1,
    permissions: [],
    mentionable: true,
  },
  {
    id: "t-members",
    name: "Members",
    position: 2,
    permissions: [],
    mentionable: true,
  },
];

function reach(over: Partial<Reach>): Reach {
  return {
    wildcard: false,
    known: true,
    rank: 0,
    held: new Set(),
    userId: null,
    ...over,
  };
}

describe("newRolePlacements", () => {
  it("offers every tier below the officer's, top first, then outside", () => {
    expect(
      newRolePlacements(reach({ rank: 0 }), TIERS, "Outside the tiers"),
    ).toEqual([
      { value: "t-chairs", label: "Chairs" },
      { value: "t-members", label: "Members" },
      { value: null, label: "Outside the tiers" },
    ]);
  });

  it("offers the president every tier", () => {
    expect(
      newRolePlacements(reach({ wildcard: true }), TIERS, "Outside").map(
        (p) => p.value,
      ),
    ).toEqual(["t-exec", "t-chairs", "t-members", null]);
  });

  it("offers nothing on a guess, before the officer's rank is read", () => {
    expect(
      newRolePlacements(reach({ known: false }), TIERS, "Outside"),
    ).toEqual([]);
  });

  it("offers only outside to an officer in the bottom tier", () => {
    expect(newRolePlacements(reach({ rank: 2 }), TIERS, "Outside")).toEqual([
      { value: null, label: "Outside" },
    ]);
  });

  it("leaves out a tier carrying a permission the officer doesn't hold", () => {
    // POST /v1/roles gives a role sent with no permissions its tier's, and
    // refuses one carrying a permission the caller lacks.
    const tiers = TIERS.map((t) =>
      t.id === "t-chairs" ? { ...t, permissions: ["billing:manage"] } : t,
    );
    expect(
      newRolePlacements(reach({ rank: 0 }), tiers, "Outside").map(
        (p) => p.value,
      ),
    ).toEqual(["t-members", null]);
    const holds = reach({ rank: 0, held: new Set(["billing:manage"]) });
    expect(
      newRolePlacements(holds, tiers, "Outside").map((p) => p.value),
    ).toEqual(["t-chairs", "t-members", null]);
  });
});

describe("defaultNewRolePlacement", () => {
  it("starts on the bottom tier on offer, outside only when none is", () => {
    expect(
      defaultNewRolePlacement([
        { value: "t-chairs", label: "Chairs" },
        { value: "t-members", label: "Members" },
        { value: null, label: "Outside" },
      ]),
    ).toBe("t-members");
    expect(
      defaultNewRolePlacement([{ value: null, label: "Outside" }]),
    ).toBeNull();
    expect(defaultNewRolePlacement([])).toBeNull();
  });
});
