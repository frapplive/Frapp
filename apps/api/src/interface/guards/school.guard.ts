import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { SCHOOL_REFUSAL, SCHOOL_REFUSAL_COPY } from '@repo/validation';
import { SUPABASE_CLIENT } from '../../infrastructure/supabase/supabase.provider';
import type { FrappSupabaseClient } from '../../infrastructure/supabase/database.types';
import { SupabaseQueryError } from '../../infrastructure/supabase/supabase-query-error';
import { SCHOOL_MEMBER_COLUMNS } from '../../infrastructure/supabase/repositories/supabase-school.repository';
import type { SchoolMember } from '#domain/entities/school.entity';
import {
  authUserIdOf,
  getHeaderValue,
  type RequestContext,
} from '../types/request-context.types';
import { lookupUnavailable } from './guard-lookup';

/** The header a campus page sends (ADR-27 decision 3). */
export const SCHOOL_HEADER = 'x-school-id';

const LOOKUP_FAILED = 'Could not verify your school membership right now';

const UUID_PATTERN = new RegExp(
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  'i',
);

/** The refusal for a school the caller may not act in, whatever the reason. */
function notAMember(): ForbiddenException {
  return new ForbiddenException({
    code: SCHOOL_REFUSAL.contextInvalid,
    message: SCHOOL_REFUSAL_COPY.contextInvalid,
  });
}

/**
 * Campus pages aren't chapter tenants (ADR-27 decision 3,
 * `spec/architecture/school-layer.md` § 4.2): a `/s/<school>` request names
 * its school in `x-school-id`, and this guard serves it only to a live
 * member of that school, a `school_members` row with no `left_at`, at a
 * school that isn't suspended.
 *
 * - **No header:** `400 school.context.required`. There is no default the way
 *   `ChapterGuard` has the token's claim, because nothing chooses a school
 *   for a person.
 * - **A malformed id, an unknown school, a suspended one, or one the caller
 *   isn't verified at:** the same `403 school.context.invalid`, so the
 *   response never says whether an id is a school.
 * - **A lookup that fails:** 503, never a refusal (#3143).
 *
 * It runs after `SupabaseAuthGuard` and never beside `ChapterGuard`
 * (`route-access-ledger.spec.ts`). It sets `request.appUser`,
 * `request.schoolId` and `request.schoolMember`, and reads nothing from any
 * chapter. Frapp staff, whom the campus-spaces design admits at every school,
 * have no platform identity yet, so it admits nobody else.
 */
@Injectable()
export class SchoolGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: FrappSupabaseClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestContext>();
    const authId = authUserIdOf(request);
    if (!authId) throw notAMember();

    const schoolId = getHeaderValue(request.headers, SCHOOL_HEADER)?.trim();
    if (!schoolId) {
      throw new BadRequestException({
        code: SCHOOL_REFUSAL.contextRequired,
        message: SCHOOL_REFUSAL_COPY.contextRequired,
      });
    }
    if (!UUID_PATTERN.test(schoolId)) throw notAMember();

    const user = await this.supabase
      .from('users')
      .select('id')
      .eq('supabase_auth_id', authId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string }>();
    if (user.error) {
      throw lookupUnavailable(
        LOOKUP_FAILED,
        new SupabaseQueryError(user.error),
      );
    }
    if (!user.data) throw notAMember();

    const [member, school] = await Promise.all([
      this.supabase
        .from('school_members')
        .select(SCHOOL_MEMBER_COLUMNS)
        .eq('school_id', schoolId)
        .eq('user_id', user.data.id)
        .is('left_at', null)
        .maybeSingle(),
      this.supabase
        .from('schools')
        .select('status')
        .eq('id', schoolId)
        .maybeSingle(),
    ]);
    const failed = member.error ?? school.error;
    if (failed) {
      throw lookupUnavailable(LOOKUP_FAILED, new SupabaseQueryError(failed));
    }
    if (!member.data || !school.data || school.data.status === 'suspended') {
      throw notAMember();
    }

    request.appUser = { ...(request.appUser ?? {}), id: user.data.id };
    request.schoolId = schoolId;
    request.schoolMember = member.data satisfies SchoolMember;
    return true;
  }
}
