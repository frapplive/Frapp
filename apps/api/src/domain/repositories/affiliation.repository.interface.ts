import type {
  AffiliationRefusal,
  AffiliationSide,
  CouncilChapter,
  CouncilChapterStatus,
  CouncilChapterStatusResult,
} from '../entities/council-chapter.entity';
import type {
  SchoolChapter,
  SchoolChapterStatus,
} from '../entities/school.entity';
import type { CouncilType, RecruitmentModel } from '@repo/validation';

export const AFFILIATION_REPOSITORY = 'AFFILIATION_REPOSITORY';

/**
 * The public face of a tenant another tenant may see once they're linked, or
 * that a school's listing shows (`school-layer.md` § 2.4: "no listing beyond
 * what the chapter's public school listing shows"). Never a member, a role or
 * any chapter data.
 */
export interface TenantListing {
  id: string;
  name: string;
  kind: 'chapter' | 'council';
  org_archetype: string | null;
  university: string;
  council_type: CouncilType | null;
  council_school_id: string | null;
  council_verified_at: string | null;
  recruitment_model: RecruitmentModel | null;
}

export type SchoolChapterStatusResult =
  { ok: true; link: SchoolChapter } | { ok: false; reason: AffiliationRefusal };

/**
 * Affiliations (§ 2.4, #5974): a chapter's school links and its council
 * links. Every read is keyed by the tenant it's for; every write goes
 * through the database function that holds the transition rules.
 */
export interface IAffiliationRepository {
  /** The chapter's live school links (`proposed` or `active`), primary first. */
  findLiveSchoolLinks(chapterId: string): Promise<SchoolChapter[]>;
  /**
   * Proposes the chapter's link to a school. Returns false when the pair
   * already has a live link (`school_chapters_live_pair`).
   */
  proposeSchoolLink(
    chapterId: string,
    schoolId: string,
    proposedBy: string,
  ): Promise<boolean>;
  setSchoolLinkStatus(
    chapterId: string,
    linkId: string,
    status: Exclude<SchoolChapterStatus, 'proposed'>,
    actor: string,
  ): Promise<SchoolChapterStatusResult>;

  /** The council's live links (`proposed`, `accepted`, `suspended`), newest first. */
  findLiveLinksForCouncil(councilId: string): Promise<CouncilChapter[]>;
  /** The chapter's live council links, newest first. */
  findLiveLinksForChapter(chapterId: string): Promise<CouncilChapter[]>;
  /** One link, only when it belongs to this council. */
  findCouncilLink(
    councilId: string,
    linkId: string,
  ): Promise<CouncilChapter | null>;
  /** One link, only when it belongs to this chapter. */
  findChapterLink(
    chapterId: string,
    linkId: string,
  ): Promise<CouncilChapter | null>;
  setCouncilLinkStatus(
    councilId: string,
    chapterId: string,
    side: AffiliationSide,
    status: CouncilChapterStatus,
    actor: string,
  ): Promise<CouncilChapterStatusResult>;

  /** Chapter-kind tenants with an `active` link to the school. */
  findActiveChapterIdsAtSchool(schoolId: string): Promise<string[]>;
  /** The councils at any of these schools. */
  findCouncilsAtSchools(schoolIds: string[]): Promise<TenantListing[]>;
  /** These tenants' public listings, in no order. */
  findListings(tenantIds: string[]): Promise<TenantListing[]>;
}
