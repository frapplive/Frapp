/**
 * PNM records (`school-layer.md` § 2.5, `ifc-recruitment.md` § The council
 * master list; `20261124205834_school_layer_affiliations_and_pnms.sql`,
 * #5974). Every table is RLS on with no policies, reached only through the
 * service-role client.
 */

export type PnmSource =
  'interest_form' | 'council_registration' | 'council_import';

/** A row of `pnms`: one person at one school. */
export interface Pnm {
  id: string;
  school_id: string;
  user_id: string | null;
  school_email: string;
  /** Null for an imported row the person hasn't verified: it reaches no chapter. */
  email_verified_at: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  class_year: number | null;
  phone: string | null;
  phone_shared: boolean;
  merged_into_id: string | null;
  created_via: PnmSource;
  created_at: string;
  updated_at: string;
}

export type RecruitmentSeasonStatus = 'planned' | 'open' | 'closed';

/** A row of `council_recruitment_seasons`. */
export interface CouncilRecruitmentSeason {
  council_id: string;
  term: string;
  opens_at: string;
  closes_at: string;
  bid_window_opens_at: string | null;
  bid_window_closes_at: string | null;
  status: RecruitmentSeasonStatus;
  /** N in "season close plus N days" for PNM records (default 180, at most 180). */
  pnm_retention_days: number;
  created_at: string;
  updated_at: string;
}

export type PnmRegistrationStatus = 'registered' | 'withdrawn' | 'released';

/** A row of `pnm_council_registrations`: a PNM on a council's master list. */
export interface PnmCouncilRegistration {
  id: string;
  pnm_id: string;
  council_id: string;
  term: string;
  status: PnmRegistrationStatus;
  created_at: string;
}

/** A row of `pnm_interests`: a PNM's own interest in one chapter (D7). */
export interface PnmInterest {
  id: string;
  pnm_id: string;
  chapter_id: string;
  registration_id: string | null;
  source: PnmSource;
  source_label: string | null;
  created_at: string;
  withdrawn_at: string | null;
}

/** A row of `pnm_merges`: who merged two records and what each held. */
export interface PnmMerge {
  id: number;
  council_id: string;
  survivor_id: string;
  loser_id: string;
  actor_user_id: string | null;
  survivor_before: Record<string, unknown>;
  loser_before: Record<string, unknown>;
  at: string;
}

/** A row of `pnm_duplicate_dismissals`: "not the same person". `pnm_a < pnm_b`. */
export interface PnmDuplicateDismissal {
  council_id: string;
  pnm_a: string;
  pnm_b: string;
  dismissed_by: string | null;
  created_at: string;
}

/** A row of `council_pnm_access_log`: one council read of a PNM record. */
export interface CouncilPnmAccessLogRow {
  id: number;
  council_id: string;
  actor_user_id: string | null;
  pnm_id: string | null;
  fields: string[];
  at: string;
}

/** What `merge_pnms` refuses with. */
export type PnmMergeRefusal =
  'same_record' | 'not_found' | 'already_merged' | 'two_accounts';

export type PnmMergeResult =
  | { ok: true; survivor_id: string; candidate_conflicts: number }
  | { ok: false; reason: PnmMergeRefusal };
