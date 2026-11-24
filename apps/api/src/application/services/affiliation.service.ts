import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AFFILIATION_EXISTS_CODE,
  AFFILIATION_INVALID_TRANSITION_CODE,
  AFFILIATION_NO_SHARED_SCHOOL_CODE,
  AFFILIATION_NOT_FOUND_CODE,
  councilOffersArchetype,
  type CouncilLinkDecision,
  type CouncilType,
  type SchoolLinkDecision,
} from '@repo/validation';
import {
  AFFILIATION_REPOSITORY,
  type IAffiliationRepository,
  type TenantListing,
} from '#domain/repositories/affiliation.repository.interface';
import {
  CHAPTER_REPOSITORY,
  type IChapterRepository,
} from '#domain/repositories/chapter.repository.interface';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '#domain/repositories/school.repository.interface';
import type {
  AffiliationRefusal,
  AffiliationSide,
  CouncilChapter,
  CouncilChapterStatus,
} from '#domain/entities/council-chapter.entity';
import type { SchoolChapterStatus } from '#domain/entities/school.entity';

export interface AffiliationSchoolView {
  link_id: string;
  status: SchoolChapterStatus;
  is_primary: boolean;
  school: { id: string; name: string; short_name: string };
}

export interface CouncilLinkView {
  id: string;
  status: CouncilChapterStatus;
  proposed_by_side: AffiliationSide;
  created_at: string;
  decided_at: string | null;
}

export interface ChapterCouncilView {
  council: {
    id: string;
    name: string;
    council_type: CouncilType | null;
    verified: boolean;
    school_id: string | null;
  };
  /** The live link, or null when the chapter isn't linked. */
  link: CouncilLinkView | null;
  /** Whether the council's type is offered this chapter's archetype (§ Link offers). */
  offered: boolean;
}

/** `GET /v1/chapter/affiliations`. */
export interface ChapterAffiliationsView {
  schools: AffiliationSchoolView[];
  councils: ChapterCouncilView[];
}

export interface CouncilChapterView {
  link: CouncilLinkView;
  chapter: ChapterListingView;
}

export interface ChapterListingView {
  id: string;
  name: string;
  org_archetype: string | null;
  university: string;
}

export interface InviteCandidateView {
  chapter: ChapterListingView;
  offered: boolean;
}

/**
 * Affiliations (#5974, `school-layer.md` § 2.4): a chapter confirms its
 * school, then asks to join the school's council or accepts its invitation;
 * the council accepts, declines, suspends or removes. Both sides see the
 * link; neither side reads the other's data, and a council never reads a
 * chapter live (#4068 decision 11): it sees a chapter's public listing
 * (name, archetype, school), the same a school's listing shows.
 *
 * The caller's key on their own side is the controller's
 * (`chapter-config:manage` or `council:chapters_manage`); the pair and the
 * transition are the database's (`set_council_chapter_status`).
 */
@Injectable()
export class AffiliationService {
  constructor(
    @Inject(AFFILIATION_REPOSITORY)
    private readonly affiliations: IAffiliationRepository,
    @Inject(CHAPTER_REPOSITORY)
    private readonly chapters: IChapterRepository,
    @Inject(SCHOOL_REPOSITORY)
    private readonly schools: ISchoolRepository,
  ) {}

  // The chapter's side ---------------------------------------------------------

