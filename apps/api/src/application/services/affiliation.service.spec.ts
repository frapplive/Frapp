import { ConflictException, NotFoundException } from '@nestjs/common';
import { AffiliationService } from './affiliation.service';
import type { IAffiliationRepository } from '#domain/repositories/affiliation.repository.interface';
import type { IChapterRepository } from '#domain/repositories/chapter.repository.interface';
import type { ISchoolRepository } from '#domain/repositories/school.repository.interface';
import type { CouncilChapter } from '#domain/entities/council-chapter.entity';
import type { SchoolChapter } from '#domain/entities/school.entity';

const CHAPTER = 'chapter-1';
const COUNCIL = 'council-1';
const SCHOOL = 'school-1';
const ACTOR = 'user-1';

const school = {
  id: SCHOOL,
  name: 'Rensselaer Polytechnic Institute',
  short_name: 'RPI',
  status: 'verified',
};

function schoolLink(over: Partial<SchoolChapter> = {}): SchoolChapter {
  return {
    id: 'sl-1',
    school_id: SCHOOL,
    chapter_id: CHAPTER,
    is_primary: true,
    status: 'active',
    proposed_by: ACTOR,
    confirmed_by: ACTOR,
    confirmed_at: '2026-11-24T00:00:00Z',
    ended_at: null,
    created_at: '2026-11-24T00:00:00Z',
    ...over,
  };
}

function councilLink(over: Partial<CouncilChapter> = {}): CouncilChapter {
  return {
    id: 'cl-1',
    council_id: COUNCIL,
    chapter_id: CHAPTER,
    status: 'proposed',
    proposed_by_side: 'council',
    proposed_by: ACTOR,
    decided_by: null,
    decided_at: null,
    created_at: '2026-11-24T00:00:00Z',
    ...over,
  };
}

const listing = (over: Record<string, unknown>) => ({
  id: CHAPTER,
  name: 'Phi Gamma Delta',
  kind: 'chapter',
  org_archetype: 'ifc',
  university: 'RPI',
  council_type: null,
  council_school_id: null,
  council_verified_at: null,
  recruitment_model: null,
  ...over,
});

const ifcListing = listing({
  id: COUNCIL,
  name: 'RPI IFC',
  kind: 'council',
  org_archetype: 'council',
  council_type: 'ifc',
  council_school_id: SCHOOL,
  recruitment_model: 'open_bidding',
});

function setup() {
  const repo = {
    findLiveSchoolLinks: jest.fn().mockResolvedValue([schoolLink()]),
    proposeSchoolLink: jest.fn().mockResolvedValue(true),
    setSchoolLinkStatus: jest.fn(),
    findLiveLinksForCouncil: jest.fn().mockResolvedValue([]),
    findLiveLinksForChapter: jest.fn().mockResolvedValue([]),
    findCouncilLink: jest.fn(),
    findChapterLink: jest.fn(),
    setCouncilLinkStatus: jest.fn(),
    findActiveChapterIdsAtSchool: jest.fn().mockResolvedValue([]),
    findCouncilsAtSchools: jest.fn().mockResolvedValue([ifcListing]),
    findListings: jest.fn().mockResolvedValue([]),
  };
  const chapters = {
    findById: jest.fn().mockResolvedValue({
      id: CHAPTER,
      org_archetype: 'ifc',
      kind: 'chapter',
    }),
  };
  const schools = {
    findById: jest.fn().mockResolvedValue(school),
    findByIds: jest.fn().mockResolvedValue([school]),
  };
  const service = new AffiliationService(
    repo,
    chapters as unknown as IChapterRepository,
    schools as unknown as ISchoolRepository,
  );
  return { service, repo, chapters, schools };
}

