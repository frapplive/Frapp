import type {
  RushBidAnsweredVia,
  RushBidState,
  RushCandidateRow,
} from '../entities/rush-candidate.entity';

export const RUSH_BID_REPOSITORY = 'RUSH_BID_REPOSITORY';

/** A recorded acceptance's pending confirmation (`rush_bid_confirmations`). */
export interface RushBidConfirmation {
  candidate_id: string;
  chapter_id: string;
  /** The PNM's address. Never returned to a member. */
  email: string | null;
  token_hash: string | null;
  /** When the one-tap email went out; null while unsent or failed. */
  emailed_at: string | null;
  created_at: string;
}

/**
 * One bid transition: which states it starts from and what it writes. A
 * compare-and-set, so two members acting at once can't both win; `null` when
 * the bid wasn't in a `from` state (or its expiry had passed, where `open`).
 */
export interface RushBidTransition {
  from: readonly RushBidState[];
  /** Only while the bid hasn't expired, by `now`. */
  open?: boolean;
  /** Only with (`true`) or without (`false`) a recorded acceptance. */
  recorded?: boolean;
  now: string;
  set: {
    bid_state?: RushBidState;
    bid_extended_at?: string | null;
    bid_extended_by?: string | null;
    bid_expires_at?: string | null;
    bid_acceptance_recorded_at?: string | null;
    bid_acceptance_recorded_by?: string | null;
    bid_answered_at?: string | null;
    bid_answered_by?: string | null;
    bid_answered_via?: RushBidAnsweredVia | null;
    bid_rescind_reason?: string | null;
    bid_invite_sent?: boolean | null;
  };
}

/** The bid columns of `rush_candidates` and the pending confirmations (#5973). */
export interface IRushBidRepository {
  /**
   * Applies `transition` to the candidate, writing `bid_status` alongside
   * `bid_state` for shipped clients. The row after, or null when it lost.
   */
  transition(
    candidateId: string,
    chapterId: string,
    transition: RushBidTransition,
  ): Promise<RushCandidateRow | null>;
  /** Replaces the candidate's pending confirmation. */
  saveConfirmation(row: {
    candidateId: string;
    chapterId: string;
    email: string | null;
    tokenHash: string | null;
  }): Promise<void>;
  findConfirmation(
    candidateId: string,
    chapterId: string,
  ): Promise<RushBidConfirmation | null>;
  findConfirmationByTokenHash(
    tokenHash: string,
  ): Promise<RushBidConfirmation | null>;
  deleteConfirmation(candidateId: string, chapterId: string): Promise<void>;
  /** Marks the confirmation's email sent, so the panel can say it was. */
  markConfirmationEmailed(
    candidateId: string,
    chapterId: string,
    at: string,
  ): Promise<void>;
  /** Records whether an accepted bid's invite went out; the row after. */
  setInviteSent(
    candidateId: string,
    chapterId: string,
    sent: boolean,
  ): Promise<RushCandidateRow | null>;
  /** The chapter's candidates whose confirmation email went out. */
  candidatesWithConfirmationEmail(chapterId: string): Promise<Set<string>>;
}
