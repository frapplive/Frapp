import {
  reachesOutside,
  reachesTier,
  type Reach,
  type TierRow,
} from "@repo/hooks/role-tiers";
import type { NewRolePlacement } from "@/components/roles/new-role-sheet";

/**
 * Where an officer may put a new role (#5296): every tier ranked below their
 * own, top first, then outside the tiers, which ranks below every tier. The
 * API's rule for a new role (`spec/behavior/rbac.md` § Rank: "a role can only
 * be created in or moved into a tier ranked below the caller"), so the sheet
 * never offers a pick the server refuses. Empty while the caller's rank is
 * unknown, so Chapter settings draws no New role row on a guess.
 */
export function newRolePlacements(
  reach: Reach,
  tiers: readonly TierRow[],
  outsideLabel: string,
): NewRolePlacement[] {
  if (!reach.known) return [];
  const inTiers = [...tiers]
    .sort((a, b) => a.position - b.position)
    .filter((tier) => reachesTier(reach, tier))
    .map((tier) => ({ value: tier.id, label: tier.name }));
  return reachesOutside(reach)
    ? [...inTiers, { value: null, label: outsideLabel }]
    : inTiers;
}
