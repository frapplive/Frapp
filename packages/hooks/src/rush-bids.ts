import { localIsoDate } from "@repo/formatting";
import {
  RUSH_BID_WAITING_TO_CONFIRM,
  canExtendRushBid,
  formatRushDay,
} from "@repo/validation";
import type { RushPipelineAccess } from "./rush-pipeline";
import type { RushPipelineCandidate } from "./use-rush-pipeline";

/**
 * A prospect's bid in words (#5973, `spec/behavior/ifc-recruitment.md`
 * § Bids), shared by web's board, list and panel and the phone's list and
 * prospect screen, so both apps say the same thing: the badge, the panel's
 * line, and which actions the viewer gets. The rules (which states an action
 * takes) are the API's and `@repo/validation`'s; this only words them.
 */

type BidCandidate = Pick<
  RushPipelineCandidate,
  | "user_id"
  | "bid_state"
  | "bid_extended_at"
  | "bid_extended_by_name"
  | "bid_expires_at"
  | "bid_acceptance_recorded_at"
  | "bid_acceptance_recorded_by_name"
  | "bid_confirm_emailed"
  | "bid_answered_at"
  | "bid_answered_by_name"
  | "bid_answered_via"
  | "bid_rescind_reason"
>;

/** A recorded acceptance still waiting for the PNM or an officer. */
function rushBidWaiting(
  candidate: Pick<BidCandidate, "bid_state" | "bid_acceptance_recorded_at">,
): boolean {
  return (
    candidate.bid_state === "extended" &&
    candidate.bid_acceptance_recorded_at !== null
  );
}

export type RushBidBadge = {
  label: string;
  /** `out`: open; `waiting`: needs confirming; `done`: accepted; `ended`. */
  tone: "out" | "waiting" | "done" | "ended";
};

/**
 * The badge a card or row wears: "Bid extended", "Waiting to confirm",
 * "Accepted", or how an answered bid ended. Nothing before a bid.
 */
export function rushBidBadge(
  candidate: Pick<BidCandidate, "bid_state" | "bid_acceptance_recorded_at">,
): RushBidBadge | null {
  switch (candidate.bid_state) {
    case "extended":
      return rushBidWaiting(candidate)
        ? { label: RUSH_BID_WAITING_TO_CONFIRM, tone: "waiting" }
        : { label: "Bid extended", tone: "out" };
    case "accepted":
      return { label: "Accepted", tone: "done" };
    case "declined":
      return { label: "Declined", tone: "ended" };
    case "expired":
      return { label: "Bid expired", tone: "ended" };
    case "rescinded":
      return { label: "Rescinded", tone: "ended" };
    default:
      return null;
  }
}

/** An ISO time's day on this device, in `formatRushDay`'s words. */
function dayOf(iso: string, today: string): string {
  return formatRushDay(localIsoDate(new Date(iso)), today);
}

function inSentence(day: string): string {
  return day === "Today" || day === "Yesterday" || day === "Tomorrow"
    ? day.toLowerCase()
    : day;
}

/**
 * The prospect's bid as one or two lines, state first (rulebook § 6):
 * - "Bid extended November 24 by Chris" / "Expires December 1"
 * - "Recorded by Chris, waiting to be confirmed" / "Emailed them to confirm.
 *   It expires December 1." (or "No email, so someone who manages
 *   recruitment confirms it.")
 * - "Accepted, confirmed by them November 25" / "by Dana"
 * - "Declined, recorded by Chris", "Rescinded by Dana: Grades came back",
 *   "Bid expired December 1"
 * `null` before a bid.
 */
