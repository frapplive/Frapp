import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  SCHOOL_CODE_LENGTH,
  SCHOOL_CODE_MAX_ATTEMPTS,
  SCHOOL_CODE_RESEND_SECONDS,
  SCHOOL_CODE_TTL_SECONDS,
  SCHOOL_CODE_WINDOW_SECONDS,
  SCHOOL_CODES_PER_ACCOUNT,
  SCHOOL_CODES_PER_ADDRESS,
  SCHOOL_CODES_PER_IP,
  SCHOOL_REFUSAL,
  SCHOOL_REFUSAL_COPY,
  SCHOOL_SEARCH_MIN_LENGTH,
  SCHOOL_STEP_COPY,
  isPlainSchoolEmail,
  schoolRateLimitedLine,
  schoolWrongDomainLine,
} from '@repo/validation';
import { EMAIL_PROVIDER } from '#domain/adapters/email.interface';
import type { IEmailProvider } from '#domain/adapters/email.interface';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '#domain/repositories/school.repository.interface';
import type {
  School,
  SchoolMember,
  SchoolMemberStatus,
} from '#domain/entities/school.entity';

/** A school as the onboarding step lists it. */
export interface SchoolSummary {
  id: string;
  name: string;
  short_name: string;
  slug: string | null;
  verifiable: boolean;
  email_domains: string[];
}

/** One of the caller's verified schools. */
export interface MySchool {
  school: SchoolSummary;
  status: SchoolMemberStatus;
  verified_email: string | null;
  verified_at: string;
}

/** A code that went out. */
export interface SentSchoolCode {
  email: string;
  expires_at: string;
  resend_after_seconds: number;
}

/** Search answers at most this many schools. */
export const SCHOOL_SEARCH_LIMIT = 20;

