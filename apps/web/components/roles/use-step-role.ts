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
export function useStepRole(roles: readonly TieredRole[]) {
  const updateRole = useUpdateRole();

  function siblings(role: TieredRole): TieredRole[] {
    return roles
      .filter(
        (candidate) => (candidate.tier_id ?? null) === (role.tier_id ?? null),
      )
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
    const mine = role.display_order;
    const theirs = neighbour.display_order;
    // Two roles added at once can share an order, and swapping would leave
    // them where they were: step past the neighbour instead.
    const next = mine === theirs ? Math.max(0, theirs + by) : theirs;
    await updateRole.mutateAsync({
      id: role.id,
      body: { display_order: next },
    });
    if (mine !== theirs) {
      await updateRole.mutateAsync({
        id: neighbour.id,
        body: { display_order: mine },
      });
    }
  }

  return { canStep, step, pending: updateRole.isPending };
}
