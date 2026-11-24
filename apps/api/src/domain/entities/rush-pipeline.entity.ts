import type {
  RushClosedReason,
  RushContactKind,
  RushStageCategory,
} from '@repo/validation';
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

/** A contact a member logged with a candidate (#5934). */
export interface RushCandidateContact {
  id: string;
  candidate_id: string;
  chapter_id: string;
  logged_by: string;
  kind: RushContactKind;
  /** `YYYY-MM-DD`: the day of the contact, which the member picks. */
  contacted_on: string;
  note: string | null;
  created_at: string;
}

/** A contact as a reader sees it, with who logged it by current name. */
export interface RushContactView {
  id: string;
  candidate_id: string;
  logged_by: string;
  logged_by_name: string;
  kind: RushContactKind;
  contacted_on: string;
  /**
   * Left out for a reader without `rush:read_notes`, and on a candidate
   * linked to the reader, as notes are.
   */
  note?: string | null;
  created_at: string;
}

/** `rush_settings`: one row per chapter, written on its first save. */
export interface RushSettingsRow {
  chapter_id: string;
  stale_days: number;
  /** The role an accepted PNM's invite carries; null means the default. */
  new_member_role_id: string | null;
  /** The recruitment contacts Group (#5973). */
  contacts_group_id: string | null;
  /** Where an interest-form submission's card is posted; null posts none. */
  card_channel_id: string | null;
  updated_at: string;
}

/** What a settings save changes; a field left out keeps its value. */
export interface RushSettingsPatch {
  stale_days?: number;
  new_member_role_id?: string | null;
  contacts_group_id?: string | null;
  card_channel_id?: string | null;
}

/** A member of the contacts Group who can't open recruitment. */
export interface RushSettingsSkippedMember {
  user_id: string;
  display_name: string;
}

/** A chapter's recruitment settings, defaults filled in. */
export interface RushSettings {
  stale_days: number;
  /** The role picked on the settings page, or null for the default. */
  new_member_role_id: string | null;
  /**
   * The default: the first role in the chapter's New members tier, or null
   * when it has no such tier or the tier holds no role.
   */
  default_new_member_role_id: string | null;
  contacts_group_id: string | null;
  /**
   * Members of the contacts Group who lack `rush:view`, and so are skipped
   * when the Group is told. Empty with no Group.
   */
  contacts_group_skipped: RushSettingsSkippedMember[];
  card_channel_id: string | null;
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
  /** The member who is the candidate's main point of contact (#5934). */
  owner_id: string | null;
  owner_name: string | null;
  /** `YYYY-MM-DD` of the newest logged contact, and who logged it. */
  last_contact_on: string | null;
  last_contact_by: string | null;
  last_contact_by_name: string | null;
  /** The one open follow-up: its day, what to do, and who it's for. */
  follow_up_on: string | null;
  follow_up_note: string | null;
  follow_up_user_id: string | null;
  follow_up_user_name: string | null;
}

export interface RushPipeline {
  stages: RushStage[];
  tags: RushTag[];
  candidates: RushPipelineCandidate[];
  /** Days without a logged contact before an open prospect is stale. */
  stale_days: number;
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
