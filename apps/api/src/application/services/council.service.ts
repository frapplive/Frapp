import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  COUNCIL_ARCHETYPE,
  councilEnabledModules,
  COUNCIL_CUSTOM_TITLE_KEY,
  COUNCIL_NAME_MAX,
  COUNCIL_SCHOOL_UNVERIFIED_CODE,
  COUNCIL_TYPE_TAKEN_CODE,
  COUNCIL_TITLE_MAX,
  councilProfile,
  defaultRecruitmentModel,
  keysForRecruitmentModel,
  reservedMentionName,
  type CouncilProfile,
  type CouncilType,
  type RecruitmentModel,
} from '@repo/validation';
import { MODULE_CATALOG } from '@repo/org-archetypes';
import {
  CHAPTER_REPOSITORY,
  type IChapterRepository,
} from '#domain/repositories/chapter.repository.interface';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '#domain/repositories/school.repository.interface';
import type { Chapter } from '#domain/entities/chapter.entity';
import { LEGAL_POLICY_VERSION } from '#domain/constants/legal';
import { PG_CHAPTER_START_LIMIT } from '#domain/constants/postgres-error-codes';
import {
  ChapterService,
  type TenantSeed,
  type TenantSeedChannel,
  type TenantSeedRole,
} from './chapter.service';
import { ChapterOnboardingService } from './chapter-onboarding.service';
import { LegalAcceptanceService } from './legal-acceptance.service';
import {
  buildChapterPalette,
  chapterPaletteColumns,
  logChapterPaletteWarnings,
} from './chapter-palette';

/** `POST /v1/councils`' input, validated by `CreateCouncilDto`. */
export interface CreateCouncilInput {
  school_id: string;
  council_type: CouncilType;
  name: string;
  /** A seeded title's `key` from the type's pack, or `custom`. */
  title_key: string;
  /** The founder's own title, with `title_key: 'custom'`. */
  custom_title?: string;
  /** As chapter onboarding's: the founder agrees for the council too. */
  accept_terms_privacy: boolean;
}

/** What a council member reads about their council (`GET /v1/council`). */
export interface CouncilProfileView {
  id: string;
  name: string;
  council_type: CouncilType;
  recruitment_model: RecruitmentModel;
  verified: boolean;
  school: { id: string; name: string; short_name: string } | null;
}

const UNIQUE_VIOLATION = '23505';

/**
 * Who a council's seeded channels name: everyone sees and posts in
 * `#general`; the Executive board and Officers (the top two tiers, as a
 * chapter's) post in `#announcements`. No `#alumni`: a council has no Alumni
 * role (`school-layer.md` § 5.3).
 */
const COUNCIL_CHANNELS: readonly TenantSeedChannel[] = [
  {
    name: 'general',
    description: "The whole council. Plans, questions, whatever's going on.",
    who_can_see: null,
    who_can_post: null,
  },
  {
    name: 'announcements',
    description: 'News from council officers. Everyone gets notified.',
    who_can_see: null,
    who_can_post: { tiers: [0, 1] },
  },
];

/**
 * Creates councils (#5933): a `chapters` row with `kind = 'council'`
 * (ADR-27 decision 3, `school-layer.md` § 2.3), seeded with its type's role
 * pack through the same `ChapterService.create` a chapter uses, so a council
 * runs like a chapter with titles the council names (Winston, 2026-11-24).
 *
 * The founder must hold a live verified membership at the school, and the
 * school may have no council of the type yet (`other` aside). The council
 * starts unverified (`council_verified_at` null); nothing in this slice reads
 * it, and who verifies is ⚑ Q4 (`school-layer.md` § 8).
 */
@Injectable()
export class CouncilService {
  private readonly logger = new Logger(CouncilService.name);

  constructor(
    private readonly chapterService: ChapterService,
    private readonly onboarding: ChapterOnboardingService,
    private readonly legalAcceptance: LegalAcceptanceService,
    @Inject(CHAPTER_REPOSITORY)
    private readonly chapterRepo: IChapterRepository,
    @Inject(SCHOOL_REPOSITORY)
    private readonly schoolRepo: ISchoolRepository,
  ) {}

  async create(userId: string, input: CreateCouncilInput): Promise<Chapter> {
    const name = input.name.trim();
    if (!name || name.length > COUNCIL_NAME_MAX) {
      throw new BadRequestException(
        `A council's name is 1 to ${COUNCIL_NAME_MAX} characters.`,
      );
    }
    const profile = councilProfile(input.council_type);
    const founderTitle = this.founderTitle(profile, input);

    const school = await this.schoolRepo.findById(input.school_id);
    const membership = school
      ? await this.schoolRepo.findLiveMembership(school.id, userId)
      : null;
    // An unknown or suspended school reads as one the founder isn't verified
    // at, so the refusal says nothing about which schools exist.
    if (!school || school.status === 'suspended' || !membership) {
      throw new ForbiddenException({
        code: COUNCIL_SCHOOL_UNVERIFIED_CODE,
        message: 'Verify your school email at this school to start a council.',
      });
    }

    if (
      input.council_type !== 'other' &&
      (await this.chapterRepo.findCouncilBySchoolAndType(
        school.id,
        input.council_type,
      ))
    ) {
      throw this.typeTaken(profile);
    }

    const refusal = await this.onboarding.chapterStartRefusal(userId);
    if (refusal) throw refusal;
    await this.legalAcceptance.requireOrAccept(
      userId,
      input.accept_terms_privacy,
    );

    const model = defaultRecruitmentModel(input.council_type);
    const build = buildChapterPalette({});
    logChapterPaletteWarnings(
      this.logger,
      'creating a council',
      undefined,
      build,
    );

    return this.chapterService
      .create(
        userId,
        {
          name,
          university: school.name,
          config: {
            kind: 'council',
            council_type: input.council_type,
            council_school_id: school.id,
            recruitment_model: model,
            org_archetype: COUNCIL_ARCHETYPE,
            enabled_modules: councilEnabledModules(
              MODULE_CATALOG.map((entry) => entry.key),
            ),
            legal_accepted_at: new Date().toISOString(),
            legal_policy_version: LEGAL_POLICY_VERSION,
            legal_accepted_by: userId,
            ...chapterPaletteColumns(build),
          },
        },
        councilSeed(profile, model, founderTitle),
      )
      .catch(async (error: unknown) => {
        const code = (error as { code?: unknown })?.code;
        // Two founders of the same type at once: the unique index holds.
        if (code === UNIQUE_VIOLATION) throw this.typeTaken(profile);
        if (code === PG_CHAPTER_START_LIMIT) {
          throw (
            (await this.onboarding.chapterStartRefusal(userId)) ??
            this.onboarding.startLimitException(
              new Date(Date.now() + 60_000),
              new Date(),
            )
          );
        }
        throw error;
      });
  }

