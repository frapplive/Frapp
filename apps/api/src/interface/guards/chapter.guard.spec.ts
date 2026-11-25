import {
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseQueryError } from '../../infrastructure/supabase/supabase-query-error';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ChapterGuard, prefetchChapterContext } from './chapter.guard';
import {
  runWithRequestReads,
  sealRequestReadsForWrites,
} from '../../infrastructure/supabase/request-reads';
import { SUPABASE_CLIENT } from '../../infrastructure/supabase/supabase.provider';
import { readMemberByUserAndChapter } from '../../infrastructure/supabase/repositories/supabase-member.repository';
import { readRolesByIds } from '../../infrastructure/supabase/repositories/supabase-role.repository';
import {
  SUBSCRIPTION_EXEMPT_KEY,
  SUBSCRIPTION_FREE_TIER_KEY,
  SUBSCRIPTION_GRACE_BLOCKED_KEY,
} from '../decorators/subscription.decorator';
import { REQUIRED_MODULE_KEY } from '../decorators/module.decorator';
import { TENANT_KINDS_KEY } from '../decorators/tenant-kinds.decorator';
import { moduleRefusalFromServerMessage } from '@repo/validation';
import type { SubscriptionStatus } from '#domain/entities/chapter.entity';
import * as Sentry from '@sentry/nestjs';

jest.mock('@sentry/nestjs', () => ({
  ...jest.requireActual<typeof import('@sentry/nestjs')>('@sentry/nestjs'),
  captureException: jest.fn(),
}));

