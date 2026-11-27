import {
  isWildcardRole,
  mayGrant,
  reachesTier,
  type TierRow,
  type TieredRole,
} from "./role-tiers";

/** The key that lets a role read recruitment notes. */
export const RUSH_READ_NOTES = "rush:read_notes";

/**
 * "Nobody can read recruitment notes yet" (`spec/behavior/rush.md` § Notes),
 * on the Read recruitment notes page of web's and the phone's Recruitment
 * module pages (#6030): for a chapter where no tier and no role holds
 * `rush:read_notes` (the President's `*` doesn't count: it isn't a grant
 * anyone chose), a one-press grant to the top two tiers, as new chapters
 * start. Once anyone else holds it the line goes. Only part of the top two
 * holding it (a grant that half failed) keeps the line, so the press can
 * finish the job.
 *
 * `null` when the line doesn't show. `why` is the reason the press can't be
 * made, or null when it can; `missing` is the tiers it grants to.
 */
export function rushNotesAccess({
  tiers,
  roles,
  tierHolds,
  reach,
  canEditRoles,
  tierPlural,
}: {
  tiers: readonly TierRow[];
  roles: readonly TieredRole[];
  /** The caller's read, so a switch flipped a moment ago counts. */
  tierHolds: (tier: TierRow) => boolean;
  reach: Parameters<typeof reachesTier>[0];
  canEditRoles: boolean;
  /** What the chapter calls tiers ("tiers"). */
  tierPlural: string;
}): {
  line: string;
  action: string;
  why: string | null;
  missing: TierRow[];
} | null {
  const top = [...tiers].sort((a, b) => a.position - b.position).slice(0, 2);
  const heldElsewhere =
    tiers.some((tier) => !top.includes(tier) && tierHolds(tier)) ||
    roles.some(
      (role) =>
        !isWildcardRole(role) && role.permissions.includes(RUSH_READ_NOTES),
    );
  const missing = top.filter((tier) => !tierHolds(tier));
  if (heldElsewhere || (top.length > 0 && missing.length === 0)) return null;
  const partly = missing.length < top.length;
  const why =
    top.length === 0
      ? `Your chapter has no ${tierPlural} yet.`
      : !canEditRoles
        ? "Your role can't change roles."
        : !mayGrant(reach, RUSH_READ_NOTES) ||
            !top.every((tier) => reachesTier(reach, tier))
          ? "Only the President can turn this on."
          : null;
  return {
    line: partly
      ? `Only ${top
          .filter(tierHolds)
          .map((tier) => tier.name)
          .join(" and ")} can read recruitment notes so far.`
      : "Nobody can read recruitment notes yet.",
    action: partly
      ? `Let ${missing.map((tier) => tier.name).join(" and ")} read them too`
      : `Let the top two ${tierPlural} read them`,
    why,
    missing,
  };
}
