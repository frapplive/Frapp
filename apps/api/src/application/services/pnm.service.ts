import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  COUNCIL_RECRUITMENT_OFF_CODE,
  COUNCIL_SEASON_EXISTS_CODE,
  COUNCIL_SEASON_NOT_FOUND_CODE,
  PNM_ALREADY_MERGED_CODE,
  PNM_NOT_FOUND_CODE,
  PNM_RETENTION_DEFAULT_DAYS,
  PNM_TWO_ACCOUNTS_CODE,
} from '@repo/validation';
import {
  PNM_REPOSITORY,
  type IPnmRepository,
  type SeasonPatch,
} from '#domain/repositories/pnm.repository.interface';
import {
  AFFILIATION_REPOSITORY,
  type IAffiliationRepository,
} from '#domain/repositories/affiliation.repository.interface';
import {
  CHAPTER_REPOSITORY,
  type IChapterRepository,
} from '#domain/repositories/chapter.repository.interface';
import type { Chapter } from '#domain/entities/chapter.entity';
import type {
  CouncilRecruitmentSeason,
  Pnm,
  PnmSource,
  RecruitmentSeasonStatus,
} from '#domain/entities/pnm.entity';

/** The fields a master-list row shows, as logged (`council_pnm_access_log.fields`). */
const LIST_FIELDS = ['name', 'school_email', 'class_year'];

/** A PNM's shared fields (§ 3.3): never a phone number, never a pipeline field. */
export interface PnmSharedView {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  school_email: string;
  class_year: number | null;
  email_verified: boolean;
  source: PnmSource;
}

export interface MasterListRow extends PnmSharedView {
  registered_at: string;
  /** Whether a phone is on file, so a `recruitment_manage` holder knows to reveal it. */
  has_phone: boolean;
  /** How many of the council's chapters the PNM showed interest in. */
  interest_count: number;
  /**
   * Which chapters, by id: only once the season is closed. While it's open
   * (or planned) the council sees counts only (Winston, 2026-11-11).
   */
  interested_chapter_ids: string[] | null;
}

export interface MasterListView {
  season: CouncilRecruitmentSeason;
  /** True while counts stand in for which chapters (the season isn't closed). */
  counts_only: boolean;
  /** Per accepted chapter: how many PNMs on this list showed interest. */
  chapter_totals: { chapter_id: string; name: string; interested: number }[];
  pnms: MasterListRow[];
}

export interface DuplicatePairView {
  a: PnmSharedView;
  b: PnmSharedView;
  reasons: ('same_name_and_phone' | 'same_name_and_class_year')[];
}

export interface SeasonInput {
  term: string;
  opens_at: string;
  closes_at: string;
  bid_window_opens_at?: string | null;
  bid_window_closes_at?: string | null;
  status?: RecruitmentSeasonStatus;
  pnm_retention_days?: number;
}

/**
 * PNM records from the council's side and a chapter's (#5974,
 * `school-layer.md` § 2.5, § 3.3 and § 4.2 rule 4).
 *
 * The council reads only its own registrations, for PNMs at its own school,
 * with interests limited to its accepted chapters, and never
 * `rush_candidates`. An unverified council, or one with no accepted chapter,
 * gets an empty list (§ 4.2). While a season isn't closed, interests are
 * counts, never PNM-and-chapter pairs. A phone number needs
 * `council:recruitment_manage` (the controller's) and every reveal is
 * logged before the number is read (Paul, 2026-11-11). Every list read is
 * logged too, one row per PNM shown.
 *
 * A chapter reads a PNM only when that PNM showed interest in it or its own
 * candidate is linked; any other id is 404, never 403 (§ 4.2 rule 4).
 */
@Injectable()
export class PnmService {
  constructor(
    @Inject(PNM_REPOSITORY) private readonly pnms: IPnmRepository,
    @Inject(AFFILIATION_REPOSITORY)
    private readonly affiliations: IAffiliationRepository,
    @Inject(CHAPTER_REPOSITORY) private readonly chapters: IChapterRepository,
  ) {}

  // Seasons --------------------------------------------------------------------

