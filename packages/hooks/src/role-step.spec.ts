import { describe, expect, it } from "vitest";
import { EVERYONE_ROLE_SYSTEM_KEY } from "@repo/validation";
import { planRoleStep } from "./role-step";
import type { TieredRole } from "./role-tiers";

function role(
  id: string,
  display_order: number,
  extra: Partial<TieredRole> = {},
): TieredRole {
  return {
    id,
    name: id,
    color: null,
    permissions: [],
    is_system: false,
    system_key: null,
    display_order,
    mentionable: true,
    tier_id: null,
    permission_overrides: {},
    self_assignable: false,
    ...extra,
  };
}

const TIERS = new Set(["t1", "t2"]);

describe("planRoleStep (#6029)", () => {
  it("swaps the two orders while the list's orders all differ", () => {
    const roles = [
      role("Alpha", 1, { tier_id: "t1" }),
      role("Bravo", 2, { tier_id: "t1" }),
      role("Charlie", 5, { tier_id: "t1" }),
    ];
    expect(planRoleStep(roles, TIERS, roles[2]!, -1)).toEqual([
      { id: "Charlie", display_order: 2 },
      { id: "Bravo", display_order: 5 },
    ]);
    expect(planRoleStep(roles, TIERS, roles[0]!, 1)).toEqual([
      { id: "Alpha", display_order: 2 },
      { id: "Bravo", display_order: 1 },
    ]);
  });

  it("returns null at either end of the list", () => {
    const roles = [
      role("Alpha", 1, { tier_id: "t1" }),
      role("Bravo", 2, { tier_id: "t1" }),
    ];
    expect(planRoleStep(roles, TIERS, roles[0]!, -1)).toBeNull();
    expect(planRoleStep(roles, TIERS, roles[1]!, 1)).toBeNull();
  });

  it("keeps a step inside its own tier", () => {
    const roles = [
      role("Alpha", 1, { tier_id: "t1" }),
      role("Bravo", 2, { tier_id: "t2" }),
    ];
    expect(planRoleStep(roles, TIERS, roles[0]!, 1)).toBeNull();
    expect(planRoleStep(roles, TIERS, roles[1]!, -1)).toBeNull();
  });

  it("keeps outside and Non-chapter business apart", () => {
    const roles = [
      role("Alumni", 1),
      role("Intramurals", 2, { self_assignable: true }),
      role("Advisor", 3),
    ];
    // Advisor's neighbour above is Alumni, not the pickable role between.
    expect(planRoleStep(roles, TIERS, roles[2]!, -1)).toEqual([
      { id: "Advisor", display_order: 1 },
      { id: "Alumni", display_order: 3 },
    ]);
    expect(planRoleStep(roles, TIERS, roles[1]!, -1)).toBeNull();
    expect(planRoleStep(roles, TIERS, roles[1]!, 1)).toBeNull();
  });

  it("reads a role naming a missing tier as outside the tiers", () => {
    const roles = [role("Alumni", 1), role("Orphan", 2, { tier_id: "gone" })];
    expect(planRoleStep(roles, TIERS, roles[1]!, -1)).toEqual([
      { id: "Orphan", display_order: 1 },
      { id: "Alumni", display_order: 2 },
    ]);
  });

  it("skips the Everyone role, and never moves it", () => {
    const everyone = role("Everyone", 2, {
      is_system: true,
      system_key: EVERYONE_ROLE_SYSTEM_KEY,
    });
    const roles = [role("Alumni", 1), everyone, role("Advisor", 3)];
    expect(planRoleStep(roles, TIERS, roles[2]!, -1)).toEqual([
      { id: "Advisor", display_order: 1 },
      { id: "Alumni", display_order: 3 },
    ]);
    expect(planRoleStep(roles, TIERS, everyone, -1)).toBeNull();
    expect(planRoleStep(roles, TIERS, everyone, 1)).toBeNull();
  });

  it("numbers the list afresh when it steps past a tie at 0", () => {
    const roles = [
      role("Alpha", 0, { tier_id: "t1" }),
      role("Bravo", 0, { tier_id: "t1" }),
    ];
    // Bravo above Alpha: Bravo keeps 0, Alpha takes 1.
    expect(planRoleStep(roles, TIERS, roles[1]!, -1)).toEqual([
      { id: "Alpha", display_order: 1 },
    ]);
  });

  it("numbers the list afresh for a tie one place further", () => {
    const roles = [
      role("Bravo", 1, { tier_id: "t1" }),
      role("Charlie", 1, { tier_id: "t1" }),
      role("Alpha", 2, { tier_id: "t1" }),
    ];
    // Bravo, Charlie, Alpha → Bravo, Alpha, Charlie, numbered from 1.
    expect(planRoleStep(roles, TIERS, roles[2]!, -1)).toEqual([
      { id: "Charlie", display_order: 3 },
    ]);
  });
});
