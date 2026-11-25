import type { RushBidState, RushClosedReason } from '@repo/validation';

/**
 * The two-value bid status shipped clients read (`ifc-recruitment.md`
 * § Compatibility with shipped clients); {@link RushBidState} is the whole.
 */
export type RushBidStatus = 'none' | 'extended';

export type { RushBidState };

export interface RushCandidate {
  id: string;
  chapter_id: string;
  display_name: string;
  name_key: string;
  user_id: string | null;
  stage: string;
  /** Why the candidate is in a Closed stage; null in any other (#5924). */
  closed_reason: RushClosedReason | null;
  bid_status: RushBidStatus;
  /** The bid's full state (#5973); `bid_status` is its shipped-client view. */
  bid_state: RushBidState;
  created_by: string;
  created_at: string;
}

/**
 * The columns the pipeline works a candidate with (#5934): its owner, its
 * last logged contact and its one open follow-up. Kept apart from
 * {@link RushCandidate} because the chat card and the candidate routes
 * spread a candidate into their responses, and none of this belongs on a
 * card in a channel. Only the pipeline reads them.
 */
export interface RushCandidateWork {
  owner_id: string | null;
  /** `YYYY-MM-DD`: the newest logged contact's day. */
  last_contact_on: string | null;
  last_contact_by: string | null;
  /** `YYYY-MM-DD`: the day the follow-up comes due. */
  follow_up_on: string | null;
  follow_up_note: string | null;
  follow_up_user_id: string | null;
  /** When the open bid went out, who extended it, and when it expires. */
  bid_extended_at: string | null;
  bid_extended_by: string | null;
  bid_expires_at: string | null;
  /** A recorded acceptance waiting for confirmation (#4218). */
  bid_acceptance_recorded_at: string | null;
  bid_acceptance_recorded_by: string | null;
  /** When and by whom the bid was answered or closed. */
  bid_answered_at: string | null;
  bid_answered_by: string | null;
  /** `member`, the PNM by the emailed link, or the expiry sweep. */
  bid_answered_via: RushBidAnsweredVia | null;
  bid_rescind_reason: string | null;
  /** On an accepted bid: whether the PNM's invite went out. */
  bid_invite_sent: boolean | null;
}

/**
 * The school layer's columns (#5974, `school-layer.md` § 2.5): the PNM a
 * prospect is. Kept off {@link RushCandidate} so the rush DTOs' drift
 * guards don't make that slice change the rush contract. The rush
 * repository reads `*`, so its rows carry them undocumented; every row is
 * `pnm_id` null and `origin` `manual` until the form slice links
 * candidates, and that slice documents them on the rush routes or stops
 * sending them.
 */
export interface RushCandidatePnmLink {
  /** The school-level PNM this prospect is, or null for a hand-added one. */
  pnm_id: string | null;
  /** `manual` (a member added them) or `pnm`; never changes. */
  origin: 'manual' | 'pnm';
}

export type RushBidAnsweredVia = 'member' | 'pnm' | 'system';

/** A `rush_candidates` row as the pipeline works it. */
export type RushCandidateRow = RushCandidate & RushCandidateWork;

/** A whole `rush_candidates` row, as the table holds it (`database.types.ts`). */
export type RushCandidateTableRow = RushCandidateRow & RushCandidatePnmLink;

export interface RushCandidateVote {
  id: string;
  candidate_id: string;
  chapter_id: string;
  voter_id: string;
  created_at: string;
}

/**
 * Live card projection. `vote_count` and `viewer_has_voted` are the only
 * ballot fields the card may show — voter names stay off the wire.
 * `vote_count` is left out for a viewer without `rush:view_results` (#4084).
 */
export interface RushCandidateView extends RushCandidate {
  vote_count?: number;
  viewer_has_voted: boolean;
}
