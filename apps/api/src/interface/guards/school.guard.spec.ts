import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  type ExecutionContext,
} from '@nestjs/common';
import { SchoolGuard } from './school.guard';
import type { FrappSupabaseClient } from '../../infrastructure/supabase/database.types';
import type { RequestContext } from '../types/request-context.types';

const SCHOOL = 'd1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1';

type Answer = { data: unknown; error: unknown };

/** A client whose reads answer, per table, what the test hands it. */
function client(answers: Record<string, Answer>): FrappSupabaseClient {
  const builder = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: () => Promise.resolve(answers[table]),
    };
    return chain;
  };
  return { from: jest.fn(builder) } as unknown as FrappSupabaseClient;
}

function context(request: Partial<RequestContext>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const member = {
  id: 'm-1',
  school_id: SCHOOL,
  user_id: 'u-1',
  status: 'member',
  left_at: null,
};

describe('SchoolGuard', () => {
  const ok = {
    users: { data: { id: 'u-1' }, error: null },
    school_members: { data: member, error: null },
    schools: { data: { status: 'verified' }, error: null },
  };

  it('serves a live member and attaches the school and membership', async () => {
    const request: Partial<RequestContext> = {
      supabaseUser: { id: 'auth-1' } as RequestContext['supabaseUser'],
      headers: { 'x-school-id': SCHOOL },
    };

    await expect(
      new SchoolGuard(client(ok)).canActivate(context(request)),
    ).resolves.toBe(true);
    expect(request.schoolId).toBe(SCHOOL);
    expect(request.schoolMember).toEqual(member);
    expect(request.appUser).toEqual({ id: 'u-1' });
  });

  it('answers 400 without the header', async () => {
    await expect(
      new SchoolGuard(client(ok)).canActivate(
        context({
          supabaseUser: { id: 'auth-1' } as RequestContext['supabaseUser'],
          headers: {},
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 403 for a non-member', async () => {
    await expect(
      new SchoolGuard(
        client({ ...ok, school_members: { data: null, error: null } }),
      ).canActivate(
        context({
          supabaseUser: { id: 'auth-1' } as RequestContext['supabaseUser'],
          headers: { 'x-school-id': SCHOOL },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['users', 'school_members', 'schools'])(
    'answers 503, not a refusal, when the %s lookup fails (#3143)',
    async (table) => {
      await expect(
        new SchoolGuard(
          client({
            ...ok,
            [table]: { data: null, error: { message: 'down' } },
          }),
        ).canActivate(
          context({
            supabaseUser: { id: 'auth-1' } as RequestContext['supabaseUser'],
            headers: { 'x-school-id': SCHOOL },
          }),
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    },
  );
});