  async listSeasons(councilId: string): Promise<CouncilRecruitmentSeason[]> {
    await this.recruitingCouncil(councilId);
    return this.pnms.findSeasons(councilId);
  }

  async createSeason(
    councilId: string,
    input: SeasonInput,
  ): Promise<CouncilRecruitmentSeason> {
    await this.recruitingCouncil(councilId);
    const term = input.term.trim().replace(/\s+/g, ' ');
    checkDates(input.opens_at, input.closes_at);
    checkDates(input.bid_window_opens_at, input.bid_window_closes_at);
    const created = await this.pnms.createSeason({
      council_id: councilId,
      term,
      opens_at: input.opens_at,
      closes_at: input.closes_at,
      bid_window_opens_at: input.bid_window_opens_at ?? null,
      bid_window_closes_at: input.bid_window_closes_at ?? null,
      status: input.status ?? 'planned',
      pnm_retention_days:
        input.pnm_retention_days ?? PNM_RETENTION_DEFAULT_DAYS,
    });
    if (!created) {
      throw new ConflictException({
        code: COUNCIL_SEASON_EXISTS_CODE,
        message: `Your council already has a ${term} season.`,
      });
    }
    return created;
  }

  async updateSeason(
    councilId: string,
    term: string,
    patch: SeasonPatch,
  ): Promise<CouncilRecruitmentSeason> {
    await this.recruitingCouncil(councilId);
    const current = await this.season(councilId, term);
    checkDates(
      patch.opens_at ?? current.opens_at,
      patch.closes_at ?? current.closes_at,
    );
    checkDates(
      patch.bid_window_opens_at === undefined
        ? current.bid_window_opens_at
        : patch.bid_window_opens_at,
      patch.bid_window_closes_at === undefined
        ? current.bid_window_closes_at
        : patch.bid_window_closes_at,
    );
    const updated = await this.pnms.updateSeason(councilId, term, patch);
    if (!updated) throw seasonNotFound();
    return updated;
  }

  // The master list --------------------------------------------------------------

  async masterList(
    councilId: string,
    actorUserId: string,
    term: string,
  ): Promise<MasterListView> {
    const council = await this.recruitingCouncil(councilId);
    const season = await this.season(councilId, term);
    const countsOnly = season.status !== 'closed';
    const empty: MasterListView = {
      season,
      counts_only: countsOnly,
      chapter_totals: [],
      pnms: [],
    };

    const accepted = await this.acceptedChapters(councilId);
    if (!council.council_verified_at || !accepted.length) return empty;

    const registrations = await this.pnms.findRegistrations(councilId, term);
    const records = await this.pnms.findLivePnmsAtSchool(
      council.council_school_id!,
      registrations.map((r) => r.pnm_id),
    );
    if (!records.length) return empty;
    const interests = await this.pnms.findInterests(
      records.map((p) => p.id),
      accepted.map((c) => c.id),
    );
    const registeredAt = new Map(
      registrations.map((r) => [r.pnm_id, r.created_at]),
    );
    const chaptersByPnm = new Map<string, string[]>();
    for (const interest of interests) {
      const list = chaptersByPnm.get(interest.pnm_id) ?? [];
      list.push(interest.chapter_id);
      chaptersByPnm.set(interest.pnm_id, list);
    }

    // No log, no read: the rows go out only once their reads are recorded.
    await this.pnms.logCouncilAccess(
      councilId,
      actorUserId,
      records.map((p) => ({ pnmId: p.id, fields: LIST_FIELDS })),
    );

    return {
      season,
      counts_only: countsOnly,
      chapter_totals: accepted.map((chapter) => ({
        chapter_id: chapter.id,
        name: chapter.name,
        interested: interests.filter((i) => i.chapter_id === chapter.id).length,
      })),
      pnms: records
        .map((pnm) => {
          const chapterIds = chaptersByPnm.get(pnm.id) ?? [];
          return {
            ...sharedView(pnm),
            registered_at: registeredAt.get(pnm.id) ?? pnm.created_at,
            has_phone: pnm.phone !== null,
            interest_count: chapterIds.length,
            interested_chapter_ids: countsOnly ? null : chapterIds,
          };
        })
        .sort(
          (a, b) =>
            a.last_name.localeCompare(b.last_name) ||
            a.first_name.localeCompare(b.first_name),
        ),
    };
  }

