import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TieredRole } from "@repo/hooks/role-tiers";

/**
 * Move up and Move down on a role (#6029): a role steps only within the list
 * the overview draws it in, and a tie on `display_order` still moves.
 */

const updateRole = vi.fn();
vi.mock("@repo/hooks", () => ({
  useUpdateRole: () => ({ mutateAsync: updateRole, isPending: false }),
}));

import { useStepRole } from "@/components/roles/use-step-role";

const TIERS = [{ id: "t1" }, { id: "t2" }];

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

function stepper(roles: TieredRole[]) {
  return renderHook(() => useStepRole(roles, TIERS)).result.current;
}

beforeEach(() => {
  updateRole.mockReset().mockResolvedValue({});
});

describe("useStepRole", () => {
  it("swaps a role with its neighbour in its tier", async () => {
    const a = role("a", 1, { tier_id: "t1" });
    const b = role("b", 2, { tier_id: "t1" });
    const step = stepper([a, b, role("other", 0, { tier_id: "t2" })]);
    expect(step.canStep(b, -1)).toBe(true);
    expect(step.canStep(b, 1)).toBe(false);
    await step.step(b, -1);
    expect(updateRole.mock.calls).toEqual([
      [{ id: "b", body: { display_order: 1 } }],
      [{ id: "a", body: { display_order: 2 } }],
    ]);
  });

  it("never steps a role into another tier", () => {
    const a = role("a", 5, { tier_id: "t1" });
    const step = stepper([a, role("b", 1, { tier_id: "t2" })]);
    expect(step.canStep(a, -1)).toBe(false);
    expect(step.canStep(a, 1)).toBe(false);
  });

  it("keeps Non-chapter business apart from the other roles outside the tiers", async () => {
    const pick = role("pick", 0, { self_assignable: true });
    const alum = role("alum", 1);
    const advisor = role("advisor", 2);
    const step = stepper([pick, alum, advisor]);
    // Alumni leads the roles outside the tiers, though `pick` sorts first.
    expect(step.canStep(alum, -1)).toBe(false);
    expect(step.canStep(pick, 1)).toBe(false);
    expect(step.canStep(pick, -1)).toBe(false);
    await step.step(alum, -1);
    expect(updateRole).not.toHaveBeenCalled();
    await step.step(advisor, -1);
    expect(updateRole.mock.calls).toEqual([
      [{ id: "advisor", body: { display_order: 1 } }],
      [{ id: "alum", body: { display_order: 2 } }],
    ]);
  });

  it("counts a role naming a missing tier as outside the tiers", async () => {
    const stray = role("stray", 1, { tier_id: "t-gone" });
    const alum = role("alum", 2);
    const tiered = role("tiered", 0, { tier_id: "t1" });
    const step = stepper([stray, alum, tiered]);
    expect(step.canStep(alum, -1)).toBe(true);
    await step.step(alum, -1);
    expect(updateRole.mock.calls).toEqual([
      [{ id: "alum", body: { display_order: 1 } }],
      [{ id: "stray", body: { display_order: 2 } }],
    ]);
  });

  it("renumbers a list whose roles tie at 0, so Move up moves", async () => {
    const a = role("a", 0, { tier_id: "t1", name: "Alpha" });
    const b = role("b", 0, { tier_id: "t1", name: "Bravo" });
    const c = role("c", 0, { tier_id: "t1", name: "Charlie" });
    const step = stepper([a, b, c]);
    await step.step(b, -1);
    // New order Bravo, Alpha, Charlie numbered 0, 1, 2; Bravo already holds 0.
    expect(updateRole.mock.calls).toEqual([
      [{ id: "a", body: { display_order: 1 } }],
      [{ id: "c", body: { display_order: 2 } }],
    ]);
  });

  it("renumbers a tie on Move down too, writing only the roles that move", async () => {
    const a = role("a", 0, { tier_id: "t1", name: "Alpha" });
    const b = role("b", 1, { tier_id: "t1", name: "Bravo" });
    const c = role("c", 1, { tier_id: "t1", name: "Charlie" });
    const step = stepper([a, b, c]);
    await step.step(b, 1);
    // Alpha, Charlie, Bravo: Alpha keeps 0 and Charlie keeps 1.
    expect(updateRole.mock.calls).toEqual([
      [{ id: "b", body: { display_order: 2 } }],
    ]);
  });
});
