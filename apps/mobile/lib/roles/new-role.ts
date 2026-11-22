import {
  mayGrant,
  reachesOutside,
  reachesTier,
  type Reach,
  type TierRow,
} from "@repo/hooks/role-tiers";

/** Where a chapter role can go: a tier the officer reaches, or none. */
export interface NewRolePlacement {
  /** `null` is outside the tiers. */
  value: string | null;
  label: string;
}

/**
 * Where an officer may put a new role (#5296): every tier ranked below their
 * own whose permissions they hold, top first, then outside the tiers, which
 * ranks below every tier. These are `POST /v1/roles`' rules for a role sent
 * with no permissions of its own, which takes its tier's
 * (`createAsMember` in the API's `rbac.service.ts`; `spec/behavior/rbac.md`
 * § Rank): "a role can only be created in or moved into a tier ranked below
 * the caller", and "nobody grants a permission they do not hold", with no
 * exemption for the Everyone role's here. So the sheet offers no pick the
 * server refuses. Empty while the caller's rank is unknown, so Chapter
 * settings draws no New role row on a guess.
 */
export function newRolePlacements(
  reach: Reach,
  tiers: readonly TierRow[],
  outsideLabel: string,
): NewRolePlacement[] {
  if (!reach.known) return [];
  const inTiers = [...tiers]
    .sort((a, b) => a.position - b.position)
    .filter(
      (tier) =>
        reachesTier(reach, tier) &&
        tier.permissions.every((permission) => mayGrant(reach, permission)),
    )
    .map((tier) => ({ value: tier.id, label: tier.name }));
  return reachesOutside(reach)
    ? [...inTiers, { value: null, label: outsideLabel }]
    : inTiers;
}

/**
 * Where the sheet starts: the bottom tier on offer, so a role that is only
 * named starts with that tier's permissions, the least trusted the officer
 * can give, as Discord adds a new role at the bottom. Outside the tiers, where
 * a role holds nothing, only when no tier is on offer.
 */
export function defaultNewRolePlacement(
  placements: readonly NewRolePlacement[],
): string | null {
  return placements.filter((p) => p.value !== null).at(-1)?.value ?? null;
}