describe('ChapterGuard', () => {
  let guard: ChapterGuard;
  let reflector: Reflector;
  let mockFrom: jest.Mock;

  const buildRequest = (overrides: Record<string, unknown> = {}) => ({
    headers: { 'x-chapter-id': '11111111-1111-4111-8111-111111111111' },
    method: 'GET',
    supabaseUser: { id: 'auth-123' },
    jwtClaims: undefined as unknown,
    appUser: undefined as unknown,
    member: undefined as unknown,
    chapterId: undefined as unknown,
    subscriptionStatus: undefined as unknown,
    enabledModules: undefined as unknown,
    ...overrides,
  });

  const mockExecutionContext = (
    request: ReturnType<typeof buildRequest>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    }) as unknown as ExecutionContext;

  const mockSupabaseChain = ({
    appUser,
    member,
    chapter,
    memberships,
    errors = {},
  }: {
    /** A lookup that fails rather than finding nothing (#3143), by table. */
    errors?: Partial<
      Record<
        'users' | 'members' | 'chapters' | 'memberships' | 'servedTenants',
        { code: string; message: string }
      >
    >;
    appUser?: { id: string } | null;
    member?: {
      id: string;
      role_ids: string[];
    } | null;
    chapter?: {
      subscription_status: SubscriptionStatus;
      past_due_since?: string | null;
      enabled_modules?: Record<string, boolean> | null;
      /** `chapters.kind`; `chapter` when left out, as the column defaults. */
      kind?: string;
    } | null;
    /**
     * Rows returned by the auto-resolve lookup (`.eq(user_id)`), each with
     * its tenant's kind (`chapter` when left out), which the follow-up
     * `chapters` read (`.in(id).in(kind).limit(2)`) filters on (#5933).
     */
    memberships?: Array<{
      id: string;
      role_ids: string[];
      chapter_id: string;
      kind?: string;
    }>;
  }) => {
    let callCount = 0;
    const selectArgs: Record<string, string[]> = {};
    const isArgs: Record<string, Array<[string, unknown]>> = {};
    const eqArgs: Record<string, Array<[string, unknown]>> = {};
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      const data =
        table === 'users'
          ? appUser
          : table === 'members'
            ? member
            : chapter && { kind: 'chapter', ...chapter };
      const eqMock: jest.Mock = jest.fn();
      const error = errors[table as 'users' | 'members' | 'chapters'];
      const maybeSingle = jest
        .fn()
        .mockResolvedValue(
          error ? { data: null, error } : { data: data ?? null, error: null },
        );
      const membershipRows = errors.memberships
        ? { data: null, error: errors.memberships }
        : {
            data: (memberships ?? []).map(({ kind: _kind, ...row }) => row),
            error: null,
          };
      // The sole-tenant read of `chapters`: the memberships' tenants whose
      // kind the route serves.
      const inFilters: Record<string, unknown[]> = {};
      const servedTenants = () => ({
        data: (memberships ?? [])
          .filter(
            (row) =>
              (inFilters.id ?? []).includes(row.chapter_id) &&
              (inFilters.kind ?? []).includes(row.kind ?? 'chapter'),
          )
          .slice(0, 2)
          .map((row) => ({ id: row.chapter_id })),
        error: errors.servedTenants ?? null,
      });
      const limit = jest.fn(() => Promise.resolve(servedTenants()));
      const inMock: jest.Mock = jest.fn((column: string, values: unknown[]) => {
        inFilters[column] = values;
        return { in: inMock, limit };
      });
      // chapters and users use one .eq; members uses either two .eq calls
      // (explicit chapter) or one .eq + .limit (auto-resolve).
      // users adds `.is('deleted_at', null)` before `.maybeSingle` (#5043).
      const isMock = jest.fn((column: string, value: unknown) => {
        (isArgs[table] ??= []).push([column, value]);
        return { maybeSingle };
      });
      eqMock.mockImplementation((column: string, value: unknown) => {
        (eqArgs[table] ??= []).push([column, value]);
        return {
          eq: eqMock,
          is: isMock,
          maybeSingle,
          // The auto-resolve read of `members` is awaited as it stands.
          then: (
            resolve: (value: unknown) => unknown,
            reject?: (reason: unknown) => unknown,
          ) => Promise.resolve(membershipRows).then(resolve, reject),
        };
      });
      return {
        select: jest.fn().mockImplementation((columns: string) => {
          (selectArgs[table] ??= []).push(columns);
          return { eq: eqMock, in: inMock };
        }),
      };
    });
    return { callCount: () => callCount, selectArgs, isArgs, eqArgs };
  };

  beforeEach(async () => {
    mockFrom = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChapterGuard,
        Reflector,
        {
          provide: SUPABASE_CLIENT,
          useValue: { from: mockFrom },
        },
      ],
    }).compile();

    guard = module.get(ChapterGuard);
    reflector = module.get(Reflector);
  });

  // ADR-27 decision 3 (#5918): an explicit `x-chapter-id` header is
  // authoritative and the JWT claim is a default. The membership check on the
  // resolved chapter is the tenant boundary either way.
  describe('chapter context resolution', () => {
    const membership = (chapterId: string) => ({
      id: `member-${chapterId}`,
      role_ids: ['role-1'],
      chapter_id: chapterId,
    });

    it('serves the header’s chapter when it disagrees with the JWT claim', async () => {
      const { eqArgs } = mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active' },
      });
      const request = buildRequest({
        headers: { 'x-chapter-id': 'abcdef00-0000-4000-8000-0000000000aa' },
        jwtClaims: {
          active_chapter_id: 'bcdef000-0000-4000-8000-0000000000bb',
        },
      });

      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
      expect(request.chapterId).toBe('abcdef00-0000-4000-8000-0000000000aa');
      // The membership checked is the header's chapter's, not the claim's.
      expect(eqArgs.members).toContainEqual([
        'chapter_id',
        'abcdef00-0000-4000-8000-0000000000aa',
      ]);
      expect(JSON.stringify(eqArgs)).not.toContain(
        'bcdef000-0000-4000-8000-0000000000bb',
      );
    });

    it('refuses the header’s chapter for a non-member whatever the claim says', async () => {
      mockSupabaseChain({ appUser: { id: 'user-1' }, member: null });
      const ctx = mockExecutionContext(
        buildRequest({
          headers: { 'x-chapter-id': 'abcdef00-0000-4000-8000-0000000000aa' },
          jwtClaims: {
            active_chapter_id: 'bcdef000-0000-4000-8000-0000000000bb',
          },
        }),
      );

      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: { code: 'chapter.context.invalid' },
        status: 403,
      });
    });

    it('lets the JWT claim win when the header is absent', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active' },
      });
      const request = buildRequest({
        headers: {},
        jwtClaims: {
          active_chapter_id: 'bcdef000-0000-4000-8000-0000000000bb',
        },
      });

      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
      expect(request.chapterId).toBe('bcdef000-0000-4000-8000-0000000000bb');
    });

    it('auto-resolves a single-chapter user carrying no context at all', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        memberships: [membership('dddddddd-0000-4000-8000-000000000004')],
        chapter: { subscription_status: 'active' },
      });
      const request = buildRequest({ headers: {} });

      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
      expect(request.chapterId).toBe('dddddddd-0000-4000-8000-000000000004');
    });

    // #5933, from #5925's review: the sole tenant is counted among the kinds
    // the route serves, so a council beside one chapter doesn't make a
    // chapter route ask which one.
    it('auto-resolves the one chapter of a member who also holds a council, on a chapter route', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        memberships: [
          membership('dddddddd-0000-4000-8000-000000000004'),
          {
            ...membership('eeeeeeee-0000-4000-8000-000000000005'),
            kind: 'council',
          },
        ],
        chapter: { subscription_status: 'active' },
      });
      const request = buildRequest({ headers: {} });

      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
      expect(request.chapterId).toBe('dddddddd-0000-4000-8000-000000000004');
    });

    it('auto-resolves the one council on a council route, beside a chapter', async () => {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) =>
          key === TENANT_KINDS_KEY ? ['council'] : undefined,
        );
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        memberships: [
          membership('dddddddd-0000-4000-8000-000000000004'),
          {
            ...membership('eeeeeeee-0000-4000-8000-000000000005'),
            kind: 'council',
          },
        ],
        chapter: { subscription_status: 'active', kind: 'council' },
      });
      const request = buildRequest({ headers: {} });

      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
      expect(request.chapterId).toBe('eeeeeeee-0000-4000-8000-000000000005');
    });

    it('never auto-resolves a council alone on a chapter route', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        memberships: [
          {
            ...membership('eeeeeeee-0000-4000-8000-000000000005'),
            kind: 'council',
          },
        ],
      });

      await expect(
        guard.canActivate(mockExecutionContext(buildRequest({ headers: {} }))),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'chapter.context.required' },
      });
    });

    it('requires explicit context from a multi-chapter user (chapter.context.required)', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        memberships: [
          membership('aaaaaaaa-0000-4000-8000-000000000001'),
          membership('bbbbbbbb-0000-4000-8000-000000000002'),
        ],
      });
      const ctx = mockExecutionContext(buildRequest({ headers: {} }));

      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: { code: 'chapter.context.required' },
        status: 400,
      });
    });

    it('requires explicit context when the user has no memberships', async () => {
      mockSupabaseChain({ appUser: { id: 'user-1' }, memberships: [] });
      const ctx = mockExecutionContext(buildRequest({ headers: {} }));

      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: { code: 'chapter.context.required' },
        status: 400,
      });
    });

    it('rejects a chapter the caller is not a member of (chapter.context.invalid)', async () => {
      mockSupabaseChain({ appUser: { id: 'user-1' }, member: null });
      const ctx = mockExecutionContext(
        buildRequest({
          headers: { 'x-chapter-id': 'ffffffff-0000-4000-8000-000000000003' },
        }),
      );

      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: { code: 'chapter.context.invalid' },
        status: 403,
      });
    });

    // #3143: Postgres answers a malformed uuid comparison with an error, which
    // the lookup now reports as a 503. A chapter id that is not a uuid names
    // no chapter, so it is refused before any lookup runs.
    it('refuses a chapter id that is not a uuid as chapter.context.invalid, before any lookup', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active' },
      });
      const ctx = mockExecutionContext(
        buildRequest({ headers: { 'x-chapter-id': 'not-a-chapter' } }),
      );

      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: { code: 'chapter.context.invalid' },
        status: 403,
      });
      expect(mockFrom).not.toHaveBeenCalledWith('members');
    });

    it('still accepts the header when the token predates the claim', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active' },
      });
      const request = buildRequest({
        headers: { 'x-chapter-id': 'abcdef00-0000-4000-8000-0000000000aa' },
        jwtClaims: undefined,
      });

      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
      expect(request.chapterId).toBe('abcdef00-0000-4000-8000-0000000000aa');
    });

    // #688: Postgres `uuid` comparison is case-insensitive (an uppercase
    // header authorizes normally), but storage prefix math is exact-case
    // string concatenation — so every `@CurrentChapterId()` consumer must
    // see a canonical (lowercase) value, matching what `chapters.id` already
    // is in the database.
    it('lowercases an uppercase x-chapter-id header before setting request.chapterId', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active' },
      });
      const request = buildRequest({
        headers: { 'x-chapter-id': 'ABCDEF00-0000-4000-8000-0000000000AA' },
        jwtClaims: undefined,
      });

      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
      expect(request.chapterId).toBe('abcdef00-0000-4000-8000-0000000000aa');
    });

    it('lowercases an uppercase JWT active_chapter_id claim before setting request.chapterId', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active' },
      });
      const request = buildRequest({
        headers: {},
        jwtClaims: {
          active_chapter_id: 'BCDEF000-0000-4000-8000-0000000000BB',
        },
      });

      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
      expect(request.chapterId).toBe('bcdef000-0000-4000-8000-0000000000bb');
    });

    it('treats a header and JWT claim that agree only up to case as a match, not a mismatch', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active' },
      });
      const request = buildRequest({
        headers: { 'x-chapter-id': 'CdEf0000-0000-4000-8000-0000000000Cc' },
        jwtClaims: {
          active_chapter_id: 'cdef0000-0000-4000-8000-0000000000cc',
        },
      });

      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
      expect(request.chapterId).toBe('cdef0000-0000-4000-8000-0000000000cc');
    });

    it('lowercases an uppercase header that disagrees with the claim, and serves it', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active' },
      });
      const request = buildRequest({
        headers: { 'x-chapter-id': 'ABCDEF00-0000-4000-8000-0000000000AA' },
        jwtClaims: {
          active_chapter_id: 'bcdef000-0000-4000-8000-0000000000bb',
        },
      });

      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
      expect(request.chapterId).toBe('abcdef00-0000-4000-8000-0000000000aa');
    });

    it('refuses a malformed header even when the claim is a good chapter', async () => {
      mockSupabaseChain({ appUser: { id: 'user-1' } });
      const ctx = mockExecutionContext(
        buildRequest({
          headers: { 'x-chapter-id': 'not-a-uuid' },
          jwtClaims: {
            active_chapter_id: 'bcdef000-0000-4000-8000-0000000000bb',
          },
        }),
      );

      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        response: { code: 'chapter.context.invalid' },
        status: 403,
      });
    });

    it('falls back to the claim when the header is empty', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active' },
      });
      const request = buildRequest({
        headers: { 'x-chapter-id': '' },
        jwtClaims: {
          active_chapter_id: 'bcdef000-0000-4000-8000-0000000000bb',
        },
      });

      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
      expect(request.chapterId).toBe('bcdef000-0000-4000-8000-0000000000bb');
    });
  });

  // ADR-27 decision 3: a route serves the tenant kinds it declares, `chapter`
  // alone by default, and refuses another kind as it refuses a non-member.
  describe('tenant kind', () => {
    const withKinds = (kinds: string[] | undefined) =>
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation(((key: string) =>
          key === TENANT_KINDS_KEY ? kinds : undefined) as never);

    it('refuses a council tenant on an undecorated route, as a non-member', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'canceled', kind: 'council' },
      });
      const request = buildRequest({ method: 'POST' });

      // Canceled and a write: a kind check after the subscription check would
      // answer `chapter.subscription.canceled` and give the tenant away.
      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).rejects.toMatchObject({
        response: { code: 'chapter.context.invalid' },
        status: 403,
      });
      expect(request.chapterId).toBeUndefined();
    });

    it('serves a council tenant on a council route', async () => {
      withKinds(['council']);
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active', kind: 'council' },
      });

      await expect(
        guard.canActivate(mockExecutionContext(buildRequest())),
      ).resolves.toBe(true);
    });

    it('refuses a chapter tenant on a council route', async () => {
      withKinds(['council']);
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active', kind: 'chapter' },
      });

      await expect(
        guard.canActivate(mockExecutionContext(buildRequest())),
      ).rejects.toMatchObject({
        response: { code: 'chapter.context.invalid' },
        status: 403,
      });
    });

    it('serves either kind on a route that declares both', async () => {
      withKinds(['chapter', 'council']);
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active', kind: 'council' },
      });

      await expect(
        guard.canActivate(mockExecutionContext(buildRequest())),
      ).resolves.toBe(true);
    });

    it('selects kind in the chapter projection', async () => {
      const { selectArgs } = mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active' },
      });

      await guard.canActivate(mockExecutionContext(buildRequest()));

      expect(selectArgs['chapters']?.[0]).toContain('kind');
    });
  });

  it('should throw ForbiddenException when supabaseUser is not set', async () => {
    const request = buildRequest({ supabaseUser: undefined });
    const ctx = mockExecutionContext(request);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when app user not found', async () => {
    mockSupabaseChain({ appUser: null });
    const ctx = mockExecutionContext(buildRequest());
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user is not a chapter member', async () => {
    mockSupabaseChain({ appUser: { id: 'user-1' }, member: null });
    const ctx = mockExecutionContext(buildRequest());
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // A read whose token `SupabaseAuthGuard` verified locally (#5043) carries
  // `locallyVerifiedAuthId` and no Auth user. Paul's conditions 2 and 3: a
  // deleted account and a removed member are still refused at once, because
  // this guard re-reads both on every request.
  describe('a session verified locally (#5043)', () => {
    const locallyVerified = () =>
      buildRequest({
        supabaseUser: undefined,
        locallyVerifiedAuthId: 'auth-123',
      });

    it('reads the users row for the verified sub, skipping a deleted one', async () => {
      const chain = mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: { subscription_status: 'active' },
      });
      const request = locallyVerified();

      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
      expect(request.appUser).toEqual({ id: 'user-1' });
      expect(chain.isArgs.users).toEqual([['deleted_at', null]]);
    });

    it("refuses a deleted account's token at once", async () => {
      // The `deleted_at is null` filter finds no row for a tombstone.
      mockSupabaseChain({ appUser: null });

      await expect(
        guard.canActivate(mockExecutionContext(locallyVerified())),
      ).rejects.toThrow(new ForbiddenException('User profile not found'));
    });

    it('refuses a removed member at once', async () => {
      mockSupabaseChain({ appUser: { id: 'user-1' }, member: null });

      await expect(
        guard.canActivate(mockExecutionContext(locallyVerified())),
      ).rejects.toMatchObject({
        response: { code: 'chapter.context.invalid' },
        status: 403,
      });
    });

    it('refuses a request no session check accepted', async () => {
      mockSupabaseChain({ appUser: { id: 'user-1' } });

      await expect(
        guard.canActivate(
          mockExecutionContext(buildRequest({ supabaseUser: undefined })),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  it('should throw ForbiddenException when chapter row missing', async () => {
    mockSupabaseChain({
      appUser: { id: 'user-1' },
      member: { id: 'member-1', role_ids: ['role-1'] },
      chapter: null,
    });
    const ctx = mockExecutionContext(buildRequest());
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should set appUser, member, chapterId, subscriptionStatus on valid read', async () => {
    const appUser = { id: 'user-1' };
    const member = { id: 'member-1', role_ids: ['role-1'] };
    mockSupabaseChain({
      appUser,
      member,
      chapter: { subscription_status: 'active' },
    });

    const request = buildRequest();
    const ctx = mockExecutionContext(request);
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(request.appUser).toEqual(appUser);
    expect(request.member).toEqual(member);
    expect(request.chapterId).toBe('11111111-1111-4111-8111-111111111111');
    expect(request.subscriptionStatus).toBe('active');
  });

  it('leaves enabled_modules on the request for body-dependent module gates (#2993)', async () => {
    // A `kind: "poll"` chat send and a poll-card vote go through chat routes,
    // which carry no `@RequireModule`; ChatService gates them from this.
    mockSupabaseChain({
      appUser: { id: 'user-1' },
      member: { id: 'member-1', role_ids: ['role-1'] },
      chapter: {
        subscription_status: 'active',
        enabled_modules: { polls: false },
      },
    });

    const request = buildRequest();
    await guard.canActivate(mockExecutionContext(request));

    expect(request.enabledModules).toEqual({ polls: false });
  });

  it('selects only id and role_ids on the membership (#4075)', async () => {
    // Custom roles were folded into role_ids, so nothing reads
    // custom_role_ids for access any more.
    const member = { id: 'member-1', role_ids: ['role-1'] };
    const chain = mockSupabaseChain({
      appUser: { id: 'user-1' },
      member,
      chapter: { subscription_status: 'active' },
    });

    const request = buildRequest();
    const ctx = mockExecutionContext(request);
    await guard.canActivate(ctx);

    expect(request.member).toEqual(member);
    for (const columns of chain.selectArgs['members'] ?? []) {
      expect(columns).not.toContain('custom_role_ids');
    }
    expect((chain.selectArgs['members'] ?? []).length).toBeGreaterThan(0);
  });

  describe('subscription enforcement', () => {
    const baseValid = () =>
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: ['role-1'] },
        chapter: { subscription_status: 'active' },
      });

    const withStatus = (status: SubscriptionStatus) =>
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: ['role-1'] },
        chapter: { subscription_status: status },
      });

    // Pin "now" and stage a past_due chapter that lapsed `daysAgo` days ago so
    // grace-window boundaries are deterministic (no real clocks).
    const NOW = Date.parse('2026-06-02T12:00:00.000Z');
    const withPastDue = (daysAgo: number) => {
      // `currentTime` is the guard's protected clock seam.
      jest
        .spyOn(guard as unknown as { currentTime(): number }, 'currentTime')
        .mockReturnValue(NOW);
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: ['role-1'] },
        chapter: {
          subscription_status: 'past_due',
          past_due_since: new Date(
            NOW - daysAgo * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      });
    };
    const asFreeTier = () =>
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => key === SUBSCRIPTION_FREE_TIER_KEY);
    const asGraceBlockedFreeTier = () =>
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation(
          (key) =>
            key === SUBSCRIPTION_FREE_TIER_KEY ||
            key === SUBSCRIPTION_GRACE_BLOCKED_KEY,
        );

    it.each<SubscriptionStatus>([
      'active',
      'past_due',
      'canceled',
      'incomplete',
    ])('allows GET reads for %s', async (status) => {
      withStatus(status);
      const request = buildRequest({ method: 'GET' });
      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
    });

    it.each(['GET', 'HEAD', 'OPTIONS'])(
      'allows %s reads when canceled',
      async (method) => {
        withStatus('canceled');
        const request = buildRequest({ method });
        await expect(
          guard.canActivate(mockExecutionContext(request)),
        ).resolves.toBe(true);
      },
    );

    it('allows writes when active', async () => {
      baseValid();
      const request = buildRequest({ method: 'POST' });
      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
    });

    it('blocks writes with code chapter.subscription.canceled when canceled', async () => {
      withStatus('canceled');
      const request = buildRequest({ method: 'POST' });
      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).rejects.toMatchObject({
        response: { code: 'chapter.subscription.canceled' },
      });
    });

    it('blocks paid-ops writes with code chapter.subscription.write_locked when past_due', async () => {
      withStatus('past_due');
      const request = buildRequest({ method: 'POST' });
      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).rejects.toMatchObject({
        response: { code: 'chapter.subscription.write_locked' },
      });
    });

    it('blocks paid-ops writes with code chapter.subscription.required when incomplete', async () => {
      withStatus('incomplete');
      const request = buildRequest({ method: 'POST' });
      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).rejects.toMatchObject({
        response: { code: 'chapter.subscription.required' },
      });
    });

    it('allows free-tier writes when past_due', async () => {
      withStatus('past_due');
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => key === SUBSCRIPTION_FREE_TIER_KEY);
      const request = buildRequest({ method: 'POST' });
      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
    });

    it('allows free-tier writes when incomplete', async () => {
      withStatus('incomplete');
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => key === SUBSCRIPTION_FREE_TIER_KEY);
      const request = buildRequest({ method: 'POST' });
      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
    });

    it('still blocks free-tier writes when canceled', async () => {
      withStatus('canceled');
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => key === SUBSCRIPTION_FREE_TIER_KEY);
      const request = buildRequest({ method: 'POST' });
      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).rejects.toMatchObject({
        response: { code: 'chapter.subscription.canceled' },
      });
    });

    it('allows exempt routes regardless of status', async () => {
      withStatus('canceled');
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key) => key === SUBSCRIPTION_EXEMPT_KEY);
      const request = buildRequest({ method: 'POST' });
      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).resolves.toBe(true);
    });

    describe('past_due grace window (FRA-109)', () => {
      it('allows free-tier writes during grace (0 days)', async () => {
        withPastDue(0);
        asFreeTier();
        const request = buildRequest({ method: 'POST' });
        await expect(
          guard.canActivate(mockExecutionContext(request)),
        ).resolves.toBe(true);
      });

      it('blocks grace-blocked invite writes during grace with invite_blocked', async () => {
        withPastDue(2);
        asGraceBlockedFreeTier();
        const request = buildRequest({ method: 'POST' });
        await expect(
          guard.canActivate(mockExecutionContext(request)),
        ).rejects.toMatchObject({
          response: { code: 'chapter.subscription.invite_blocked' },
        });
      });

      it('still within grace at exactly 3 days: invite blocked, free-tier allowed', async () => {
        withPastDue(3);
        asGraceBlockedFreeTier();
        await expect(
          guard.canActivate(
            mockExecutionContext(buildRequest({ method: 'POST' })),
          ),
        ).rejects.toMatchObject({
          response: { code: 'chapter.subscription.invite_blocked' },
        });

        withPastDue(3);
        asFreeTier();
        await expect(
          guard.canActivate(
            mockExecutionContext(buildRequest({ method: 'POST' })),
          ),
        ).resolves.toBe(true);
      });

      it('hard-locks free-tier writes after grace (4 days) with write_locked', async () => {
        withPastDue(4);
        asFreeTier();
        const request = buildRequest({ method: 'POST' });
        await expect(
          guard.canActivate(mockExecutionContext(request)),
        ).rejects.toMatchObject({
          response: { code: 'chapter.subscription.write_locked' },
        });
      });

      it('blocks paid-ops writes during grace with write_locked', async () => {
        withPastDue(1);
        const request = buildRequest({ method: 'POST' });
        await expect(
          guard.canActivate(mockExecutionContext(request)),
        ).rejects.toMatchObject({
          response: { code: 'chapter.subscription.write_locked' },
        });
      });

      it('treats null past_due_since as within grace (free-tier allowed)', async () => {
        mockSupabaseChain({
          appUser: { id: 'user-1' },
          member: { id: 'member-1', role_ids: ['role-1'] },
          chapter: { subscription_status: 'past_due', past_due_since: null },
        });
        asFreeTier();
        const request = buildRequest({ method: 'POST' });
        await expect(
          guard.canActivate(mockExecutionContext(request)),
        ).resolves.toBe(true);
      });

      it('blocks @GraceBlocked invite when past_due_since is null (treated as within grace)', async () => {
        mockSupabaseChain({
          appUser: { id: 'user-1' },
          member: { id: 'member-1', role_ids: ['role-1'] },
          chapter: { subscription_status: 'past_due', past_due_since: null },
        });
        asGraceBlockedFreeTier();
        const request = buildRequest({ method: 'POST' });
        await expect(
          guard.canActivate(mockExecutionContext(request)),
        ).rejects.toMatchObject({
          response: { code: 'chapter.subscription.invite_blocked' },
        });
      });

      it('ignores grace-blocked marker when incomplete (free wedge preserved)', async () => {
        withStatus('incomplete');
        asGraceBlockedFreeTier();
        const request = buildRequest({ method: 'POST' });
        await expect(
          guard.canActivate(mockExecutionContext(request)),
        ).resolves.toBe(true);
      });
    });
  });

  // #264: the web client hides disabled modules from the sidebar, the Cmd+K
  // menu, and the slash palette, but a direct API call bypasses all three.
  // spec/product/modules.md: "Data is preserved — re-enabling restores
  // access", so this gates writes only.
  describe('module enforcement', () => {
    const withModules = (
      enabled_modules: Record<string, boolean> | null,
      status: SubscriptionStatus = 'active',
    ) =>
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: ['role-1'] },
        chapter: { subscription_status: status, enabled_modules },
      });

    /** Stands in for `@RequireModule(key)` on the handler/controller. */
    const requiresModule = (key: string) =>
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((metadataKey) =>
          metadataKey === REQUIRED_MODULE_KEY ? key : undefined,
        );

    it('rejects a write to an explicitly disabled module', async () => {
      withModules({ events: false });
      requiresModule('events');
      const request = buildRequest({ method: 'POST' });

      await expect(
        guard.canActivate(mockExecutionContext(request)),
      ).rejects.toMatchObject({
        response: { code: 'chapter.module.disabled' },
        status: 403,
      });
    });

    // Mobile still recognises this refusal by its message (#2393; moving to
    // the code first is #2995), and only the message names the module, to
    // show a member their own copy instead of this officer instruction. It has
    // to survive the trip through the matcher.
    it('refuses with the message the clients recognise, naming the module', async () => {
      withModules({ hours: false });
      requiresModule('hours');

      const refusal = await guard
        .canActivate(mockExecutionContext(buildRequest({ method: 'POST' })))
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(refusal).toBeInstanceOf(ForbiddenException);
      const body = (refusal as ForbiddenException).getResponse() as {
        message?: unknown;
      };
      expect(
        moduleRefusalFromServerMessage(
          typeof body.message === 'string' ? body.message : null,
        ),
      ).toEqual({ moduleKey: 'hours' });
    });

    it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
      'rejects %s to a disabled module',
      async (method) => {
        withModules({ points: false });
        requiresModule('points');

        await expect(
          guard.canActivate(mockExecutionContext(buildRequest({ method }))),
        ).rejects.toBeInstanceOf(ForbiddenException);
      },
    );

    // The toggle hides and freezes a surface; it must not strand the
    // chapter's existing data behind it, or re-enabling could not restore it.
    it.each(['GET', 'HEAD', 'OPTIONS'])(
      'allows %s on a disabled module so data stays readable',
      async (method) => {
        withModules({ events: false });
        requiresModule('events');

        await expect(
          guard.canActivate(mockExecutionContext(buildRequest({ method }))),
        ).resolves.toBe(true);
      },
    );

    it('allows a write when the module is explicitly enabled', async () => {
      withModules({ events: true });
      requiresModule('events');

      await expect(
        guard.canActivate(
          mockExecutionContext(buildRequest({ method: 'POST' })),
        ),
      ).resolves.toBe(true);
    });

    // Mirrors the client contract in use-org-config.ts: enabled unless the
    // chapter explicitly said false. A chapter predating a module has no key
    // for it and must not be locked out of something it never turned off.
    it('treats a module absent from enabled_modules as enabled', async () => {
      withModules({ tasks: false });
      requiresModule('events');

      await expect(
        guard.canActivate(
          mockExecutionContext(buildRequest({ method: 'POST' })),
        ),
      ).resolves.toBe(true);
    });

    it('treats a null enabled_modules column as all-enabled', async () => {
      withModules(null);
      requiresModule('events');

      await expect(
        guard.canActivate(
          mockExecutionContext(buildRequest({ method: 'POST' })),
        ),
      ).resolves.toBe(true);
    });

    it('leaves undecorated routes alone even when modules are disabled', async () => {
      withModules({ events: false, points: false });
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      await expect(
        guard.canActivate(
          mockExecutionContext(buildRequest({ method: 'POST' })),
        ),
      ).resolves.toBe(true);
    });

    // Billing state is the more actionable error, and a module toggle is
    // meaningless while every write is already locked.
    it('reports the subscription failure first when both would reject', async () => {
      withModules({ events: false }, 'canceled');
      requiresModule('events');

      await expect(
        guard.canActivate(
          mockExecutionContext(buildRequest({ method: 'POST' })),
        ),
      ).rejects.toMatchObject({
        response: { code: 'chapter.subscription.canceled' },
      });
    });

    it('selects enabled_modules in the chapter projection', async () => {
      const { selectArgs } = withModules({ events: true });
      requiresModule('events');

      await guard.canActivate(
        mockExecutionContext(buildRequest({ method: 'POST' })),
      );
      expect(selectArgs['chapters']?.[0]).toContain('enabled_modules');
    });
  });
  // #3143: a lookup that failed is not an answer. "No row" keeps its 4xx; an
  // error is a 503 carrying the query as its cause, so clients retry it.
  describe('a failed lookup is a 503, not a refusal', () => {
    const TIMEOUT = {
      code: '57014',
      message: 'canceling statement due to statement timeout',
    };

    async function failure(request: ReturnType<typeof buildRequest>) {
      return guard
        .canActivate(mockExecutionContext(request))
        .catch((error: unknown) => error);
    }

    it('answers 503 when the user lookup errors, and 403 when it finds no one', async () => {
      mockSupabaseChain({ errors: { users: TIMEOUT } });
      const thrown = await failure(buildRequest());
      expect(thrown).toBeInstanceOf(ServiceUnavailableException);
      expect((thrown as Error).cause).toBeInstanceOf(SupabaseQueryError);
      expect((thrown as Error).cause).toMatchObject({ code: '57014' });

      mockSupabaseChain({ appUser: null });
      await expect(
        guard.canActivate(mockExecutionContext(buildRequest())),
      ).rejects.toMatchObject({
        status: 403,
        message: 'User profile not found',
      });
    });

    it('answers 503 when the membership lookup errors, and chapter.context.invalid when there is none', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        errors: { members: TIMEOUT },
      });
      expect(await failure(buildRequest())).toBeInstanceOf(
        ServiceUnavailableException,
      );

      mockSupabaseChain({ appUser: { id: 'user-1' }, member: null });
      await expect(
        guard.canActivate(mockExecutionContext(buildRequest())),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: 'chapter.context.invalid' },
      });
    });

    it('answers 503 when the auto-resolve lookup errors, not chapter.context.required', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        errors: { memberships: TIMEOUT },
      });
      expect(await failure(buildRequest({ headers: {} }))).toBeInstanceOf(
        ServiceUnavailableException,
      );

      mockSupabaseChain({ appUser: { id: 'user-1' }, memberships: [] });
      await expect(
        guard.canActivate(mockExecutionContext(buildRequest({ headers: {} }))),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: 'chapter.context.required' },
      });
    });

    it('answers 503 when the chapter lookup errors, and 403 when the chapter is gone', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        errors: { chapters: TIMEOUT },
      });
      expect(await failure(buildRequest())).toBeInstanceOf(
        ServiceUnavailableException,
      );

      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: [] },
        chapter: null,
      });
      await expect(
        guard.canActivate(mockExecutionContext(buildRequest())),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Chapter not found',
      });
    });
  });
  describe('requests arriving together (#3728)', () => {
    const tablesQueried = () =>
      mockFrom.mock.calls.map(([table]: [string]) => table).sort();

    it('shares the user and chapter lookups between concurrent requests, and reads membership per request outside a request store', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: ['role-1'] },
        chapter: { subscription_status: 'active' },
      });
      const requests = [buildRequest(), buildRequest(), buildRequest()];

      await expect(
        Promise.all(
          requests.map((request) =>
            guard.canActivate(mockExecutionContext(request)),
          ),
        ),
      ).resolves.toEqual([true, true, true]);

      // No request store here, so each membership read is the request's own.
      // Inside a GET's store a burst may join one (`readSharedInBurst`,
      // #3752; covered in supabase-member.repository.spec.ts).
      expect(tablesQueried()).toEqual([
        'chapters',
        'members',
        'members',
        'members',
        'users',
      ]);
      for (const request of requests) {
        expect(request.member).toEqual({
          id: 'member-1',
          role_ids: ['role-1'],
        });
      }
    });

    it('looks the chapter up again for a request that starts after the first finished', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: ['role-1'] },
        chapter: { subscription_status: 'active' },
      });
      await guard.canActivate(mockExecutionContext(buildRequest()));
      await guard.canActivate(mockExecutionContext(buildRequest()));

      expect(tablesQueried()).toEqual([
        'chapters',
        'chapters',
        'members',
        'members',
        'users',
        'users',
      ]);
    });

    it('reads an explicit chapter while the user lookup is still out', async () => {
      let releaseUser!: (value: unknown) => void;
      mockFrom.mockImplementation((table: string) => {
        const maybeSingle =
          table === 'users'
            ? jest.fn().mockReturnValue(
                new Promise((resolve) => {
                  releaseUser = resolve;
                }),
              )
            : jest.fn().mockResolvedValue({
                data:
                  table === 'members'
                    ? { id: 'member-1', role_ids: [] }
                    : { subscription_status: 'active', kind: 'chapter' },
                error: null,
              });
        const eq: jest.Mock = jest.fn();
        eq.mockReturnValue({ eq, is: () => ({ maybeSingle }), maybeSingle });
        return { select: jest.fn().mockReturnValue({ eq }) };
      });

      const result = guard.canActivate(mockExecutionContext(buildRequest()));
      await new Promise((resolve) => setImmediate(resolve));

      expect(tablesQueried()).toEqual(['chapters', 'users']);
      releaseUser({ data: { id: 'user-1' }, error: null });
      await expect(result).resolves.toBe(true);
    });

    it('gives each request its own copy of the user and module toggles', async () => {
      mockSupabaseChain({
        appUser: { id: 'user-1' },
        member: { id: 'member-1', role_ids: ['role-1'] },
        chapter: {
          subscription_status: 'active',
          enabled_modules: { polls: false },
        },
      });
      const [first, second] = [buildRequest(), buildRequest()];

      await Promise.all(
        [first, second].map((request) =>
          guard.canActivate(mockExecutionContext(request)),
        ),
      );

      expect(tablesQueried()).toEqual([
        'chapters',
        'members',
        'members',
        'users',
      ]);
      expect(first.appUser).toEqual(second.appUser);
      expect(first.appUser).not.toBe(second.appUser);
      expect(first.enabledModules).toEqual({ polls: false });
      expect(first.enabledModules).not.toBe(second.enabledModules);
    });

    it('never shares a lookup between different chapters or users', async () => {
      const CHAPTER_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
      const CHAPTER_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
      // user-1 is a member of A only; auth-456 is a different person.
      mockFrom.mockImplementation((table: string) => {
        const filters: Record<string, string> = {};
        const maybeSingle = jest.fn(() => {
          if (table === 'users') {
            return Promise.resolve({
              data: {
                id:
                  filters.supabase_auth_id === 'auth-123' ? 'user-1' : 'user-2',
              },
              error: null,
            });
          }
          if (table === 'members') {
            const isMember =
              filters.user_id === 'user-1' && filters.chapter_id === CHAPTER_A;
            return Promise.resolve({
              data: isMember ? { id: 'member-a', role_ids: ['role-a'] } : null,
              error: null,
            });
          }
          return Promise.resolve({
            data: { subscription_status: 'active', kind: 'chapter' },
            error: null,
          });
        });
        const eq: jest.Mock = jest.fn((column: string, value: string) => {
          filters[column] = value;
          return { eq, is: () => ({ maybeSingle }), maybeSingle };
        });
        return { select: jest.fn().mockReturnValue({ eq }) };
      });

      const forA = buildRequest({ headers: { 'x-chapter-id': CHAPTER_A } });
      const forB = buildRequest({ headers: { 'x-chapter-id': CHAPTER_B } });
      const otherUser = buildRequest({
        headers: { 'x-chapter-id': CHAPTER_A },
        supabaseUser: { id: 'auth-456' },
      });
      const [a, b, other] = await Promise.allSettled(
        [forA, forB, otherUser].map((request) =>
          guard.canActivate(mockExecutionContext(request)),
        ),
      );

      expect(a).toMatchObject({ status: 'fulfilled', value: true });
      expect(forA.member).toEqual({ id: 'member-a', role_ids: ['role-a'] });
      expect(b).toMatchObject({
        status: 'rejected',
        reason: { response: { code: 'chapter.context.invalid' } },
      });
      expect(other).toMatchObject({
        status: 'rejected',
        reason: { response: { code: 'chapter.context.invalid' } },
      });
      expect(tablesQueried()).toEqual([
        'chapters',
        'chapters',
        'members',
        'members',
        'members',
        'users',
        'users',
      ]);
    });

    it('still reports a missing profile before a malformed chapter', async () => {
      mockSupabaseChain({ appUser: null });
      const ctx = mockExecutionContext(
        buildRequest({
          headers: { 'x-chapter-id': 'not-a-uuid' },
        }),
      );

      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        message: 'User profile not found',
      });
    });
  });
  // The guard's reads start while `SupabaseAuthGuard` waits on `getUser`, and
  // land in the request's own store; the guard picks them up afterwards. With
  // a chapter named they are one call, `get_request_context` (#3583).
  describe('reads started during the session check (#3728, #3583)', () => {
    const CHAPTER = '22222222-2222-4222-8222-222222222222';

    const CONTEXT = {
      user: { id: 'user-p' },
      chapter: {
        subscription_status: 'active',
        enabled_modules: null,
        kind: 'chapter',
      },
      member: {
        id: 'member-p',
        user_id: 'user-p',
        chapter_id: CHAPTER,
        role_ids: ['role-p'],
        points: 3,
      },
      roles: [
        { id: 'role-p', chapter_id: CHAPTER, permissions: ['members:view'] },
      ],
    };

    /**
     * One mock for users, chapters, members and roles, counting reads, and
     * one for `get_request_context`, answering `context`.
     */
    const tables = (
      context: { data: unknown; error: unknown } = {
        data: CONTEXT,
        error: null,
      },
    ) => {
      const reads: string[] = [];
      mockFrom.mockImplementation((table: string) => {
        reads.push(table);
        // `auth-real` is a different user from everyone else, with a
        // membership of its own.
        const filters: Record<string, unknown> = {};
        const row = () =>
          table === 'users'
            ? {
                id:
                  filters.supabase_auth_id === 'auth-real'
                    ? 'user-real'
                    : 'user-p',
              }
            : table === 'chapters'
              ? {
                  subscription_status: 'active',
                  enabled_modules: null,
                  kind: 'chapter',
                }
              : table === 'members'
                ? filters.user_id === 'user-real'
                  ? { id: 'member-real', role_ids: ['role-p'] }
                  : { id: 'member-p', role_ids: ['role-p'], points: 3 }
                : [{ id: 'role-p', permissions: ['members:view'] }];
        const answer = () => Promise.resolve({ data: row(), error: null });
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (column: string, value: unknown) => {
          filters[column] = value;
          return chain;
        };
        chain.in = () => chain;
        chain.is = () => chain;
        chain.maybeSingle = answer;
        chain.then = (
          resolve: (value: unknown) => unknown,
          reject: (reason: unknown) => unknown,
        ) => answer().then(resolve, reject);
        return chain;
      });
      const rpc = jest.fn((name: string) => {
        reads.push(`rpc:${name}`);
        return Promise.resolve(context);
      });
      return { reads, client: { from: mockFrom, rpc } as never, rpc };
    };

    const request = (authId: string) =>
      buildRequest({
        headers: { 'x-chapter-id': CHAPTER },
        supabaseUser: { id: authId },
      });

    const settle = () => new Promise((resolve) => setImmediate(resolve));

    it('reads user, chapter, membership and roles in one call, and the guard reuses it', async () => {
      const { reads, client, rpc } = tables();
      const req = request('auth-p1');

      await runWithRequestReads('GET', async () => {
        prefetchChapterContext(client, 'auth-p1', undefined, req.headers);
        await settle();

        await expect(
          guard.canActivate(mockExecutionContext(req)),
        ).resolves.toBe(true);
        // `PermissionsGuard` and the handler's role reads find the roles too.
        await expect(
          readRolesByIds(client, ['role-p'], CHAPTER),
        ).resolves.toEqual(CONTEXT.roles);
        await expect(
          readMemberByUserAndChapter(client, 'user-p', CHAPTER),
        ).resolves.toEqual(CONTEXT.member);
      });

      expect(reads).toEqual(['rpc:get_request_context']);
      expect(rpc).toHaveBeenCalledWith('get_request_context', {
        p_auth_id: 'auth-p1',
        p_chapter_id: CHAPTER,
      });
      // The guard keeps its own shape, whatever the shared row carries.
      expect(req.member).toEqual({ id: 'member-p', role_ids: ['role-p'] });
      expect(req.chapterId).toBe(CHAPTER);
      expect(req.subscriptionStatus).toBe('active');
    });

    it('refuses a non-member from the same call, without reading again', async () => {
      const { reads, client } = tables({
        data: { ...CONTEXT, member: null, roles: [] },
        error: null,
      });
      const req = request('auth-p6');

      await runWithRequestReads('GET', async () => {
        prefetchChapterContext(client, 'auth-p6', undefined, req.headers);
        await settle();
        await expect(
          guard.canActivate(mockExecutionContext(req)),
        ).rejects.toMatchObject({
          response: { code: 'chapter.context.invalid' },
        });
      });

      expect(reads).toEqual(['rpc:get_request_context']);
    });

    it('reports a missing profile from the same call', async () => {
      const { reads, client } = tables({
        data: { user: null, chapter: CONTEXT.chapter, member: null, roles: [] },
        error: null,
      });
      const req = request('auth-p7');

      await runWithRequestReads('GET', async () => {
        prefetchChapterContext(client, 'auth-p7', undefined, req.headers);
        await settle();
        await expect(
          guard.canActivate(mockExecutionContext(req)),
        ).rejects.toMatchObject({ message: 'User profile not found' });
      });

      expect(reads).toEqual(['rpc:get_request_context']);
    });

    it('reports a failed call to Sentry once, however many requests it fails', async () => {
      const captured = jest.mocked(Sentry.captureException);
      captured.mockClear();
      const { client } = tables({
        data: null,
        error: { code: 'PGRST202', message: 'function not found' },
      });

      for (const authId of ['auth-r1', 'auth-r2']) {
        const req = request(authId);
        await runWithRequestReads('GET', async () => {
          prefetchChapterContext(client, authId, undefined, req.headers);
          await settle();
          await guard.canActivate(mockExecutionContext(req));
        });
      }

      expect(captured).toHaveBeenCalledTimes(1);
      expect(captured.mock.calls[0][0]).toBeInstanceOf(SupabaseQueryError);
      expect(captured.mock.calls[0][1]).toMatchObject({
        level: 'warning',
        fingerprint: ['get_request_context-failed'],
      });
    });

    // A `get_request_context` from before 20261123194106 has no `kind`. The
    // guard must not serve a tenant whose kind it can't check, so that answer
    // counts as no answer and the rows are read directly, `kind` included.
    // After the Sentry case above: this answer is reported too, and the
    // report is throttled per process.
    it('reads the chapter itself when the call’s chapter carries no kind', async () => {
      const { reads, client } = tables({
        data: {
          ...CONTEXT,
          chapter: { subscription_status: 'active', enabled_modules: null },
        },
        error: null,
      });
      const req = request('auth-p9');

      await runWithRequestReads('GET', async () => {
        prefetchChapterContext(client, 'auth-p9', undefined, req.headers);
        await settle();

        await expect(
          guard.canActivate(mockExecutionContext(req)),
        ).resolves.toBe(true);
      });

      expect(reads[0]).toBe('rpc:get_request_context');
      expect(reads).toContain('chapters');
      expect(req.chapterId).toBe(CHAPTER);
    });

    it.each([
      ['fails', { data: null, error: { code: '57014', message: 'timeout' } }],
      [
        'answers without roles',
        { data: { ...CONTEXT, roles: null }, error: null },
      ],
      ['answers nothing', { data: null, error: null }],
    ])(
      'reads each row as before when the call %s, while the session check runs',
      async (_label, answer) => {
        const { reads, client } = tables(answer);
        const req = request(`auth-p4-${_label}`);

        await runWithRequestReads('GET', async () => {
          prefetchChapterContext(
            client,
            req.supabaseUser.id,
            undefined,
            req.headers,
          );
          await settle();
          // The pre-#3583 chain: membership and roles are read already.
          expect([...reads].sort()).toEqual([
            'chapters',
            'members',
            'roles',
            'rpc:get_request_context',
            'users',
          ]);
          await expect(
            guard.canActivate(mockExecutionContext(req)),
          ).resolves.toBe(true);
        });

        expect(reads).toHaveLength(5);
        expect(req.member).toEqual({ id: 'member-p', role_ids: ['role-p'] });
      },
    );

    it('reads each row itself when the client throws instead of answering', async () => {
      const { reads } = tables();
      const throwing = {
        from: mockFrom,
        rpc: () => {
          throw new Error('client gone');
        },
      } as never;
      const req = request('auth-p8');

      await runWithRequestReads('GET', async () => {
        expect(() =>
          prefetchChapterContext(throwing, 'auth-p8', undefined, req.headers),
        ).not.toThrow();
        await settle();
        await expect(
          guard.canActivate(mockExecutionContext(req)),
        ).resolves.toBe(true);
      });

      expect(reads.sort()).toEqual(['chapters', 'members', 'roles', 'users']);
    });

    it('reuses no user row when the session belongs to a different user than the token’s sub', async () => {
      const { reads, client } = tables();
      const req = request('auth-real');

      await runWithRequestReads('GET', async () => {
        prefetchChapterContext(client, 'auth-claimed', undefined, req.headers);
        await settle();
        await guard.canActivate(mockExecutionContext(req));
      });

      // Keyed by auth id, so the guard looked its own user up, and by that
      // user's id, so it read its own membership too: the claimed user's
      // row and roles from the call are never handed to another user.
      expect(reads.filter((t) => t === 'users')).toHaveLength(1);
      expect(reads.filter((t) => t === 'members')).toHaveLength(1);
      expect(req.member).toEqual({ id: 'member-real', role_ids: ['role-p'] });
    });

    it('does nothing outside a request, or once a write request has reached its handler', async () => {
      const { reads, client } = tables();
      prefetchChapterContext(client, 'auth-p2', undefined, {
        'x-chapter-id': CHAPTER,
      });
      await runWithRequestReads('POST', async () => {
        sealRequestReadsForWrites();
        prefetchChapterContext(client, 'auth-p2', undefined, {
          'x-chapter-id': CHAPTER,
        });
      });
      await settle();
      expect(reads).toEqual([]);
    });

    it('starts only the user lookup when no chapter is named', async () => {
      const { reads, client } = tables();
      await runWithRequestReads('GET', async () => {
        prefetchChapterContext(client, 'auth-p3', undefined, {});
        await settle();
      });
      expect(reads).toEqual(['users']);
    });
  });
});
