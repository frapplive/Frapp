import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { COUNCIL_PROFILES } from '@repo/validation';
import { CouncilService, councilSeed } from './council.service';
import type { ChapterService, TenantSeed } from './chapter.service';
import type { ChapterOnboardingService } from './chapter-onboarding.service';
import type { LegalAcceptanceService } from './legal-acceptance.service';
import type { IChapterRepository } from '#domain/repositories/chapter.repository.interface';
import type { ISchoolRepository } from '#domain/repositories/school.repository.interface';
import type { Chapter } from '#domain/entities/chapter.entity';

const USER = 'user-1';
const SCHOOL = '7d1f2a3b-0000-4000-8000-000000000001';

function setup() {
  const chapterService = {
    create: jest.fn(
      async (
        _userId: string,
        data: { name: string; config: Partial<Chapter> },
      ) => ({ id: 'council-1', name: data.name }) as Chapter,
    ),
  };
  const onboarding = {
    chapterStartRefusal: jest.fn().mockResolvedValue(null),
    startLimitException: jest.fn(),
  };
  const legal = { requireOrAccept: jest.fn().mockResolvedValue(undefined) };
  const chapterRepo = {
    findCouncilBySchoolAndType: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
  };
  const schoolRepo = {
    findById: jest.fn().mockResolvedValue({
      id: SCHOOL,
      name: 'Rensselaer Polytechnic Institute',
      short_name: 'RPI',
      status: 'verified',
    }),
    findLiveMembership: jest.fn().mockResolvedValue({ id: 'sm-1' }),
  };
  const service = new CouncilService(
    chapterService as unknown as ChapterService,
    onboarding as unknown as ChapterOnboardingService,
    legal as unknown as LegalAcceptanceService,
    chapterRepo as unknown as IChapterRepository,
    schoolRepo as unknown as ISchoolRepository,
  );
  return {
    service,
    chapterService,
    onboarding,
    legal,
    chapterRepo,
    schoolRepo,
  };
}

const input = (over: Record<string, unknown> = {}) => ({
  school_id: SCHOOL,
  council_type: 'ifc' as const,
  name: 'RPI IFC',
  title_key: 'vp_recruitment',
  accept_terms_privacy: true,
  ...over,
});

const seedOf = (create: jest.Mock): TenantSeed =>
  create.mock.calls[0][2] as TenantSeed;

