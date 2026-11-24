/**
 * Rank among a chapter's roles and tiers (#4071), and the rules that use it.
 *
 * A **rank** is a number where lower ranks higher, read from the chapter's
 * own tiers: a role's rank is its tier's `position`. A role outside the tiers
 * ranks below every tier ({@link OUTSIDE_TIERS_RANK}). A role carrying the
 * wildcard ranks above everything ({@link WILDCARD_RANK}) wherever it sits,
 * because `*` moves only through Transfer presidency. A member's rank is the
 * highest of their roles'.
 *
 * Nothing here reads a tier's name or assumes how many tiers a chapter has:
 * positions come from the chapter's rows, so a chapter that renames, adds or
 * reorders its tiers moves the ranks with them.
 */
import { SystemPermissions, WILDCARD } from '#domain/constants/permissions';

/** The rank of a role carrying `*`: above every tier. */
export const WILDCARD_RANK = 0;

/** The rank of a role outside the tiers, or of a member holding none. */
export const OUTSIDE_TIERS_RANK = Number.POSITIVE_INFINITY;

type RankedRole = {
  tier_id: string | null;
  permissions: readonly string[] | null;
};

type PositionedTier = { id: string; position: number };

/** Each tier's position by id, for {@link roleRank}. */
export function tierPositions(
  tiers: readonly PositionedTier[],
): ReadonlyMap<string, number> {
  return new Map(tiers.map((tier) => [tier.id, tier.position]));
}

/**
 * A role's rank. A `tier_id` that names no tier of the chapter (a stale read)
 * counts as outside the tiers, which only ever ranks a role lower.
 */
export function roleRank(
  role: RankedRole,
  positions: ReadonlyMap<string, number>,
): number {
  if (role.permissions?.includes(WILDCARD)) return WILDCARD_RANK;
  if (role.tier_id === null) return OUTSIDE_TIERS_RANK;
  return positions.get(role.tier_id) ?? OUTSIDE_TIERS_RANK;
}

/** A holder's rank: the highest of their roles', or outside when they hold none. */
export function holderRank(
  roles: readonly RankedRole[],
  positions: ReadonlyMap<string, number>,
): number {
  let best = OUTSIDE_TIERS_RANK;
  for (const role of roles) best = Math.min(best, roleRank(role, positions));
  return best;
}

/**
 * Whether rank `a` is at or above rank `b`: "is A's highest tier at or above
 * B's" (#3985-style reach rules). Two holders outside the tiers are level.
 */
export function ranksAtOrAbove(a: number, b: number): boolean {
  return a <= b;
}

/**
 * Who is acting, for the rank rules: what they hold and how high they rank.
 * Built by `RbacService.getRankContext` from one read of the chapter's roles
 * and tiers.
 */
export interface ActorReach {
  /** The member's own id in the chapter, or `null` when they have no membership. */
  memberId: string | null;
  rank: number;
  permissions: ReadonlySet<string>;
  /**
   * Holds `*`: exempt from every rank rule, as the President is. Presidency
   * itself still moves only through Transfer presidency.
   */
  wildcard: boolean;
}

/**
 * Whether the actor may edit, delete, assign or take away something at
 * `targetRank`: only what ranks strictly below them. Nobody edits a role or
 * tier ranked at or above their own, so a chair cannot edit the chairs' tier
 * or their own role, and an exec officer cannot edit the President's.
 */
export function canReach(actor: ActorReach, targetRank: number): boolean {
  return actor.wildcard || !ranksAtOrAbove(targetRank, actor.rank);
}

/**
 * Whether the actor may give or take away a role at `targetRank` on a member
 * at or below their own rank (on a member ranked above them, it is
 * {@link canAssignRoleOnMemberAt}'s): what {@link canReach} allows, plus
 * their own rank when they hold `roles:assign_own_level` (Paul, 2026-11-20,
 * #5725). A chapter turns that on for its cabinet so one officer can make
 * another Stewardship Chair. A caller outside the tiers reaches nothing
 * either way.
 */