  /**
   * A PNM's phone number for a `council:recruitment_manage` holder. The read
   * is logged first; when the log can't be written, no number goes out.
   */
  async revealPhone(
    councilId: string,
    actorUserId: string,
    pnmId: string,
  ): Promise<{ phone: string | null }> {
    const council = await this.recruitingCouncil(councilId);
    const pnm = await this.councilPnm(council, pnmId);
    await this.pnms.logCouncilAccess(councilId, actorUserId, [
      { pnmId: pnm.id, fields: ['phone'] },
    ]);
    return { phone: pnm.phone };
  }

  // The merge queue ------------------------------------------------------------

  /**
   * Suspected duplicates among the council's registrants (§ Identity and
   * duplicates): the same name and phone, or the same name and class year.
   * Never merged automatically; a pair an officer dismissed stays dismissed.
   * The pair says a phone matches without showing it.
   */
  async duplicates(
    councilId: string,
    actorUserId: string,
  ): Promise<DuplicatePairView[]> {
    const council = await this.recruitingCouncil(councilId);
    if (!council.council_verified_at) return [];
    const ids = await this.pnms.findAllRegistrantIds(councilId);
    const records = await this.pnms.findLivePnmsAtSchool(
      council.council_school_id!,
      ids,
    );
    const dismissed = new Set(
      (await this.pnms.findDismissals(councilId)).map(
        (d) => `${d.pnm_a}:${d.pnm_b}`,
      ),
    );
    const byName = new Map<string, Pnm[]>();
    for (const pnm of records) {
      const key = `${norm(pnm.first_name)} ${norm(pnm.last_name)}`;
      byName.set(key, [...(byName.get(key) ?? []), pnm]);
    }
    const pairs: DuplicatePairView[] = [];
    for (const group of byName.values()) {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          const [a, b] = [group[i], group[j]].sort((x, y) =>
            x.id < y.id ? -1 : 1,
          );
          if (dismissed.has(`${a.id}:${b.id}`)) continue;
          const reasons: DuplicatePairView['reasons'] = [];
          if (a.phone && b.phone && digits(a.phone) === digits(b.phone)) {
            reasons.push('same_name_and_phone');
          }
          if (a.class_year !== null && a.class_year === b.class_year) {
            reasons.push('same_name_and_class_year');
          }
          if (reasons.length) {
            pairs.push({ a: sharedView(a), b: sharedView(b), reasons });
          }
        }
      }
    }
    const shown = [...new Set(pairs.flatMap((p) => [p.a.id, p.b.id]))];
    await this.pnms.logCouncilAccess(
      councilId,
      actorUserId,
      shown.map((pnmId) => ({ pnmId, fields: LIST_FIELDS })),
    );
    return pairs;
  }

  async dismissDuplicate(
    councilId: string,
    actorUserId: string,
    first: string,
    second: string,
  ): Promise<void> {
    const council = await this.recruitingCouncil(councilId);
    if (first === second || !council.council_verified_at) throw pnmNotFound();
    const registrants = await this.pnms.findRegistrantIds(councilId, [
      first,
      second,
    ]);
    if (registrants.length !== 2) throw pnmNotFound();
    const [a, b] = [first, second].sort();
    await this.pnms.dismissDuplicate(councilId, a, b, actorUserId);
  }

  async merge(
    councilId: string,
    actorUserId: string,
    survivorId: string,
    loserId: string,
  ): Promise<{ survivor_id: string; candidate_conflicts: number }> {
    const council = await this.recruitingCouncil(councilId);
    if (!council.council_verified_at) throw pnmNotFound();
    if (survivorId === loserId) {
      throw new BadRequestException('Pick two different records to merge.');
    }
    const result = await this.pnms.merge(
      councilId,
      survivorId,
      loserId,
      actorUserId,
    );
    if (result.ok) {
      return {
        survivor_id: result.survivor_id,
        candidate_conflicts: result.candidate_conflicts,
      };
    }
    switch (result.reason) {
      case 'already_merged':
        throw new ConflictException({
          code: PNM_ALREADY_MERGED_CODE,
          message: 'One of these records was already merged.',
        });
      case 'two_accounts':
        throw new ConflictException({
          code: PNM_TWO_ACCOUNTS_CODE,
          message:
            'These records belong to two different Frapp accounts, so they are two people.',
        });
      case 'same_record':
        throw new BadRequestException('Pick two different records to merge.');
      default:
        throw pnmNotFound();
    }
  }

  // A chapter's read -------------------------------------------------------------

  /**
   * A PNM's shared fields for a chapter they showed interest in (or whose
   * own candidate is linked). The phone only when the PNM chose to share it.
   */
  async getForChapter(
    chapterId: string,
    pnmId: string,
  ): Promise<PnmSharedView & { phone: string | null }> {
    const [pnm, linked] = await Promise.all([
      this.pnms.findLivePnm(pnmId),
      this.pnms.isLinkedToChapter(chapterId, pnmId),
    ]);
    if (!pnm || !linked) throw pnmNotFound();
    return { ...sharedView(pnm), phone: pnm.phone_shared ? pnm.phone : null };
  }

  // ---------------------------------------------------------------------------

  /** The council, refusing one whose recruitment model is `none`. */
  private async recruitingCouncil(councilId: string): Promise<Chapter> {
    const council = await this.chapters.findById(councilId);
    if (!council || council.kind !== 'council' || !council.council_school_id) {
      throw pnmNotFound();
    }
    if (council.recruitment_model === 'none' || !council.recruitment_model) {
      throw new ForbiddenException({
        code: COUNCIL_RECRUITMENT_OFF_CODE,
        message: "Your council doesn't run recruitment on Frapp.",
      });
    }
    return council;
  }

  private async season(
    councilId: string,
    term: string,
  ): Promise<CouncilRecruitmentSeason> {
    const season = await this.pnms.findSeason(councilId, term);
    if (!season) throw seasonNotFound();
    return season;
  }

  private async acceptedChapters(
    councilId: string,
  ): Promise<{ id: string; name: string }[]> {
    const links = await this.affiliations.findLiveLinksForCouncil(councilId);
    const ids = links
      .filter((link) => link.status === 'accepted')
      .map((link) => link.chapter_id);
    const listings = await this.affiliations.findListings(ids);
    return listings
      .map((row) => ({ id: row.id, name: row.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** A registrant of this council at its school, or 404. */
  private async councilPnm(council: Chapter, pnmId: string): Promise<Pnm> {
    if (!council.council_verified_at) throw pnmNotFound();
    const [registered] = await this.pnms.findRegistrantIds(council.id, [pnmId]);
    if (!registered) throw pnmNotFound();
    const [pnm] = await this.pnms.findLivePnmsAtSchool(
      council.council_school_id!,
      [pnmId],
    );
    if (!pnm) throw pnmNotFound();
    return pnm;
  }
}

function sharedView(pnm: Pnm): PnmSharedView {
  return {
    id: pnm.id,
    first_name: pnm.first_name,
    last_name: pnm.last_name,
    preferred_name: pnm.preferred_name,
    school_email: pnm.school_email,
    class_year: pnm.class_year,
    email_verified: pnm.email_verified_at !== null,
    source: pnm.created_via,
  };
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function checkDates(
  start: string | null | undefined,
  end: string | null | undefined,
): void {
  if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
    throw new BadRequestException(
      'A season or bid window ends after it opens.',
    );
  }
}

function pnmNotFound(): NotFoundException {
  return new NotFoundException({
    code: PNM_NOT_FOUND_CODE,
    message: "That record isn't there.",
  });
}

function seasonNotFound(): NotFoundException {
  return new NotFoundException({
    code: COUNCIL_SEASON_NOT_FOUND_CODE,
    message: "That season isn't there.",
  });
}
