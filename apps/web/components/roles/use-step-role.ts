"use client";

import { useUpdateRole } from "@repo/hooks";
import { byDisplayOrder, type TieredRole } from "@repo/hooks/role-tiers";

/**
 * Move a role one place up or down its own list (its tier, or outside the
 * tiers): Move up and Move down in the role row's ⋯ and the role page's ⋯
 * (#6029), which replaced the role page's "Position in its list" number box.
 * The role takes its neighbour's place and the neighbour takes its, the
 * way the tier list's Move up and Move down already worked.
 */
export function useStepRole(
  roles: readonly TieredRole[],
  tiers: readonly { id: string }[],
) {
  const updateRole = useUpdateRole();

  // The list a role sits in, as the overview draws it: its tier, or, when
  // it has none or names a tier this chapter doesn't have, outside the
  // tiers, where the roles members pick themselves (Non-chapter business)
  // are a list of their own.
  function listOf(role: TieredRole): string {
    const tierIds = new Set(tiers.map((tier) => tier.id));
    if (role.tier_id && tierIds.has(role.tier_id)) return `tier:${role.tier_id}`;
    return role.self_assignable ? "pickable" : "outside";
  }

  function siblings(role: TieredRole): TieredRole[] {
    const key = listOf(role);
    return roles
      .filter((candidate) => listOf(candidate) === key)
      .sort(byDisplayOrder);
  }

  function canStep(role: TieredRole, by: -1 | 1): boolean {
    const list = siblings(role);
    const index = list.findIndex((candidate) => candidate.id === role.id);
    return index >= 0 && !!list[index + by];
  }

  async function step(role: TieredRole, by: -1 | 1): Promise<void> {
    const list = siblings(role);
    const index = list.findIndex((candidate) => candidate.id === role.id);
    const neighbour = list[index + by];
    if (index < 0 || !neighbour) return;
    if (role.display_order !== neighbour.display_order) {
      await updateRole.mutateAsync({
        id: role.id,
        body: { display_order: neighbour.display_order },
      });
      await updateRole.mutateAsync({
        id: neighbour.id,
        body: { display_order: role.display_order },
      });
      return;
    }
    // Two roles added at once can share an order, and a swap would leave
    // them where they were (a tie at 0 can't step below it either): number
    // the list afresh in its new order, writing only the roles that move.
    const reordered = [...list];
    reordered[index] = neighbour;
    reordered[index + by] = role;
    for (const [position, candidate] of reordered.entries()) {
      if (candidate.display_order === position) continue;
      await updateRole.mutateAsync({
        id: candidate.id,
        body: { display_order: position },
      });
    }
  }

  return { canStep, step, pending: updateRole.isPending };
}
