import type {
  ConfirmSchoolVerificationResult,
  School,
  SchoolEmailVerification,
  SchoolMember,
  SchoolSearchRow,
  StartSchoolVerificationResult,
} from '../entities/school.entity';

export const SCHOOL_REPOSITORY = 'SCHOOL_REPOSITORY';

export interface StartSchoolVerificationInput {
  userId: string;
  schoolId: string;
  email: string;
  codeSalt: string;
  codeHash: string;
  ipHash: string | null;
  ttlSeconds: number;
  windowSeconds: number;
  maxPerAddress: number;
  maxPerIp: number;
  maxPerAccount: number;
  cooldownSeconds: number;
}

export interface ConfirmSchoolVerificationInput {
  userId: string;
  schoolId: string;
  verificationId: string;
  codeHash: string;
  maxAttempts: number;
}

/**
 * The school layer (school-layer.md § 2.1, § 2.2, #5929). Schools are global
 * reference data; everything about a person is scoped by their user id, and
 * a person's verification by user and school together.
 */
export interface ISchoolRepository {
  /** Schools by name, short name or alias, best match first. */
  search(query: string, limit: number): Promise<SchoolSearchRow[]>;
  findById(schoolId: string): Promise<School | null>;
  /** The current slug of each of these schools that has one, by school id. */
  findCurrentSlugs(schoolIds: string[]): Promise<Map<string, string>>;
  /** The verified domains of each of these schools, by school id. */
  findVerifiedDomains(schoolIds: string[]): Promise<Map<string, string[]>>;
  /** The user's live memberships (no `left_at`), newest first. */
  findLiveMembershipsByUser(userId: string): Promise<SchoolMember[]>;
  /** The user's live membership at one school, or null. */
  findLiveMembership(
    schoolId: string,
    userId: string,
  ): Promise<SchoolMember | null>;
  /** The user's newest open code at the school, or null. */
  findOpenVerification(
    schoolId: string,
    userId: string,
  ): Promise<Pick<
    SchoolEmailVerification,
    'id' | 'email' | 'code_salt' | 'expires_at'
  > | null>;
  startVerification(
    input: StartSchoolVerificationInput,
  ): Promise<StartSchoolVerificationResult>;
  confirmVerification(
    input: ConfirmSchoolVerificationInput,
  ): Promise<ConfirmSchoolVerificationResult>;
  /** The school seeded from a directory row's university, or null. */
  findSchoolIdForDirectoryRow(directoryId: string): Promise<string | null>;
  /**
   * Proposes a chapter's link to its school (§ 2.4, minimal). Does nothing
   * when the pair already has a live link.
   */
  proposeChapterLink(
    schoolId: string,
    chapterId: string,
    proposedBy: string,
  ): Promise<void>;
}