  async getForChapter(chapterId: string): Promise<ChapterAffiliationsView> {
    const [links, councilLinks, chapter] = await Promise.all([
      this.affiliations.findLiveSchoolLinks(chapterId),
      this.affiliations.findLiveLinksForChapter(chapterId),
      this.chapters.findById(chapterId),
    ]);
    const schoolRows = await this.schools.findByIds([
      ...new Set(links.map((link) => link.school_id)),
    ]);
    const schoolById = new Map(schoolRows.map((s) => [s.id, s]));
    const activeSchoolIds = links
      .filter((link) => link.status === 'active')
      .map((link) => link.school_id);

    const atSchools =
      await this.affiliations.findCouncilsAtSchools(activeSchoolIds);
    // A live link to a council no longer at an active school still shows.
    const missing = councilLinks
      .map((link) => link.council_id)
      .filter((id) => !atSchools.some((council) => council.id === id));
    const councils = [
      ...atSchools,
      ...(await this.affiliations.findListings(missing)),
    ].filter((listing) => listing.kind === 'council');
    const linkByCouncil = new Map(
      councilLinks.map((link) => [link.council_id, link]),
    );

    return {
      schools: links.flatMap((link) => {
        const school = schoolById.get(link.school_id);
        if (!school) return [];
        return [
          {
            link_id: link.id,
            status: link.status,
            is_primary: link.is_primary,
            school: {
              id: school.id,
              name: school.name,
              short_name: school.short_name,
            },
          },
        ];
      }),
      councils: councils.map((council) => {
        const link = linkByCouncil.get(council.id);
        return {
          council: {
            id: council.id,
            name: council.name,
            council_type: council.council_type,
            verified: council.council_verified_at !== null,
            school_id: council.council_school_id,
          },
          link: link ? linkView(link) : null,
          offered: council.council_type
            ? councilOffersArchetype(
                council.council_type,
                chapter?.org_archetype,
              )
            : false,
        };
      }),
    };
  }

  /**
   * The chapter's officer names their school. Every path into a school
   * starts at `proposed` and an officer of the chapter confirms it (§ 2.4);
   * here the officer proposing is the one confirming, so both steps run.
   */
  async linkSchool(
    chapterId: string,
    actor: string,
    schoolId: string,
  ): Promise<AffiliationSchoolView> {
    const school = await this.schools.findById(schoolId);
    if (!school || school.status === 'suspended') throw notFound();
    const proposed = await this.affiliations.proposeSchoolLink(
      chapterId,
      schoolId,
      actor,
    );
    const live = await this.affiliations.findLiveSchoolLinks(chapterId);
    const link = live.find((row) => row.school_id === schoolId);
    if (!link) throw notFound();
    if (!proposed && link.status === 'active') throw exists();
    const confirmed =
      link.status === 'active'
        ? { ok: true as const, link }
        : await this.affiliations.setSchoolLinkStatus(
            chapterId,
            link.id,
            'active',
            actor,
          );
    if (!confirmed.ok) throw refusal(confirmed.reason);
    return {
      link_id: confirmed.link.id,
      status: confirmed.link.status,
      is_primary: confirmed.link.is_primary,
      school: {
        id: school.id,
        name: school.name,
        short_name: school.short_name,
      },
    };
  }

  async decideSchoolLink(
    chapterId: string,
    actor: string,
    linkId: string,
    status: SchoolLinkDecision,
  ): Promise<{ link_id: string; status: SchoolChapterStatus }> {
    const result = await this.affiliations.setSchoolLinkStatus(
      chapterId,
      linkId,
      status,
      actor,
    );
    if (!result.ok) throw refusal(result.reason);
    return { link_id: result.link.id, status: result.link.status };
  }

  async requestCouncil(
    chapterId: string,
    actor: string,
    councilId: string,
  ): Promise<CouncilLinkView> {
    return this.write(councilId, chapterId, 'chapter', 'proposed', actor);
  }

  async decideForChapter(
    chapterId: string,
    actor: string,
    linkId: string,
    status: CouncilLinkDecision,
  ): Promise<CouncilLinkView> {
    const link = await this.affiliations.findChapterLink(chapterId, linkId);
    if (!link) throw notFound();
    return this.write(link.council_id, chapterId, 'chapter', status, actor);
  }

  // The council's side ---------------------------------------------------------

