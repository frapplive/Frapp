import { Inject, Injectable } from '@nestjs/common';
import { SUPABASE_CLIENT } from '../supabase.provider';
import type { FrappSupabaseClient } from '../database.types';
import { SupabaseQueryError } from '../supabase-query-error';
import { PG_UNIQUE_VIOLATION } from '#domain/constants/postgres-error-codes';
import type {
  ConfirmSchoolVerificationInput,
  ISchoolRepository,
  StartSchoolVerificationInput,
} from '#domain/repositories/school.repository.interface';
import type {
  ConfirmSchoolVerificationResult,
  School,
  SchoolEmailVerification,
  SchoolMember,
  SchoolSearchRow,
  StartSchoolVerificationResult,
} from '#domain/entities/school.entity';

const MEMBER_COLUMNS =
  'id, school_id, user_id, status, verified_via, verified_email, verified_at, directory_visibility, left_at, created_at';

/**
 * The school layer's reads and writes (#5929). Every per-person query filters
 * on the person's user id, and a code on user and school together; the two
 * code functions recheck both themselves.
 */
@Injectable()
export class SupabaseSchoolRepository implements ISchoolRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: FrappSupabaseClient,
  ) {}

  async search(query: string, limit: number): Promise<SchoolSearchRow[]> {
    const { data, error } = await this.supabase.rpc('search_schools', {
      p_query: query,
      p_limit: limit,
    });
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async findById(schoolId: string): Promise<School | null> {
    const { data, error } = await this.supabase
      .from('schools')
      .select(
        'id, name, short_name, aliases, status, directory_university, created_by, created_at, updated_at',
      )
      .eq('id', schoolId)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async findCurrentSlugs(schoolIds: string[]): Promise<Map<string, string>> {
    const slugs = new Map<string, string>();
    if (!schoolIds.length) return slugs;
    const { data, error } = await this.supabase
      .from('school_slugs')
      .select('slug, school_id')
      .in('school_id', schoolIds)
      .is('retired_at', null);
    if (error) throw new SupabaseQueryError(error);
    for (const row of data ?? []) {
      if (row.school_id) slugs.set(row.school_id, row.slug);
    }
    return slugs;
  }

  async findVerifiedDomains(
    schoolIds: string[],
  ): Promise<Map<string, string[]>> {
    const domains = new Map<string, string[]>();
    if (!schoolIds.length) return domains;
    const { data, error } = await this.supabase
      .from('school_email_domains')
      .select('school_id, domain')
      .in('school_id', schoolIds)
      .eq('status', 'verified')
      .order('domain');
    if (error) throw new SupabaseQueryError(error);
    for (const row of data ?? []) {
      domains.set(row.school_id, [
        ...(domains.get(row.school_id) ?? []),
        row.domain,
      ]);
    }
    return domains;
  }

  async findLiveMembershipsByUser(userId: string): Promise<SchoolMember[]> {
    const { data, error } = await this.supabase
      .from('school_members')
      .select(MEMBER_COLUMNS)
      .eq('user_id', userId)
      .is('left_at', null)
      .order('verified_at', { ascending: false });
    if (error) throw new SupabaseQueryError(error);
    return data ?? [];
  }

  async findLiveMembership(
    schoolId: string,
    userId: string,
  ): Promise<SchoolMember | null> {
    const { data, error } = await this.supabase
      .from('school_members')
      .select(MEMBER_COLUMNS)
      .eq('school_id', schoolId)
      .eq('user_id', userId)
      .is('left_at', null)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async findOpenVerification(
    schoolId: string,
    userId: string,
  ): Promise<Pick<
    SchoolEmailVerification,
    'id' | 'email' | 'code_salt' | 'expires_at'
  > | null> {
    const { data, error } = await this.supabase
      .from('school_email_verifications')
      .select('id, email, code_salt, expires_at')
      .eq('school_id', schoolId)
      .eq('user_id', userId)
      .is('closed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    return data;
  }

  async startVerification(
    input: StartSchoolVerificationInput,
  ): Promise<StartSchoolVerificationResult> {
    const { data, error } = await this.supabase.rpc(
      'start_school_email_verification',
      {
        p_user_id: input.userId,
        p_school_id: input.schoolId,
        p_email: input.email,
        p_code_salt: input.codeSalt,
        p_code_hash: input.codeHash,
        p_ip_hash: input.ipHash,
        p_ttl_seconds: input.ttlSeconds,
        p_window_seconds: input.windowSeconds,
        p_max_per_address: input.maxPerAddress,
        p_max_per_ip: input.maxPerIp,
        p_max_per_account: input.maxPerAccount,
        p_cooldown_seconds: input.cooldownSeconds,
      },
    );
    if (error) throw new SupabaseQueryError(error);
    return data as unknown as StartSchoolVerificationResult;
  }

  async confirmVerification(
    input: ConfirmSchoolVerificationInput,
  ): Promise<ConfirmSchoolVerificationResult> {
    const { data, error } = await this.supabase.rpc(
      'confirm_school_email_verification',
      {
        p_user_id: input.userId,
        p_school_id: input.schoolId,
        p_verification_id: input.verificationId,
        p_code_hash: input.codeHash,
        p_max_attempts: input.maxAttempts,
      },
    );
    if (error) throw new SupabaseQueryError(error);
    return data as unknown as ConfirmSchoolVerificationResult;
  }

  async findSchoolIdForDirectoryRow(
    directoryId: string,
  ): Promise<string | null> {
    const { data: row, error } = await this.supabase
      .from('chapter_directory')
      .select('university, source')
      .eq('id', directoryId)
      .maybeSingle();
    if (error) throw new SupabaseQueryError(error);
    if (!row || row.source === 'retired') return null;
    const { data: school, error: schoolError } = await this.supabase
      .from('schools')
      .select('id')
      .eq('directory_university', row.university)
      .maybeSingle();
    if (schoolError) throw new SupabaseQueryError(schoolError);
    return school?.id ?? null;
  }

  async proposeChapterLink(
    schoolId: string,
    chapterId: string,
    proposedBy: string,
  ): Promise<void> {
    const { error } = await this.supabase.from('school_chapters').insert({
      school_id: schoolId,
      chapter_id: chapterId,
      status: 'proposed',
      proposed_by: proposedBy,
    });
    // The pair already has a live link (`school_chapters_live_pair`).
    if (error && error.code !== PG_UNIQUE_VIOLATION) {
      throw new SupabaseQueryError(error);
    }
  }
}
