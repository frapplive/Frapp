import type { RushClosedReason, RushStageCategory } from '@repo/validation';
import type { RushBidStatus } from './rush-candidate.entity';

/** A chapter's own stage, in one of the six fixed categories (#5924). */
export interface RushStage {
  id: string;
  chapter_id: string;
  /** What `rush_candidates.stage` holds. Never changes once made. */
  key: string;
  label: string;
  category: RushStageCategory;
  position: number;
  hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface RushTag {
  id: string;
  chapter_id: string;
  label: string;
  created_at: string;
}

export interface RushCandidateTag {
  candidate_id: string;
  tag_id: string;
  chapter_id: string;
  created_at: string;
}

export interface RushCandidateNote {
  id: string;
  candidate_id: string;
  chapter_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface RushCandidateRating {
  candidate_id: string;
  chapter_id: string;
  rater_id: string;
  rating: number;
  created_at: string;
  updated_at: string;
}

/**
 * One candidate as the pipeline shows it. Rating averages and vote counts are
 * left out for a viewer without `rush:view_results`, as on the card (#4084).
 */
export interface RushPipelineCandidate {
  id: string;
  display_name: string;
  user_id: string | null;
  stage: string;
  closed_reason: RushClosedReason | null;
  bid_status: RushBidStatus;
  created_by: string;
  created_by_name: string;
  created_at: string;
  tag_ids: string[];
  rating_average?: number | null;
  rating_count?: number;
  viewer_rating: number | null;
  vote_count?: number;
  viewer_has_voted: boolean;
}

export interface RushPipeline {
  stages: RushStage[];
  tags: RushTag[];
  candidates: RushPipelineCandidate[];
}

/** A note as a reader sees it, with its author's current name. */
export interface RushNoteView {
  id: string;
  candidate_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  updated_at: string;
}
