import type { RushClosedReason } from '@repo/validation';

export type RushBidStatus = 'none' | 'extended';

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
  /**
   * The member who added the prospect by hand. Null only for a candidate a
   * PNM's own interest form created (`origin` `pnm`, #5977).
   */
  created_by: string | null;
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
 * `vote_count` is left out for a viewer without `rush:view_results` (#4084).
 */
export interface RushCandidateView extends RushCandidate {
  vote_count?: number;
  viewer_has_voted: boolean;
}

/**
 * The `rush_candidates` row as the table holds it (`database.types.ts`):
 * the candidate plus the school layer's columns (#5974, `school-layer.md`
 * § 2.5). Kept off {@link RushCandidate} so the rush DTOs' drift guards
 * don't change the rush contract. The rush repository reads `*`, so its rows
 * carry the two columns; the interest form (#5977) creates `pnm` rows, and
 * the pipeline's candidate DTO documents `origin`.
 */
export interface RushCandidateRow extends RushCandidate {
  /** The school-level PNM this prospect is, or null for a hand-added one. */
  pnm_id: string | null;
  /** `manual` (a member added them) or `pnm`; never changes. */
  origin: 'manual' | 'pnm';
}
