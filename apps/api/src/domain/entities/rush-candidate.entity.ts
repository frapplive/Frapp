export type RushBidStatus = 'none' | 'extended';

export interface RushCandidate {
  id: string;
  chapter_id: string;
  display_name: string;
  name_key: string;
  user_id: string | null;
  stage: string;
  bid_status: RushBidStatus;
  created_by: string;
  created_at: string;
}

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
 */
export interface RushCandidateView extends RushCandidate {
  vote_count: number;
  viewer_has_voted: boolean;
}

/**
 * The `rush_candidates` row as the table holds it (`database.types.ts`):
 * the candidate plus the school layer's columns (#5974, `school-layer.md`
 * § 2.5). Kept off {@link RushCandidate} so the rush routes' contract, which
 * doesn't serve them yet, is unchanged.
 */
export interface RushCandidateRow extends RushCandidate {
  /** The school-level PNM this prospect is, or null for a hand-added one. */
  pnm_id: string | null;
  /** `manual` (a member added them) or `pnm`; never changes. */
  origin: 'manual' | 'pnm';
}
