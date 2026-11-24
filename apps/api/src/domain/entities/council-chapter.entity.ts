/**
 * A chapter's link to its school's council (`school-layer.md` § 2.4,
 * `20261124082248_school_layer_affiliations_and_pnms.sql`, #5974). Both
 * sides agree; only `set_council_chapter_status` writes one.
 */

export type CouncilChapterStatus =
  'proposed' | 'accepted' | 'declined' | 'suspended' | 'ended';

export type AffiliationSide = 'council' | 'chapter';

/** A row of `council_chapters`. */
export interface CouncilChapter {
  id: string;
  council_id: string;
  chapter_id: string;
  status: CouncilChapterStatus;
  proposed_by_side: AffiliationSide;
  proposed_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

/** What `set_council_chapter_status` and `set_school_chapter_status` refuse with. */
export type AffiliationRefusal =
  | 'not_found'
  | 'wrong_kind'
  | 'no_shared_school'
  | 'exists'
  | 'invalid_transition';

/** `set_council_chapter_status`'s answer. */
export type CouncilChapterStatusResult =
  | { ok: true; link: CouncilChapter }
  | { ok: false; reason: AffiliationRefusal; link?: CouncilChapter };
