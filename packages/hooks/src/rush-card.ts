import { serverMessageOf, statusOf } from "@repo/api-sdk";
import { rushBidBadge } from "./rush-bids";
import {
  RUSH_BID_STATES,
  can,
  canExtendRushBid,
  type RushBidState,
  moduleRefusalFromServerMessage,
  subscriptionRefusalFromServerMessage,
} from "@repo/validation";

/**
 * The rules a chat rush card applies, shared by web's
 * (`apps/web/components/chat/renderers/rush-card.tsx`) and mobile's
 * (`apps/mobile/components/chat/rush-card.tsx`), as `./task-card` is for the
 * task card. Pure, so both renderers' specs can drive them.
 *
 * The card's message is a creation-time snapshot: its bid is `"none"` and it
 * has no votes at all. So the badge, the tally and the controls come from the
 * live candidate or not at all. Drawing the snapshot would call a candidate
 * with a bid "Open" and one with ten votes "0 votes", and offer Extend bid on
 * a bid already extended.
 */

/** The candidate as `GET /v1/rush/candidates/{id}` returns it, as much as a card reads. */
export interface LiveRushCandidate {
  id: string;
  display_name: string;
  /**
   * `null` when the server left the count out: the viewer lacks
   * `rush:view_results` (#4084). Never read as 0.
   */
  vote_count: number | null;
  viewer_has_voted: boolean;
  bid_extended: boolean;
  /**
   * The bid's full state (#5973), from `bid_state`; an API before it sent
   * only `bid_status`, read as `extended` or `none`.
   */
  bid_state: RushBidState;
}

/**
 * `useRushCandidate`'s data as a `LiveRushCandidate`, or `null` when there is
 * none (loading, a read the hook resolved to no candidate, or a shape without
 * an id, or with a count that isn't a finite number). An absent count is a
 * hidden one (`rush:view_results`), not a malformed read.
 */
export function readLiveRushCandidate(data: unknown): LiveRushCandidate | null {
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.display_name !== "string") {
    return null;
  }
  const counted = r.vote_count !== undefined && r.vote_count !== null;
  if (
    counted &&
    (typeof r.vote_count !== "number" || !Number.isFinite(r.vote_count))
  ) {
    return null;
  }
  return {
    id: r.id,
    display_name: r.display_name,
    vote_count: counted ? (r.vote_count as number) : null,
    viewer_has_voted: r.viewer_has_voted === true,
    bid_extended: r.bid_status === "extended",
    bid_state: (RUSH_BID_STATES as readonly unknown[]).includes(r.bid_state)
      ? (r.bid_state as RushBidState)
      : r.bid_status === "extended"
        ? "extended"
        : "none",
  };
}

/**
 * Whether the viewer may do what `permission` gates, as a rush card judges
 * it: `can` once the viewer's permissions are read, and yes until then
 * (still loading, or that read failed). The server is the gate; this only
 * hides what it would refuse. Every seeded member role holds the member keys
 * (`RUSH_MEMBER_PERMISSIONS`), and a refusal is handled where it lands, so
 * offering a control early costs at most one 403. Waiting would leave a
 * member's card without its tally, Vote and Extend bid for as long as the
 * permissions read kept failing.
 */
function rushCardMay(
  permission: string,
  permissions: readonly string[] | null | undefined,
): boolean {
  return !Array.isArray(permissions) || can(permission, permissions);
}

/**
 * Whether the card should read its candidate. The read needs `members:view`
 * and `rush:view` (#4070), so a viewer known not to hold both isn't asked
 * for: for them it is a guaranteed 403, and the card shows no tally. A 403
 * resolves to no tally anyway (`useRushCandidate`). The reads also answer
 * while Recruitment is off; only the writes are refused then.
 *
 * `permissions` is `useMyPermissions().data?.permissions`: `undefined` until
 * it is read, which this treats as may (`rushCardMay`).
 */
export function canReadCardRushCandidate(
  permissions: readonly string[] | null | undefined,
): boolean {
  return (
    rushCardMay("members:view", permissions) &&
    rushCardMay("rush:view", permissions)
  );
}

/**
 * One control on a rush card, in the order the card draws them. `voted` is a
 * disabled indicator, not an action: there is no unvote, and a repeat vote
 * changes nothing.
 */
export type RushCardControl = "vote" | "voted" | "bid";