  async listForCouncil(councilId: string): Promise<CouncilChapterView[]> {
    const links = await this.affiliations.findLiveLinksForCouncil(councilId);
    const listings = await this.affiliations.findListings(
      links.map((link) => link.chapter_id),
    );
    const byId = new Map(listings.map((row) => [row.id, row]));
    return links.flatMap((link) => {
      const chapter = byId.get(link.chapter_id);
      if (!chapter) return [];
      return [{ link: linkView(link), chapter: chapterListing(chapter) }];
    });
  }

  /**
   * The chapters a council may invite: those with an `active` link to its
   * school and no live link to it yet, offered archetypes first. A school's
   * listing shows these anyway, so it reads nothing private (§ 2.4).
   */
  async inviteCandidates(councilId: string): Promise<InviteCandidateView[]> {
    const council = await this.chapters.findById(councilId);
    if (!council?.council_school_id || !council.council_type) return [];
    const type = council.council_type;
    const [atSchool, linked] = await Promise.all([
      this.affiliations.findActiveChapterIdsAtSchool(council.council_school_id),
      this.affiliations.findLiveLinksForCouncil(councilId),
    ]);
    const taken = new Set(linked.map((link) => link.chapter_id));
    const listings = await this.affiliations.findListings(
      atSchool.filter((id) => !taken.has(id) && id !== councilId),
    );
    return listings
      .filter((row) => row.kind === 'chapter')
      .map((row) => ({
        chapter: chapterListing(row),
        offered: councilOffersArchetype(type, row.org_archetype),
      }))
      .sort(
        (a, b) =>
          Number(b.offered) - Number(a.offered) ||
          a.chapter.name.localeCompare(b.chapter.name),
      );
  }

  async invite(
    councilId: string,
    actor: string,
    chapterId: string,
  ): Promise<CouncilLinkView> {
    return this.write(councilId, chapterId, 'council', 'proposed', actor);
  }

  async decideForCouncil(
    councilId: string,
    actor: string,
    linkId: string,
    status: CouncilLinkDecision,
  ): Promise<CouncilLinkView> {
    const link = await this.affiliations.findCouncilLink(councilId, linkId);
    if (!link) throw notFound();
    return this.write(councilId, link.chapter_id, 'council', status, actor);
  }

  private async write(
    councilId: string,
    chapterId: string,
    side: AffiliationSide,
    status: CouncilChapterStatus,
    actor: string,
  ): Promise<CouncilLinkView> {
    const result = await this.affiliations.setCouncilLinkStatus(
      councilId,
      chapterId,
      side,
      status,
      actor,
    );
    if (!result.ok) throw refusal(result.reason);
    return linkView(result.link);
  }
}

function linkView(link: CouncilChapter): CouncilLinkView {
  return {
    id: link.id,
    status: link.status,
    proposed_by_side: link.proposed_by_side,
    created_at: link.created_at,
    decided_at: link.decided_at,
  };
}

function chapterListing(row: TenantListing): ChapterListingView {
  return {
    id: row.id,
    name: row.name,
    org_archetype: row.org_archetype,
    university: row.university,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: AFFILIATION_NOT_FOUND_CODE,
    message: "That link isn't there any more.",
  });
}

function exists(): ConflictException {
  return new ConflictException({
    code: AFFILIATION_EXISTS_CODE,
    message: 'That link already exists.',
  });
}

/**
 * The database's refusal as an error. A wrong kind reads as not found, so
 * naming a council where a chapter goes (or another tenant's id) says
 * nothing about what that id is.
 */
function refusal(reason: AffiliationRefusal): Error {
  switch (reason) {
    case 'exists':
      return exists();
    case 'no_shared_school':
      return new ConflictException({
        code: AFFILIATION_NO_SHARED_SCHOOL_CODE,
        message:
          "The chapter hasn't confirmed this council's school yet, so it can't join.",
      });
    case 'invalid_transition':
      return new ConflictException({
        code: AFFILIATION_INVALID_TRANSITION_CODE,
        message: 'That link changed. Refresh to see where it stands.',
      });
    default:
      return notFound();
  }
}