export function canAssignAt(actor: ActorReach, targetRank: number): boolean {
  if (canReach(actor, targetRank)) return true;
  return (
    actor.permissions.has(SystemPermissions.ROLES_ASSIGN_OWN_LEVEL) &&
    Number.isFinite(actor.rank) &&
    targetRank === actor.rank
  );
}

/**
 * Whether the actor may give or take away a role at `roleRank` on another
 * member at `memberRank`. Each edit on a member keeps its own rule, so
 * widening one never widens another:
 *
 * - roles (this one): on a member below the caller or at their own rank,
 *   {@link canAssignAt} (a peer since #5843). On a member ranked above them,
 *   the President included, only roles ranked strictly below the caller
 *   ({@link canReach}), never their own rank even with
 *   `roles:assign_own_level` (Paul's option 3, relayed by Shawn, 2026-11-23,
 *   #5903), so an officer can put the President on a committee and never
 *   touch a role at or above their own. A base-role swap the save makes
 *   takes a role away, so it is checked here like any other;
 * - pledge class and order number: {@link canSetPledgeClassOf};
 * - name and graduation year: {@link canCorrectProfileAt};
 * - removal: {@link canReach}.
 *
 * A caller outside the tiers reaches no other member. The `*` role never
 * moves here at all: `MemberService.updateRoles` refuses it before this runs.
 */
export function canAssignRoleOnMemberAt(
  actor: ActorReach,
  roleRank: number,
  memberRank: number,
): boolean {
  if (actor.wildcard) return true;
  if (!Number.isFinite(actor.rank)) return false;
  return ranksAtOrAbove(actor.rank, memberRank)
    ? canAssignAt(actor, roleRank)
    : canReach(actor, roleRank);
}

/**
 * Whether the actor may fix the name and graduation year of a member at
 * `memberRank` (`MemberService.correctProfile` and the profile read's
 * `viewer_can_edit_profile`): one ranked below them or at their own rank
 * (#5900), never above, so an officer cannot rename the President (#5903
 * kept this). A caller outside the tiers reaches no other member.
 */
export function canCorrectProfileAt(
  actor: ActorReach,
  memberRank: number,
): boolean {
  if (actor.wildcard) return true;
  return Number.isFinite(actor.rank) && ranksAtOrAbove(actor.rank, memberRank);
}

/**
 * Whether the actor may set another member's pledge class and order number
 * (`PledgeClassService`): any member, the President included (Paul's option
 * 3, relayed by Shawn, 2026-11-23, #5903), since those are chapter records
 * an officer keeps, not the member's standing. A caller outside the tiers
 * reaches no other member.
 */
export function canSetPledgeClassOf(actor: ActorReach): boolean {
  return actor.wildcard || Number.isFinite(actor.rank);
}

/**
 * The permissions in `granted` the actor does not hold. Nobody grants a
 * permission they do not hold; a wildcard holder holds them all.
 */
export function permissionsNotHeld(
  actor: ActorReach,
  granted: Iterable<string>,
): string[] {
  if (actor.wildcard) return [];
  return [...new Set(granted)]
    .filter((permission) => !actor.permissions.has(permission))
    .sort();
}

/**
 * A role's effective permissions: its tier's, plus overrides that are `true`,
 * minus overrides that are `false`; sorted and distinct. The same rule as the
 * database's `role_effective_permissions` (migration `20261111140000`), which
 * is what actually writes `roles.permissions`; this copy only predicts the
 * result so the rank rules can check it before the write.
 */
export function effectivePermissions(
  tierPermissions: readonly string[],
  overrides: Readonly<Record<string, boolean>>,
): string[] {
  const result = new Set(tierPermissions);
  for (const [permission, on] of Object.entries(overrides)) {
    if (on === true) result.add(permission);
  }
  for (const [permission, on] of Object.entries(overrides)) {
    if (on === false) result.delete(permission);
  }
  return [...result].sort();
}

/** What `after` holds that `before` does not, sorted. */
export function addedPermissions(
  before: readonly string[],
  after: readonly string[],
): string[] {
  const was = new Set(before);
  return [...new Set(after)].filter((p) => !was.has(p)).sort();
}