/**
 * The controls a rush card offers.
 *
 * - **Nothing until the live candidate is read.** Before it, the card can't
 *   know whether this viewer has voted or the bid is out.
 * - **Nothing while Recruitment is known to be off.** The server refuses both
 *   writes then, and a timeline of cards each saying so would be noise. The
 *   tally stays: the reads still answer.
 * - **Voted** once the viewer has, whatever they hold now: it records what
 *   they did, not something they may do.
 * - **Vote** before that, for a viewer who may (`rush:vote`).
 * - **Extend bid** with no bid out or an expired one, for a viewer who may
 *   (`rush:bid`). Once a bid is out, answered or rescinded the badge says so
 *   and the control goes: the server refuses a repeat (409, #5973).
 *
 * A control the viewer's role can't use is left out, not disabled (#4084):
 * a role without the key has nothing to wait for. `permissions` is read as
 * `canReadCardRushCandidate` reads it.
 */
export function rushCardControls(input: {
  live: LiveRushCandidate | null;
  recruitmentOff: boolean;
  permissions: readonly string[] | null | undefined;
}): RushCardControl[] {
  const { live, recruitmentOff, permissions } = input;
  if (!live || recruitmentOff) return [];
  const controls: RushCardControl[] = [];
  if (live.viewer_has_voted) controls.push("voted");
  else if (rushCardMay("rush:vote", permissions)) controls.push("vote");
  if (
    canExtendRushBid(live.bid_state) &&
    rushCardMay("rush:bid", permissions)
  ) {
    controls.push("bid");
  }
  return controls;
}

/** What a rush card's badge says: where the bid stands, or Open. */
export function rushCardBadgeLabel(live: LiveRushCandidate): string {
  // The card has no recorded-acceptance time, so a waiting bid reads as an
  // extended one there; the pipeline's badge tells the two apart.
  return (
    rushBidBadge({
      bid_state: live.bid_state,
      bid_acceptance_recorded_at: null,
    })?.label ?? "Open"
  );
}

/**
 * The tally line: "1 vote", "3 votes · you voted". Voter names never. For a
 * viewer the count is hidden from (`rush:view_results`, #4084), only their
 * own vote: "You voted", or no line at all.
 */
export function rushCardTally(live: LiveRushCandidate): string | null {
  if (live.vote_count === null) {
    return live.viewer_has_voted ? "You voted" : null;
  }
  const count = live.vote_count === 1 ? "1 vote" : `${live.vote_count} votes`;
  return live.viewer_has_voted ? `${count} · you voted` : count;
}

/** The tally's place when the candidate read failed, rather than answered with no candidate (`isCardReadMiss`). */
export const RUSH_CARD_TALLY_ERROR = "Couldn't load votes";

/**
 * A gate's refusal of a vote or a bid, in a member's words. The module guard's
 * own message is addressed to the officer who can turn Recruitment back on
 * ("Re-enable it in Settings → Modules"), and the subscription guard's may
 * name checkout, so neither is shown as-is. Each names the module as Settings
 * → Modules labels it ("Recruitment", whatever the chapter calls it), because
 * that is the switch the officer turns back on. No plan, price or purchase
 * path: mobile's store answers say the app offers none
 * (`apps/mobile/lib/subscription-refusal.ts`).
 */
export const RUSH_CARD_REFUSAL_COPY = {
  subscription:
    "Your chapter's subscription isn't active, so votes and bids can't be saved. An officer can sort this out for the chapter.",
  recruitmentOff:
    "Recruitment is turned off for your chapter right now, so votes and bids can't be saved. An officer can turn recruitment back on.",
} as const;

/**
 * `RUSH_CARD_REFUSAL_COPY` for a gate's refusal, or `null` for any other
 * failure, which the card relays as the server words it. A 403 alone is not a
 * gate: the routes also 403 a missing `members:view` or `rush:*` key and the
 * `chapter.context.*` family, which recover by themselves.
 */
export function rushCardGateRefusal(error: unknown): string | null {
  if (statusOf(error) !== 403) return null;
  const message = serverMessageOf(error);
  if (subscriptionRefusalFromServerMessage(message)) {
    return RUSH_CARD_REFUSAL_COPY.subscription;
  }
  if (moduleRefusalFromServerMessage(message)?.moduleKey === "rush") {
    return RUSH_CARD_REFUSAL_COPY.recruitmentOff;
  }
  return null;
}