  /** `GET /v1/council`: the active council's own profile. */
  async getProfile(councilId: string): Promise<CouncilProfileView> {
    const council = await this.chapterRepo.findById(councilId);
    if (
      !council ||
      council.kind !== 'council' ||
      !council.council_type ||
      !council.recruitment_model
    ) {
      // `ChapterGuard` served this route only for a council, so this is a
      // row the constraint should have made impossible.
      throw new NotFoundException('Council not found');
    }
    const school = council.council_school_id
      ? await this.schoolRepo.findById(council.council_school_id)
      : null;
    return {
      id: council.id,
      name: council.name,
      council_type: council.council_type,
      recruitment_model: council.recruitment_model,
      verified: council.council_verified_at != null,
      school: school
        ? { id: school.id, name: school.name, short_name: school.short_name }
        : null,
    };
  }

  /**
   * The founder's title: a seeded one by key, or their own, which seeds a new
   * role in the Executive board (`school-layer.md` § 5.3 "Picking a role").
   * Their own matching a seeded title's name picks that title.
   */
  private founderTitle(
    profile: CouncilProfile,
    input: CreateCouncilInput,
  ): FounderTitle {
    if (input.title_key !== COUNCIL_CUSTOM_TITLE_KEY) {
      const seeded = profile.roles.find(
        (role) => role.pickable && role.key === input.title_key,
      );
      if (!seeded) {
        throw new BadRequestException('Pick one of the titles offered.');
      }
      return { seededKey: seeded.key };
    }
    const title = (input.custom_title ?? '').trim().replace(/\s+/g, ' ');
    if (!title || title.length > COUNCIL_TITLE_MAX) {
      throw new BadRequestException(
        `Your title is 1 to ${COUNCIL_TITLE_MAX} characters.`,
      );
    }
    const same = profile.roles.find(
      (role) => role.name.toLowerCase() === title.toLowerCase(),
    );
    if (same?.pickable) return { seededKey: same.key };
    if (same || reservedMentionName(title) !== null) {
      throw new ConflictException({
        code: 'role.everyone_name',
        message: `"${title}" is taken. Pick another title.`,
      });
    }
    return { customName: title };
  }

  private typeTaken(profile: CouncilProfile): ConflictException {
    return new ConflictException({
      code: COUNCIL_TYPE_TAKEN_CODE,
      message: `Your school's ${profile.label} is already on Frapp. Ask its officers for an invite.`,
    });
  }
}

type FounderTitle = { seededKey: string } | { customName: string };

/**
 * A council's {@link TenantSeed}: its type's tiers and roles, with the
 * `council-recruitment` keys dropped under the `none` model, the founder's
 * own title added to the Executive board when they named one, and the
 * founder holding Council admin (the seed's `PRESIDENT`) and their title.
 */
export function councilSeed(
  profile: CouncilProfile,
  model: RecruitmentModel,
  founder: FounderTitle,
): TenantSeed {
  const roles: TenantSeedRole[] = profile.roles.map((role, index) => ({
    name: role.name,
    system_key: role.systemKey,
    starting_tier: role.tier,
    extra_permissions: keysForRecruitmentModel(role.extraPermissions, model),
    // A seeded key makes a role one the council can rename and never
    // delete, as a chapter's; a plain title is the council's to delete.
    is_system: role.systemKey !== null,
    display_order: index + 1,
    color: null,
    ...(role.systemKey === 'EVERYONE' ? { mentionable: false } : {}),
  }));
  const founderName =
    'customName' in founder
      ? founder.customName
      : profile.roles.find((role) => role.key === founder.seededKey)!.name;
  if ('customName' in founder) {
    roles.push({
      name: founder.customName,
      system_key: null,
      starting_tier: 0,
      extra_permissions: [],
      is_system: false,
      display_order: roles.length + 1,
      color: null,
    });
  }
  return {
    tiers: profile.tiers.map((tier) => ({
      name: tier.name,
      permissions: keysForRecruitmentModel(tier.permissions, model),
    })),
    roles,
    channels: COUNCIL_CHANNELS,
    founderAlsoHolds: (role) =>
      role.system_key === null && role.name === founderName,
  };
}