export function rushBidLines(
  candidate: BidCandidate,
  today: string,
): { title: string; detail: string | null } | null {
  const answered = candidate.bid_answered_at
    ? inSentence(dayOf(candidate.bid_answered_at, today))
    : null;
  const expires = candidate.bid_expires_at
    ? inSentence(dayOf(candidate.bid_expires_at, today))
    : null;
  switch (candidate.bid_state) {
    case "extended": {
      if (rushBidWaiting(candidate)) {
        const by = candidate.bid_acceptance_recorded_by_name;
        return {
          title: by
            ? `Recorded by ${by}, waiting to be confirmed`
            : "Acceptance recorded, waiting to be confirmed",
          detail: candidate.bid_confirm_emailed
            ? `Emailed them to confirm.${expires ? ` It expires ${expires} if nobody does.` : ""}`
            : `No email, so someone who manages recruitment confirms it.${expires ? ` It expires ${expires} otherwise.` : ""}`,
        };
      }
      const sent = candidate.bid_extended_at
        ? inSentence(dayOf(candidate.bid_extended_at, today))
        : null;
      const by = candidate.bid_extended_by_name;
      return {
        title: `Bid extended${sent ? ` ${sent}` : ""}${by ? ` by ${by}` : ""}`,
        detail: expires ? `Expires ${expires}` : null,
      };
    }
    case "accepted": {
      const who =
        candidate.bid_answered_via === "pnm"
          ? "by them"
          : candidate.bid_answered_by_name
            ? `by ${candidate.bid_answered_by_name}`
            : null;
      return {
        title: `Accepted${who ? `, confirmed ${who}` : ""}${answered ? ` ${answered}` : ""}`,
        detail: null,
      };
    }
    case "declined":
      return {
        title: `Declined${candidate.bid_answered_by_name ? `, recorded by ${candidate.bid_answered_by_name}` : ""}${answered ? ` ${answered}` : ""}`,
        detail: null,
      };
    case "rescinded":
      return {
        title: `Rescinded${candidate.bid_answered_by_name ? ` by ${candidate.bid_answered_by_name}` : ""}${answered ? ` ${answered}` : ""}`,
        detail: candidate.bid_rescind_reason,
      };
    case "expired":
      return {
        title: `Bid expired${answered ? ` ${answered}` : ""}`,
        detail: null,
      };
    default:
      return null;
  }
}

/** The bid actions a viewer gets on a prospect, in the order they show. */
export interface RushBidActions {
  /** Extend (`rush:bid`), from no bid or an expired one. */
  extend: boolean;
  /** Record an acceptance or a decline (`rush:bid`), on an open bid. */
  recordAcceptance: boolean;
  recordDecline: boolean;
  /** Confirm a recorded acceptance (`rush:manage`). */
  confirm: boolean;
  /** Take back an open bid (`rush:manage`). */
  rescind: boolean;
}

/**
 * Which bid actions to offer. Nobody acts on a bid to themself, and nothing is
 * offered on an expired open bid the hourly sweep hasn't reached yet.
 */
export function rushBidActions(
  candidate: Pick<
    BidCandidate,
    "user_id" | "bid_state" | "bid_acceptance_recorded_at" | "bid_expires_at"
  >,
  access: Pick<RushPipelineAccess, "bid" | "manage">,
  viewerId: string | null,
  now: Date = new Date(),
): RushBidActions {
  const self = viewerId !== null && candidate.user_id === viewerId;
  const open =
    candidate.bid_state === "extended" &&
    (candidate.bid_expires_at === null ||
      new Date(candidate.bid_expires_at) > now);
  const waiting = open && candidate.bid_acceptance_recorded_at !== null;
  const may = (allowed: boolean) => allowed && !self;
  return {
    extend: may(access.bid) && canExtendRushBid(candidate.bid_state),
    recordAcceptance: may(access.bid) && open && !waiting,
    recordDecline: may(access.bid) && open,
    confirm: may(access.manage) && waiting,
    rescind: may(access.manage) && open,
  };
}

/** Words both apps use for the bid actions and their dialogs. */
export const RUSH_BID_WORDS = {
  extend: "Extend bid",
  recordAcceptance: "Record acceptance",
  recordDecline: "Record decline",
  confirm: "Confirm acceptance",
  rescind: "Rescind bid",
  acceptanceTitle: "Record their acceptance",
  acceptanceEmailLabel: "Their email",
  acceptanceEmailHint:
    "Frapp emails them a link to confirm with one tap. Only Frapp sees it.",
  acceptanceLinkedHint: "Leave it empty to use their Frapp account's email.",
  rescindTitle: "Rescind the bid",
  rescindReasonLabel: "Why",
} as const;