/** A salted SHA-256 of a code, hex. Exported for the specs. */
export function hashSchoolCode(salt: string, code: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

/**
 * The IP the ceilings count by, hashed so the raw address isn't in the table.
 * Unkeyed, so it isn't anonymous: every IPv4 address can be hashed and
 * matched. The rows go a day after they're made. Null when Express has none
 * (a test request), which skips the IP ceiling only.
 */
export function hashSchoolCodeIp(ip: string | undefined): string | null {
  const value = ip?.trim();
  if (!value) return null;
  return createHash('sha256').update(`school-code-ip:${value}`).digest('hex');
}

function unavailable(): ConflictException {
  return new ConflictException({
    code: SCHOOL_REFUSAL.unavailable,
    message: SCHOOL_STEP_COPY.notSetUp,
  });
}

/**
 * The school layer for a signed-in person (school-layer.md § 2.1, § 2.2,
 * #5929): finding their school, proving a school address by a one-time code,
 * and the school pages `SchoolGuard` serves.
 *
 * The code is sign-in's pattern (six digits typed on the screen that asked
 * for it), with its own ceilings: per address, per IP and per account over a
 * rolling hour, counted by the database under locks so they hold across API
 * replicas (`start_school_email_verification`). Only an address on one of
 * the school's verified domains is sent a code, and the database checks the
 * domain again when the code is typed.
 */
@Injectable()
export class SchoolService {
  private readonly logger = new Logger(SchoolService.name);

  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository,
    @Inject(EMAIL_PROVIDER) private readonly email: IEmailProvider,
  ) {}

  async search(query: string): Promise<SchoolSummary[]> {
    const text = query.trim();
    if (text.length < SCHOOL_SEARCH_MIN_LENGTH) return [];
    const rows = await this.schools.search(text, SCHOOL_SEARCH_LIMIT);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      short_name: row.short_name,
      slug: row.slug,
      verifiable: row.verifiable,
      email_domains: row.email_domains,
    }));
  }

  async listMine(userId: string): Promise<MySchool[]> {
    const memberships = await this.schools.findLiveMembershipsByUser(userId);
    if (!memberships.length) return [];
    const ids = memberships.map((m) => m.school_id);
    const [schools, slugs, domains] = await Promise.all([
      this.schools.findByIds(ids),
      this.schools.findCurrentSlugs(ids),
      this.schools.findVerifiedDomains(ids),
    ]);
    // A suspended school answers 404 everywhere else, so it isn't listed.
    const byId = new Map(
      schools
        .filter((s): s is School => !!s && s.status !== 'suspended')
        .map((s) => [s.id, s]),
    );
    return memberships.flatMap((membership) => {
      const school = byId.get(membership.school_id);
      if (!school) return [];
      return [this.toMySchool(membership, school, slugs, domains)];
    });
  }

  /**
   * Sends a code to a school address. Refused, before anything is sent, for
   * an unknown school (404), one that can't verify students yet (409), an
   * address off its domains (400) and any ceiling (429).
   */
  async startVerification(
    userId: string,
    schoolId: string,
    rawEmail: string,
    ip: string | undefined,
  ): Promise<SentSchoolCode> {
    const school = await this.requireSchool(schoolId);
    const email = rawEmail.trim().toLowerCase();
    const domains =
      (await this.schools.findVerifiedDomains([school.id])).get(school.id) ??
      [];
    if (school.status !== 'verified' || !domains.length) throw unavailable();
    // Only a plain `local@domain` address: a quoted local part could carry
    // a second `@` and name a domain other than the one mail goes to.
    if (!isPlainSchoolEmail(email)) {
      throw new BadRequestException({
        code: SCHOOL_REFUSAL.invalidEmail,
        message: SCHOOL_STEP_COPY.notAnEmail,
      });
    }

    const code = randomInt(0, 10 ** SCHOOL_CODE_LENGTH)
      .toString()
      .padStart(SCHOOL_CODE_LENGTH, '0');
    const salt = randomBytes(16).toString('hex');

    const result = await this.schools.startVerification({
      userId,
      schoolId: school.id,
      email,
      codeSalt: salt,
      codeHash: hashSchoolCode(salt, code),
      ipHash: hashSchoolCodeIp(ip),
      ttlSeconds: SCHOOL_CODE_TTL_SECONDS,
      windowSeconds: SCHOOL_CODE_WINDOW_SECONDS,
      maxPerAddress: SCHOOL_CODES_PER_ADDRESS,
      maxPerIp: SCHOOL_CODES_PER_IP,
      maxPerAccount: SCHOOL_CODES_PER_ACCOUNT,
      cooldownSeconds: SCHOOL_CODE_RESEND_SECONDS,
    });

    if (!result.ok || !result.expires_at) {
      switch (result.reason) {
        case 'wrong_domain':
          throw this.wrongDomain(school, domains);
        case 'school_not_verifiable':
          throw unavailable();
        case 'cooldown':
          throw new HttpException(
            {
              code: SCHOOL_REFUSAL.cooldown,
              message: schoolRateLimitedLine(result.retry_after_seconds ?? 60),
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        default:
          // address_limit, ip_limit, account_limit: one sentence for all
          // three, so the refusal doesn't say whose ceiling it is.
          throw new HttpException(
            {
              code: SCHOOL_REFUSAL.rateLimited,
              message: schoolRateLimitedLine(
                result.retry_after_seconds ?? SCHOOL_CODE_WINDOW_SECONDS,
              ),
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
      }
    }

    const sent = await this.email.sendSchoolCodeEmail({
      to: email,
      code,
      schoolName: school.name,
      validMinutes: Math.round(SCHOOL_CODE_TTL_SECONDS / 60),
    });
    if (!sent) {
      // Undo the row, so a provider outage neither spends the ceilings nor
      // hides the code already in the member's inbox, which stays the one
      // checked. A failed delete only leaves the row counting.
      if (result.id) {
        await this.schools
          .discardVerification(userId, result.id)
          .catch(() => undefined);
      }
      this.logger.warn(
        `School code email did not go out (school ${school.id})`,
      );
      throw new ServiceUnavailableException({
        code: SCHOOL_REFUSAL.sendFailed,
        message: SCHOOL_REFUSAL_COPY.sendFailed,
      });
    }

    return {
      email,
      expires_at: result.expires_at,
      resend_after_seconds: SCHOOL_CODE_RESEND_SECONDS,
    };
  }

  /**
   * Checks a typed code and, on a match, makes the caller a member of the
   * school. Each refusal says what to do next in plain words.
   */
  async confirmVerification(
    userId: string,
    schoolId: string,
    code: string,
  ): Promise<MySchool> {
    const school = await this.requireSchool(schoolId);
    // The newest code, open or closed: only it is checked, and a closed one
    // (exhausted, used) answers why it no longer works.
    const open = await this.schools.findLatestVerification(school.id, userId);
    if (!open) {
      throw new BadRequestException({
        code: SCHOOL_REFUSAL.noCode,
        message: SCHOOL_REFUSAL_COPY.noCode,
      });
    }

    const typed = code.trim();
    // Hashed with the row's salt here, so the typed code never reaches the
    // database; the function compares it and owns the try count.
    const codeHash = hashSchoolCode(open.code_salt, typed);
    const result = await this.schools.confirmVerification({
      userId,
      schoolId: school.id,
      verificationId: open.id,
      codeHash,
      maxAttempts: SCHOOL_CODE_MAX_ATTEMPTS,
    });

    if (!result.ok) {
      switch (result.reason) {
        case 'expired':
          throw new BadRequestException({
            code: SCHOOL_REFUSAL.expired,
            message: SCHOOL_REFUSAL_COPY.expired,
          });
        case 'too_many_attempts':
          throw new HttpException(
            {
              code: SCHOOL_REFUSAL.tooManyAttempts,
              message: SCHOOL_REFUSAL_COPY.tooManyAttempts,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        case 'wrong_code':
          throw new BadRequestException({
            code: SCHOOL_REFUSAL.wrongCode,
            message: SCHOOL_REFUSAL_COPY.wrongCode,
          });
        case 'address_taken':
          throw new ConflictException({
            code: SCHOOL_REFUSAL.emailTaken,
            message: SCHOOL_REFUSAL_COPY.emailTaken,
          });
        case 'school_not_verifiable':
          throw unavailable();
        default:
          throw new BadRequestException({
            code: SCHOOL_REFUSAL.noCode,
            message: SCHOOL_REFUSAL_COPY.noCode,
          });
      }
    }

    // The function just wrote it. A read that misses (a concurrent account
    // deletion) still answers what was written rather than an error, since
    // the code is spent and a retry would only say "Send a code first."
    const membership =
      (await this.schools.findLiveMembership(school.id, userId)) ??
      ({
        id: result.member_id ?? '',
        school_id: school.id,
        user_id: userId,
        status: 'member',
        verified_via: 'email_code',
        verified_email: open.email,
        verified_at: new Date().toISOString(),
        directory_visibility: 'hidden',
        left_at: null,
        created_at: new Date().toISOString(),
      } satisfies SchoolMember);
    const [slugs, domains] = await Promise.all([
      this.schools.findCurrentSlugs([school.id]),
      this.schools.findVerifiedDomains([school.id]),
    ]);
    return this.toMySchool(membership, school, slugs, domains);
  }

  /**
   * The school a campus page names, for one of its members. `SchoolGuard`
   * already checked the live membership it hands in.
   */
  async getForMember(membership: SchoolMember): Promise<MySchool> {
    const school = await this.requireSchool(membership.school_id);
    const [slugs, domains] = await Promise.all([
      this.schools.findCurrentSlugs([school.id]),
      this.schools.findVerifiedDomains([school.id]),
    ]);
    return this.toMySchool(membership, school, slugs, domains);
  }

  /**
   * Chapter setup's Find step matched a directory row (#5929): propose the
   * chapter's link to that row's school, for an officer to confirm later
   * (school-layer.md § 2.4, § 7 step 3). Returns the school id, or null when
   * the row's university has no school.
   */
  async proposeLinkFromDirectory(
    chapterId: string,
    directoryId: string,
    proposedBy: string,
  ): Promise<string | null> {
    const schoolId =
      await this.schools.findSchoolIdForDirectoryRow(directoryId);
    if (!schoolId) return null;
    await this.schools.proposeChapterLink(schoolId, chapterId, proposedBy);
    return schoolId;
  }

  private async requireSchool(schoolId: string): Promise<School> {
    const school = await this.schools.findById(schoolId);
    if (!school || school.status === 'suspended') {
      throw new NotFoundException({
        code: SCHOOL_REFUSAL.notFound,
        message: SCHOOL_REFUSAL_COPY.notFound,
      });
    }
    return school;
  }

  private wrongDomain(school: School, domains: string[]): BadRequestException {
    return new BadRequestException({
      code: SCHOOL_REFUSAL.wrongDomain,
      message: schoolWrongDomainLine(school.name, domains),
    });
  }

  private toMySchool(
    membership: SchoolMember,
    school: School,
    slugs: Map<string, string>,
    domains: Map<string, string[]>,
  ): MySchool {
    const schoolDomains = domains.get(school.id) ?? [];
    return {
      school: {
        id: school.id,
        name: school.name,
        short_name: school.short_name,
        slug: slugs.get(school.id) ?? null,
        verifiable: school.status === 'verified' && schoolDomains.length > 0,
        email_domains: schoolDomains,
      },
      status: membership.status,
      verified_email: membership.verified_email,
      verified_at: membership.verified_at,
    };
  }
}
