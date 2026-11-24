import type {
  CouncilRecruitmentSeason,
  Pnm,
  PnmCouncilRegistration,
  PnmDuplicateDismissal,
  PnmInterest,
  PnmMergeResult,
} from '../entities/pnm.entity';

export const PNM_REPOSITORY = 'PNM_REPOSITORY';

export type SeasonInsert = Pick<
  CouncilRecruitmentSeason,
  'council_id' | 'term' | 'opens_at' | 'closes_at'
> &
  Partial<
    Pick<
      CouncilRecruitmentSeason,
      | 'bid_window_opens_at'
      | 'bid_window_closes_at'
      | 'status'
      | 'pnm_retention_days'
    >
  >;

export type SeasonPatch = Partial<
  Pick<
    CouncilRecruitmentSeason,
    | 'opens_at'
    | 'closes_at'
    | 'bid_window_opens_at'
    | 'bid_window_closes_at'
    | 'status'
    | 'pnm_retention_days'
  >
>;

/** One council read of PNM records, for `council_pnm_access_log`. */
export interface PnmAccessLogEntry {
  pnmId: string;
  fields: string[];
}

/**
 * PNM records (#5974, `school-layer.md` § 2.5). Every council read is keyed
 * by the council (its seasons, registrations, dismissals) and its school
 * (PNMs); every chapter read by the chapter (interests, candidates). A PNM
 * id alone finds nothing (§ 4.2 rule 4).
 */
export interface IPnmRepository {
  findSeasons(councilId: string): Promise<CouncilRecruitmentSeason[]>;
  findSeason(
    councilId: string,
    term: string,
  ): Promise<CouncilRecruitmentSeason | null>;
  /** Null when the council already has a season of that term. */
  createSeason(row: SeasonInsert): Promise<CouncilRecruitmentSeason | null>;
  updateSeason(
    councilId: string,
    term: string,
    patch: SeasonPatch,
  ): Promise<CouncilRecruitmentSeason | null>;

  /** The council's registrations for one term. */
  findRegistrations(
    councilId: string,
    term: string,
  ): Promise<PnmCouncilRegistration[]>;
  /** The PNMs among these ids that registered with the council, any term. */
  findRegistrantIds(councilId: string, pnmIds: string[]): Promise<string[]>;
  /** Every PNM id registered with the council, any term. */
  findAllRegistrantIds(councilId: string): Promise<string[]>;
  /** Live (unmerged) PNMs among these ids, at this school only. */
  findLivePnmsAtSchool(schoolId: string, pnmIds: string[]): Promise<Pnm[]>;
  /** Live interests of these PNMs in these chapters only. */
  findInterests(pnmIds: string[], chapterIds: string[]): Promise<PnmInterest[]>;

  /** Writes the council's reads to `council_pnm_access_log`. */
  logCouncilAccess(
    councilId: string,
    actorUserId: string,
    entries: PnmAccessLogEntry[],
  ): Promise<void>;

  findDismissals(councilId: string): Promise<PnmDuplicateDismissal[]>;
  /** `a < b` is the caller's to order. Idempotent. */
  dismissDuplicate(
    councilId: string,
    a: string,
    b: string,
    actorUserId: string,
  ): Promise<void>;
  merge(
    councilId: string,
    survivorId: string,
    loserId: string,
    actorUserId: string,
  ): Promise<PnmMergeResult>;

  /** The live PNM, or null. */
  findLivePnm(pnmId: string): Promise<Pnm | null>;
  /** Whether the chapter holds a live interest from, or a candidate linked to, the PNM. */
  isLinkedToChapter(chapterId: string, pnmId: string): Promise<boolean>;

  /** The retention sweep: deletes expired records, returns how many. */
  purgeExpired(now: Date): Promise<number>;
}
