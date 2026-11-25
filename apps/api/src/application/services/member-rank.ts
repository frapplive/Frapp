import type { Member } from '#domain/entities/member.entity';
import { canCorrectProfileAt, canReach } from '#domain/utils/role-rank';
import { memberRankIn } from '#domain/utils/rank-context';
import type { RankContext } from './rbac.service';

/**
 * Whether the rank rules (#4071, `spec/behavior/rbac.md` § Rank) let
 * `actorUserId` act on `member`: `'self'` for their own membership,
 * `'out-of-reach'` when `member` is out of reach, `null` when they may.
 * Removal, correction and chat timeouts (#6006) share it, so they never disagree on who ranks where.
 * A `null` context means the self check already answered.
 *
 * `reach` says who is in reach: `'below'`, only members ranked below the
 * caller (removal); `'peer'`, those or a member at the caller's own rank
 * (correction, Paul's go relayed by Shawn, 2026-11-23, #5900;
 * `canCorrectProfileAt`). Neither reaches a member ranked above the caller,
 * though roles and pledge class do since #5903.
 */
export function rankBlock(
  member: Member,
  actorUserId: string,
  context: RankContext | null,
  reach: 'below' | 'peer',
): 'self' | 'out-of-reach' | null {
  if (!context || member.user_id === actorUserId) return 'self';
  if (context.reach.memberId === member.id) return 'self';
  const rank = memberRankIn(context, member);
  const reachable =
    reach === 'peer'
      ? canCorrectProfileAt(context.reach, rank)
      : canReach(context.reach, rank);
  return reachable ? null : 'out-of-reach';
}

/** The rank context, or `null` without a read when `member` is the actor. */
export function rankContextOrSkip(
  member: Member,
  actorUserId: string,
  rankContext: () => Promise<RankContext>,
): Promise<RankContext | null> {
  return member.user_id === actorUserId ? Promise.resolve(null) : rankContext();
}

/**
 * Why `actorUserId` may not time `member` out of chat, or lift their timeout
 * (#6006, `spec/behavior/chat/README.md` § Timeouts), past the route's
 * `members:timeout`: `'self'`, `'wildcard'` when the member holds `*` (the
 * President, whom nobody times out), `'out-of-reach'` unless they rank below
 * the caller, as removal reads it. `null` when they may. The set, the lift
 * and the profile's `viewer_can_timeout` all ask this, so they can't
 * disagree.
 */
export function chatTimeoutBlock(
  member: Member,
  actorUserId: string,
  memberHoldsWildcard: boolean,
  context: RankContext | null,
): 'self' | 'wildcard' | 'out-of-reach' | null {
  if (member.user_id === actorUserId) return 'self';
  if (memberHoldsWildcard) return 'wildcard';
  return rankBlock(member, actorUserId, context, 'below');
}