describe('CouncilService.create', () => {
  it('creates a council at the school with its type, model and marker', async () => {
    const { service, chapterService, legal } = setup();

    await service.create(USER, input());

    const [userId, data] = chapterService.create.mock.calls[0];
    expect(userId).toBe(USER);
    expect(data).toMatchObject({
      name: 'RPI IFC',
      university: 'Rensselaer Polytechnic Institute',
      config: {
        kind: 'council',
        council_type: 'ifc',
        council_school_id: SCHOOL,
        recruitment_model: 'open_bidding',
        org_archetype: 'council',
        legal_accepted_by: USER,
      },
    });
    expect(legal.requireOrAccept).toHaveBeenCalledWith(USER, true);
  });

  it('seeds the IFC pack, and the founder holds Council admin and their title', async () => {
    const { service, chapterService } = setup();

    await service.create(USER, input());

    const seed = seedOf(chapterService.create);
    expect(seed.tiers.map((t) => t.name)).toEqual([
      'Executive board',
      'Officers',
      'Delegates',
    ]);
    expect(seed.roles.map((r) => r.name)).toEqual([
      'Council admin',
      'President',
      'VP Recruitment',
      'VP Judicial',
      'Treasurer',
      'Secretary',
      'Delegate',
      'Everyone',
    ]);
    const held = seed.roles.filter((role) => seed.founderAlsoHolds(role));
    // `ChapterService.create` adds the PRESIDENT-keyed Council admin itself.
    expect(held.map((r) => r.name)).toEqual(['VP Recruitment']);
    expect(
      seed.roles.find((r) => r.name === 'VP Recruitment')?.extra_permissions,
    ).toEqual(['council:recruitment_manage']);
  });

  it("adds the founder's own title to the Executive board", async () => {
    const { service, chapterService } = setup();

    await service.create(
      USER,
      input({ title_key: 'custom', custom_title: '  Recruitment   Chair ' }),
    );

    const seed = seedOf(chapterService.create);
    const own = seed.roles.find((r) => r.name === 'Recruitment Chair');
    expect(own).toMatchObject({
      starting_tier: 0,
      system_key: null,
      is_system: false,
    });
    expect(
      seed.roles.filter((r) => seed.founderAlsoHolds(r)).map((r) => r.name),
    ).toEqual(['Recruitment Chair']);
  });

  it('reads a custom title that matches a seeded one as that title', async () => {
    const { service, chapterService } = setup();

    await service.create(
      USER,
      input({ title_key: 'custom', custom_title: 'treasurer' }),
    );

    const seed = seedOf(chapterService.create);
    expect(
      seed.roles.filter((r) => r.name.toLowerCase() === 'treasurer'),
    ).toHaveLength(1);
    expect(
      seed.roles.filter((r) => seed.founderAlsoHolds(r)).map((r) => r.name),
    ).toEqual(['Treasurer']);
  });

  it('refuses a custom title that takes Council admin or Everyone', async () => {
    const { service } = setup();
    for (const title of ['Council admin', 'everyone']) {
      await expect(
        service.create(
          USER,
          input({ title_key: 'custom', custom_title: title }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('refuses a title key the pack does not offer', async () => {
    const { service } = setup();
    await expect(
      service.create(USER, input({ title_key: 'admin' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a founder not verified at the school, and an unknown or suspended school alike', async () => {
    const cases: [string, (s: ReturnType<typeof setup>) => void][] = [
      [
        'no membership',
        (s) => s.schoolRepo.findLiveMembership.mockResolvedValue(null),
      ],
      ['unknown school', (s) => s.schoolRepo.findById.mockResolvedValue(null)],
      [
        'suspended school',
        (s) =>
          s.schoolRepo.findById.mockResolvedValue({
            id: SCHOOL,
            name: 'x',
            short_name: 'x',
            status: 'suspended',
          }),
      ],
    ];
    for (const [, arrange] of cases) {
      const s = setup();
      arrange(s);
      const error = await s.service.create(USER, input()).catch((e) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'council.school_unverified',
      });
      expect(s.chapterService.create).not.toHaveBeenCalled();
    }
  });

  it('refuses a second council of the type at the school', async () => {
    const { service, chapterRepo, chapterService } = setup();
    chapterRepo.findCouncilBySchoolAndType.mockResolvedValue({ id: 'x' });

    const error = await service.create(USER, input()).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'council.type_taken',
    });
    expect(chapterService.create).not.toHaveBeenCalled();
  });

  it('never looks for a taken type for `other`', async () => {
    const { service, chapterRepo } = setup();
    chapterRepo.findCouncilBySchoolAndType.mockResolvedValue({ id: 'x' });

    await service.create(
      USER,
      input({ council_type: 'other', title_key: 'president' }),
    );

    expect(chapterRepo.findCouncilBySchoolAndType).not.toHaveBeenCalled();
  });

  it('answers a founder who lost the race with type_taken, from the unique index', async () => {
    const { service, chapterService } = setup();
    chapterService.create.mockRejectedValue({ code: '23505' });

    const error = await service.create(USER, input()).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'council.type_taken',
    });
  });

  it('shares the daily start ceiling with chapters', async () => {
    const { service, onboarding, chapterService } = setup();
    const refusal = new HttpException('limit', 429);
    onboarding.chapterStartRefusal.mockResolvedValue(refusal);

    await expect(service.create(USER, input())).rejects.toBe(refusal);
    expect(chapterService.create).not.toHaveBeenCalled();
  });
});

describe('councilSeed', () => {
  it('drops every council-recruitment key under the none model', () => {
    const seed = councilSeed(COUNCIL_PROFILES.ifc, 'none', {
      seededKey: 'vp_recruitment',
    });
    const keys = [
      ...seed.tiers.flatMap((t) => t.permissions),
      ...seed.roles.flatMap((r) => r.extra_permissions),
    ];
    expect(keys).not.toContain('council:recruitment_view');
    expect(keys).not.toContain('council:recruitment_manage');
    expect(keys).toContain('council:announce');
  });

  it('seeds Panhellenic with its Recruitment counselors tier', () => {
    const seed = councilSeed(COUNCIL_PROFILES.panhellenic, 'formal', {
      seededKey: 'president',
    });
    expect(seed.tiers.map((t) => t.name)).toEqual([
      'Executive board',
      'Officers',
      'Recruitment counselors',
      'Delegates',
    ]);
    expect(
      seed.roles.find((r) => r.name === 'Recruitment Counselor'),
    ).toMatchObject({ starting_tier: 2 });
  });

  it('keeps Council admin, Delegate and Everyone as system roles, and titles deletable', () => {
    const seed = councilSeed(COUNCIL_PROFILES.ifc, 'open_bidding', {
      seededKey: 'president',
    });
    const system = seed.roles
      .filter((r) => r.is_system)
      .map((r) => r.system_key);
    expect(system).toEqual(['PRESIDENT', 'MEMBER', 'EVERYONE']);
    expect(
      seed.roles.find((r) => r.system_key === 'EVERYONE')?.mentionable,
    ).toBe(false);
  });
});