describe('AffiliationService — the chapter side', () => {
  it("lists the chapter's school and the councils at it, with the link and offer", async () => {
    const { service, repo } = setup();
    repo.findLiveLinksForChapter.mockResolvedValue([councilLink()]);

    const view = await service.getForChapter(CHAPTER);

    expect(repo.findCouncilsAtSchools).toHaveBeenCalledWith([SCHOOL]);
    expect(view.schools).toEqual([
      {
        link_id: 'sl-1',
        status: 'active',
        is_primary: true,
        school: { id: SCHOOL, name: school.name, short_name: 'RPI' },
      },
    ]);
    expect(view.councils).toEqual([
      expect.objectContaining({
        council: expect.objectContaining({ id: COUNCIL, verified: false }),
        link: expect.objectContaining({
          id: 'cl-1',
          proposed_by_side: 'council',
        }),
        offered: true,
      }),
    ]);
  });

  it('shows no councils until the school is confirmed', async () => {
    const { service, repo } = setup();
    repo.findLiveSchoolLinks.mockResolvedValue([
      schoolLink({
        status: 'proposed',
        confirmed_by: null,
        confirmed_at: null,
      }),
    ]);
    repo.findCouncilsAtSchools.mockResolvedValue([]);

    const view = await service.getForChapter(CHAPTER);

    expect(repo.findCouncilsAtSchools).toHaveBeenCalledWith([]);
    expect(view.councils).toEqual([]);
  });

  it("doesn't offer an IFC to a Panhellenic chapter, but still lists it", async () => {
    const { service, chapters } = setup();
    chapters.findById.mockResolvedValue({ id: CHAPTER, org_archetype: 'npc' });

    const view = await service.getForChapter(CHAPTER);

    expect(view.councils[0].offered).toBe(false);
  });

  it("proposes and confirms the officer's own school pick", async () => {
    const { service, repo } = setup();
    repo.findLiveSchoolLinks.mockResolvedValue([
      schoolLink({ status: 'proposed' }),
    ]);
    repo.setSchoolLinkStatus.mockResolvedValue({
      ok: true,
      link: schoolLink(),
    });

    const linked = await service.linkSchool(CHAPTER, ACTOR, SCHOOL);

    expect(repo.proposeSchoolLink).toHaveBeenCalledWith(CHAPTER, SCHOOL, ACTOR);
    expect(repo.setSchoolLinkStatus).toHaveBeenCalledWith(
      CHAPTER,
      'sl-1',
      'active',
      ACTOR,
    );
    expect(linked.status).toBe('active');
  });

  it('refuses a school already confirmed, and an unknown or suspended school', async () => {
    const { service, repo, schools } = setup();
    repo.proposeSchoolLink.mockResolvedValue(false);
    await expect(service.linkSchool(CHAPTER, ACTOR, SCHOOL)).rejects.toThrow(
      ConflictException,
    );

    schools.findById.mockResolvedValue({ ...school, status: 'suspended' });
    await expect(service.linkSchool(CHAPTER, ACTOR, SCHOOL)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("asks to join from the chapter's side", async () => {
    const { service, repo } = setup();
    repo.setCouncilLinkStatus.mockResolvedValue({
      ok: true,
      link: councilLink({ proposed_by_side: 'chapter' }),
    });

    const link = await service.requestCouncil(CHAPTER, ACTOR, COUNCIL);

    expect(repo.setCouncilLinkStatus).toHaveBeenCalledWith(
      COUNCIL,
      CHAPTER,
      'chapter',
      'proposed',
      ACTOR,
    );
    expect(link.proposed_by_side).toBe('chapter');
  });

  it("answers only its own chapter's link: another chapter's link id is 404", async () => {
    const { service, repo } = setup();
    repo.findChapterLink.mockResolvedValue(null);

    await expect(
      service.decideForChapter(CHAPTER, ACTOR, 'cl-other', 'accepted'),
    ).rejects.toThrow(NotFoundException);
    expect(repo.findChapterLink).toHaveBeenCalledWith(CHAPTER, 'cl-other');
    expect(repo.setCouncilLinkStatus).not.toHaveBeenCalled();
  });

  it.each([
    ['no_shared_school', 'affiliation.no_shared_school', ConflictException],
    ['invalid_transition', 'affiliation.invalid_transition', ConflictException],
    ['exists', 'affiliation.exists', ConflictException],
    ['wrong_kind', 'affiliation.not_found', NotFoundException],
    ['not_found', 'affiliation.not_found', NotFoundException],
  ])('maps the database refusal %s to %s', async (reason, code, Exception) => {
    const { service, repo } = setup();
    repo.setCouncilLinkStatus.mockResolvedValue({ ok: false, reason });

    const error = await service
      .requestCouncil(CHAPTER, ACTOR, COUNCIL)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Exception);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code,
    });
  });
});

describe('AffiliationService — the council side', () => {
  it("lists its chapters' public listings and links, never a chapter it isn't linked to", async () => {
    const { service, repo } = setup();
    repo.findLiveLinksForCouncil.mockResolvedValue([
      councilLink({ status: 'accepted' }),
    ]);
    repo.findListings.mockResolvedValue([listing({})]);

    const rows = await service.listForCouncil(COUNCIL);

    expect(repo.findLiveLinksForCouncil).toHaveBeenCalledWith(COUNCIL);
    expect(repo.findListings).toHaveBeenCalledWith([CHAPTER]);
    expect(rows).toEqual([
      {
        link: expect.objectContaining({ status: 'accepted' }),
        chapter: {
          id: CHAPTER,
          name: 'Phi Gamma Delta',
          org_archetype: 'ifc',
          university: 'RPI',
        },
      },
    ]);
  });

  it('offers chapters at its school with no live link, offered archetypes first', async () => {
    const { service, repo, chapters } = setup();
    chapters.findById.mockResolvedValue({
      id: COUNCIL,
      kind: 'council',
      council_type: 'ifc',
      council_school_id: SCHOOL,
    });
    repo.findActiveChapterIdsAtSchool.mockResolvedValue(['a', 'b', 'linked']);
    repo.findLiveLinksForCouncil.mockResolvedValue([
      councilLink({ chapter_id: 'linked' }),
    ]);
    repo.findListings.mockResolvedValue([
      listing({ id: 'a', name: 'Alpha Phi', org_archetype: 'npc' }),
      listing({ id: 'b', name: 'Zeta Psi', org_archetype: 'ifc' }),
    ]);

    const rows = await service.inviteCandidates(COUNCIL);

    expect(repo.findActiveChapterIdsAtSchool).toHaveBeenCalledWith(SCHOOL);
    expect(repo.findListings).toHaveBeenCalledWith(['a', 'b']);
    expect(rows.map((r) => [r.chapter.id, r.offered])).toEqual([
      ['b', true],
      ['a', false],
    ]);
  });

  it("decides only its own council's link", async () => {
    const { service, repo } = setup();
    repo.findCouncilLink.mockResolvedValue(councilLink({ status: 'accepted' }));
    repo.setCouncilLinkStatus.mockResolvedValue({
      ok: true,
      link: councilLink({ status: 'suspended' }),
    });

    const link = await service.decideForCouncil(
      COUNCIL,
      ACTOR,
      'cl-1',
      'suspended',
    );

    expect(repo.findCouncilLink).toHaveBeenCalledWith(COUNCIL, 'cl-1');
    expect(repo.setCouncilLinkStatus).toHaveBeenCalledWith(
      COUNCIL,
      CHAPTER,
      'council',
      'suspended',
      ACTOR,
    );
    expect(link.status).toBe('suspended');
  });
});
