/**
 * Cross-tenant isolation (#847).
 *
 * Frapp is multi-tenant by chapter, and a request names its chapter in a place
 * the caller controls — the `x-chapter-id` header, a `?chapterId=` query, or a
 * raw resource id in the path. This spec is the regression test for the
 * question "does swapping that id get me another chapter's data?".
 *
 * Two things make it different from the rest of `test/`:
 *
 * 1. **`ChapterGuard` is NOT stubbed.** Every other e2e spec replaces it with a
 *    stub that hands out `chapterId: 'chapter-1'`, which means none of them can
 *    catch a tenancy regression. Here the real guard runs against a table-aware
 *    Supabase fake, so deleting its membership re-read fails these tests.
 * 2. **`PermissionsGuard` IS stubbed** to always allow. RBAC is a separate
 *    control with its own specs (`permissions.guard.spec.ts`); stubbing it keeps
 *    each assertion here about *tenancy* and stops a permission denial from
 *    masking a missing chapter check with a coincidentally-identical 403.
 *
 * The layers under test are documented in
 * `docs/security/authorization-model.md` §1.
 */
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PermissionsGuard } from '../src/interface/guards/permissions.guard';
import { SupabaseAuthGuard } from '../src/interface/guards/supabase-auth.guard';
import { ChapterGuard } from '../src/interface/guards/chapter.guard';
import { TenantKinds } from '../src/interface/decorators/tenant-kinds.decorator';
import { CurrentChapterId } from '../src/interface/decorators/current-user.decorator';
import { configureApp } from '../src/bootstrap';
import {
  createTableAwareSupabaseMock,
  type SeededTables,
} from './helpers/supabase-mock.factory';
import { AllowAllGuard } from './helpers/guard-stubs.factory';

const V1 = '/v1';

// Real UUIDs, not readable slugs: several DTOs validate ids with `@IsUUID()`
// (e.g. `UpdateNotificationPreferenceDto.chapter_id`), so a slug would be
// rejected by the ValidationPipe with a 400 and the request would never reach
// the tenancy check this spec exists to exercise — passing for the wrong reason.
//
// Chapter A — the victim tenant. Chapter B — the caller's own chapter.
const CHAPTER_A = '11111111-1111-4111-8111-111111111111';
const CHAPTER_B = '22222222-2222-4222-8222-222222222222';

const AUTH_B = 'auth-bob';
const USER_A = '33333333-3333-4333-8333-333333333333';
const USER_B = '44444444-4444-4444-8444-444444444444';
const MEMBER_B = '55555555-5555-4555-8555-555555555555';

const MEMBER_A = '66666666-6666-4666-8666-666666666666';
const ROLE_A = '77777777-7777-4777-8777-777777777777';
const INVITE_A = '88888888-8888-4888-8888-888888888888';
const TASK_A = '99999999-9999-4999-8999-999999999999';
const TASK_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVENT_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INVOICE_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EVENT_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const INVOICE_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MEMBER_B_IN_A = 'abababab-abab-4aba-8aba-abababababab';
const NOTIF_A = 'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1';
const NOTIF_B = 'f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2';
// ADR-27 (#5918): a chapter Bob is not in, and a council he is an officer of.
const CHAPTER_C = 'c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3';
const COUNCIL = 'c4c4c4c4-c4c4-44c4-84c4-c4c4c4c4c4c4';
const MEMBER_B_IN_COUNCIL = 'c5c5c5c5-c5c5-45c5-85c5-c5c5c5c5c5c5';

/**
 * A route that serves councils alone, for ADR-27 test 5. No council route
 * exists yet, so this stands in for the first one: the real guards, the
 * declaration a council route will carry, and the chapter it resolved.
 */
@Controller('council-probe')
@UseGuards(SupabaseAuthGuard, ChapterGuard)
class CouncilProbeController {
  @Get()
  @TenantKinds('council')
  probe(@CurrentChapterId() chapterId: string) {
    return { chapter_id: chapterId };
  }
}

/** Fresh rows per test — the fake mutates its seed on writes. */
function seed(): SeededTables {
  return {
    users: [{ id: USER_B, supabase_auth_id: AUTH_B, email: 'bob@example.com' }],
    members: [
      {
        id: MEMBER_B,
        user_id: USER_B,
        chapter_id: CHAPTER_B,
        role_ids: [],
        custom_role_ids: [],
      },
      // Alice's membership row. Bob must never resolve through it.
      {
        id: MEMBER_A,
        user_id: USER_A,
        chapter_id: CHAPTER_A,
        role_ids: [],
        custom_role_ids: [],
      },
    ],
    chapters: [
      {
        id: CHAPTER_A,
        name: 'Alpha',
        kind: 'chapter',
        subscription_status: 'active',
        past_due_since: null,
        enabled_modules: null,
      },
      {
        id: CHAPTER_B,
        name: 'Beta',
        kind: 'chapter',
        subscription_status: 'active',
        past_due_since: null,
        enabled_modules: null,
      },
      {
        id: CHAPTER_C,
        name: 'Gamma',
        kind: 'chapter',
        subscription_status: 'active',
        past_due_since: null,
        enabled_modules: null,
      },
      {
        id: COUNCIL,
        name: 'RPI IFC',
        kind: 'council',
        subscription_status: 'active',
        past_due_since: null,
        enabled_modules: null,
      },
    ],
    // Every tenant's current slug, and one retired slug each for A and B.
    tenant_slugs: [
      { slug: 'alpha-rpi', chapter_id: CHAPTER_A, retired_at: null },
      {
        slug: 'alpha-old',
        chapter_id: CHAPTER_A,
        retired_at: '2026-11-01T00:00:00.000Z',
      },
      { slug: 'beta-rpi', chapter_id: CHAPTER_B, retired_at: null },
      {
        slug: 'beta-old',
        chapter_id: CHAPTER_B,
        retired_at: '2026-11-01T00:00:00.000Z',
      },
      { slug: 'gamma-rpi', chapter_id: CHAPTER_C, retired_at: null },
      { slug: 'rpi-ifc', chapter_id: COUNCIL, retired_at: null },
    ],
    roles: [{ id: ROLE_A, chapter_id: CHAPTER_A, name: 'Treasurer' }],
    invites: [
      { id: INVITE_A, chapter_id: CHAPTER_A, used_at: null, code: 'AAA' },
    ],
    tasks: [
      { id: TASK_A, chapter_id: CHAPTER_A, title: "Alice's task" },
      // Assigned to Bob: `GET /tasks/:id` layers a per-row assignee ACL on top
      // of chapter scoping, so the positive control needs to clear both.
      {
        id: TASK_B,
        chapter_id: CHAPTER_B,
        title: "Bob's task",
        assignee_id: USER_B,
      },
    ],
    events: [
      { id: EVENT_A, chapter_id: CHAPTER_A, title: "Alice's event" },
      { id: EVENT_B, chapter_id: CHAPTER_B, title: "Bob's event" },
    ],
    financial_invoices: [
      { id: INVOICE_A, chapter_id: CHAPTER_A, amount_cents: 5000 },
      // Billed to Bob: like tasks, `GET /invoices/:id` layers a per-row ACL
      // (own invoice, or `billing:view`) on top of chapter scoping.
      {
        id: INVOICE_B,
        chapter_id: CHAPTER_B,
        user_id: USER_B,
        amount_cents: 5000,
      },
    ],
    notification_preferences: [
      {
        user_id: USER_A,
        chapter_id: CHAPTER_A,
        category: 'chat',
        is_enabled: true,
      },
    ],
  };
}

/**
 * Dual-membership fixture for in-app notification history (#1518).
 *
 * Bob is an active member of both chapters and holds one notification in each.
 * The list/mark-read routes now run `ChapterGuard`, so the JWT claim (and
 * matching `x-chapter-id`) is the only chapter the query may return. Drop the
 * `chapter_id` filter and both rows come back — the same failure a
 * `user_id`-only list had in production.
 */
function seedDualChapterNotifications(): SeededTables {
  const tables = seed();
  tables.members = [
    ...tables.members,
    {
      id: MEMBER_B_IN_A,
      user_id: USER_B,
      chapter_id: CHAPTER_A,
      role_ids: [],
      custom_role_ids: [],
    },
  ];
  tables.notifications = [
    {
      id: NOTIF_A,
      user_id: USER_B,
      chapter_id: CHAPTER_A,
      title: 'Chapter A notice',
      body: 'from A',
      data: {},
      read_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: NOTIF_B,
      user_id: USER_B,
      chapter_id: CHAPTER_B,
      title: 'Chapter B notice',
      body: 'from B',
      data: {},
      read_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ];
  return tables;
}

/**
 * Assert a denial against the response shape the API *actually ships*, and
 * tell one tenancy denial from another by its `code` (#1020).
 *
 * These assertions once read `res.body.message?.code ?? res.body.code` and
 * passed only because no e2e spec installed `AllExceptionsFilter`, so the
 * suite ran under Nest's default filter. Every spec now boots through
 * `configureApp`, so this is the body `main.ts` sends: the four envelope keys
 * plus `code`, exactly. The message's wording is for people, so by default it
 * is checked only for being present.
 *
 * `chapter.context.mismatch` now has one source, the chapter-config handlers
 * refusing a URL that disagrees with the resolved chapter. `ChapterGuard`
 * threw it too, for a header that disagreed with the token, until ADR-27
 * made the header authoritative (#5918). The #866 cases still pass the
 * handler's message as `layerMessage`, so a guard that started throwing it
 * again would fail them rather than pass for the wrong layer.
 */
function expectDeniedBody(
  body: Record<string, unknown>,
  code: string,
  layerMessage?: string,
): void {
  expect(Object.keys(body).sort()).toEqual([
    'code',
    'error',
    'message',
    'requestId',
    'statusCode',
  ]);
  expect(body.code).toBe(code);
  expect(body.statusCode).toBe(403);
  expect(body.error).toBe('FORBIDDEN');
  if (layerMessage === undefined) {
    expect(typeof body.message).toBe('string');
  } else {
    expect(body.message).toBe(layerMessage);
  }
  // A real id, not the 'unknown' placeholder a missing requestIdMiddleware
  // leaves behind on a guard denial — see request-id.middleware.ts.
  expect(body.requestId).toMatch(/^req_/);
}

describe('Cross-tenant isolation (e2e)', () => {
  let app: INestApplication;

  /** Boots the app with Bob authenticated and the given JWT claims. */
  async function boot(
    claims: Record<string, unknown> | null,
    tables: SeededTables = seed(),
  ) {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [CouncilProbeController],
    })
      .overrideProvider('SUPABASE_CLIENT')
      .useValue(
        createTableAwareSupabaseMock({
          authUser: { id: AUTH_B, email: 'bob@example.com' },
          claims,
          tables,
        }),
      )
      .overrideGuard(PermissionsGuard)
      .useClass(AllowAllGuard)
      .compile();

    const instance = moduleFixture.createNestApplication();
    configureApp(instance);
    await instance.init();
    return instance;
  }

  const asBob = (req: request.Test, chapterId = CHAPTER_B) =>
    req.set('authorization', 'Bearer token-bob').set('x-chapter-id', chapterId);

  afterEach(async () => {
    await app?.close();
  });

  describe('chapter context resolution (ChapterGuard)', () => {
    it('rejects an x-chapter-id for a chapter the caller is not a member of', async () => {
      app = await boot(null);

      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/tasks`),
        CHAPTER_A,
      );

      expect(res.status).toBe(403);
      expectDeniedBody(res.body, 'chapter.context.invalid');
    });

    it('allows the caller into their own chapter (positive control)', async () => {
      // Without this, every assertion above would still pass if the fake simply
      // failed every lookup.
      app = await boot({ active_chapter_id: CHAPTER_B });

      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/tasks/${TASK_B}`),
      );

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(TASK_B);
    });

    it('returns the caller’s own event and invoice (positive control)', async () => {
      // Pins the negative event/invoice cases below to *tenancy*. Without this,
      // a 404 there could equally mean a disabled module, a mis-typed path, or a
      // seed the fake never matched — and the test would look like it passed.
      app = await boot({ active_chapter_id: CHAPTER_B });

      const event = await asBob(
        request(app.getHttpServer()).get(`${V1}/events/${EVENT_B}`),
      );
      expect(event.status).toBe(200);
      expect(event.body.id).toBe(EVENT_B);

      const invoice = await asBob(
        request(app.getHttpServer()).get(`${V1}/invoices/${INVOICE_B}`),
      );
      expect(invoice.status).toBe(200);
      expect(invoice.body.id).toBe(INVOICE_B);
    });
  });

  describe('resource ids from another chapter', () => {
    beforeEach(async () => {
      app = await boot({ active_chapter_id: CHAPTER_B });
    });

    it('does not return another chapter’s member by raw id', async () => {
      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/members/${MEMBER_A}`),
      );

      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain(CHAPTER_A);
    });

    it('does not return another chapter’s task by raw id', async () => {
      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/tasks/${TASK_A}`),
      );

      expect(res.status).toBe(404);
    });

    it('does not let a caller edit another chapter’s role', async () => {
      const res = await asBob(
        request(app.getHttpServer())
          .patch(`${V1}/roles/${ROLE_A}`)
          .send({ name: 'Pwned' }),
      );

      expect([403, 404]).toContain(res.status);
    });

    it('does not return another chapter’s event by raw id', async () => {
      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/events/${EVENT_A}`),
      );

      expect(res.status).toBe(404);
    });

    it('does not return another chapter’s invoice by raw id', async () => {
      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/invoices/${INVOICE_A}`),
      );

      expect(res.status).toBe(404);
    });

    it('does not let a caller revoke another chapter’s invite', async () => {
      const res = await asBob(
        request(app.getHttpServer()).delete(`${V1}/invites/${INVITE_A}`),
      );

      expect([403, 404]).toContain(res.status);
    });
  });

  /** The chapter-config handlers' own refusal, distinct from the guard's. */
  const URL_MISMATCH_MESSAGE =
    'The chapter id in the URL disagrees with your active chapter context.';

  describe('chapter config: URL id vs active chapter (#866)', () => {
    // `chapters/:id/config` never reads `:id` for data — it's the
    // guard-resolved `chapterId` that's queried either way, so this is a
    // contract check (the URL must not claim a chapter it doesn't act on),
    // not a data-leak check like the rest of this file.
    it('rejects a URL chapter id that disagrees with the active chapter', async () => {
      app = await boot({ active_chapter_id: CHAPTER_B });

      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/chapters/${CHAPTER_A}/config`),
      );

      expect(res.status).toBe(403);
      expectDeniedBody(
        res.body,
        'chapter.context.mismatch',
        URL_MISMATCH_MESSAGE,
      );
    });

    // ADR-27 test 9: the handler's own check still refuses with the header
    // now authoritative. The header names B, the claim A, the URL A: the
    // resolved chapter is the header's, so the URL disagrees with it.
    it('rejects a URL chapter id that disagrees with the header’s chapter, whatever the claim', async () => {
      app = await boot({ active_chapter_id: CHAPTER_A });

      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/chapters/${CHAPTER_A}/config`),
        CHAPTER_B,
      );

      expect(res.status).toBe(403);
      expectDeniedBody(
        res.body,
        'chapter.context.mismatch',
        URL_MISMATCH_MESSAGE,
      );
    });

    it('allows a URL chapter id that matches the active chapter (positive control)', async () => {
      app = await boot({ active_chapter_id: CHAPTER_B });

      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/chapters/${CHAPTER_B}/config`),
      );

      expect(res.status).toBe(200);
    });

    // The assertion is duplicated per handler rather than centralized, so a
    // future edit could drop it from one route without the others noticing —
    // each of the three needs its own rejection case, not just GET's.
    it('rejects a mismatched URL chapter id on PATCH', async () => {
      app = await boot({ active_chapter_id: CHAPTER_B });

      const res = await asBob(
        request(app.getHttpServer())
          .patch(`${V1}/chapters/${CHAPTER_A}/config`)
          .send({ org_archetype: 'ifc' }),
      );

      expect(res.status).toBe(403);
      expectDeniedBody(
        res.body,
        'chapter.context.mismatch',
        URL_MISMATCH_MESSAGE,
      );
    });

    it('rejects a mismatched URL chapter id on POST theme-palette', async () => {
      app = await boot({ active_chapter_id: CHAPTER_B });

      const res = await asBob(
        request(app.getHttpServer()).post(
          `${V1}/chapters/${CHAPTER_A}/theme-palette`,
        ),
      );

      expect(res.status).toBe(403);
      expectDeniedBody(
        res.body,
        'chapter.context.mismatch',
        URL_MISMATCH_MESSAGE,
      );
    });
  });

  /**
   * ADR-27 decision 3 (#5918): the page's URL, sent as `x-chapter-id`, names
   * the chapter; the token's claim is only the default. Bob is a member of A
   * and B (and an officer of the council), not of C. The numbers are the
   * ADR's cross-tenant test list; test 8 (analytics identity) is in
   * `analytics-identity.e2e-spec.ts`, which sets the salt it needs, and test
   * 10 (two web tabs) belongs to rollout step 2.
   */
  describe('header-first chapter context (ADR-27)', () => {
    function seedTenants(): SeededTables {
      const tables = seedDualChapterNotifications();
      tables.members = [
        ...tables.members,
        {
          id: MEMBER_B_IN_COUNCIL,
          user_id: USER_B,
          chapter_id: COUNCIL,
          role_ids: [],
          custom_role_ids: [],
        },
      ];
      return tables;
    }

    const ids = (res: request.Response) =>
      res.body.map((n: { id: string }) => n.id);

    it('1. serves the header’s chapter, not the claim’s, to a member of both', async () => {
      app = await boot({ active_chapter_id: CHAPTER_B }, seedTenants());

      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/notifications`),
        CHAPTER_A,
      );

      expect(res.status).toBe(200);
      expect(ids(res)).toEqual([NOTIF_A]);
      expect(JSON.stringify(res.body)).not.toContain('Chapter B notice');
    });

    it('2. refuses a header for a chapter the caller is not in, whatever the claim says', async () => {
      app = await boot({ active_chapter_id: CHAPTER_B }, seedTenants());

      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/tasks`),
        CHAPTER_C,
      );

      expect(res.status).toBe(403);
      expectDeniedBody(res.body, 'chapter.context.invalid');
    });

    it('3. gives two concurrent requests on one token each their own chapter', async () => {
      app = await boot({ active_chapter_id: CHAPTER_B }, seedTenants());
      const server = app.getHttpServer();

      const [a, b] = await Promise.all([
        asBob(request(server).get(`${V1}/notifications`), CHAPTER_A),
        asBob(request(server).get(`${V1}/notifications`), CHAPTER_B),
      ]);

      expect(ids(a)).toEqual([NOTIF_A]);
      expect(ids(b)).toEqual([NOTIF_B]);
    });

    it('4a. serves the claim’s chapter when no header is sent', async () => {
      app = await boot({ active_chapter_id: CHAPTER_A }, seedTenants());

      const res = await request(app.getHttpServer())
        .get(`${V1}/notifications`)
        .set('authorization', 'Bearer token-bob');

      expect(res.status).toBe(200);
      expect(ids(res)).toEqual([NOTIF_A]);
    });

    it('4b. asks a multi-chapter member with no header and no claim to choose', async () => {
      app = await boot(null, seedTenants());

      const res = await request(app.getHttpServer())
        .get(`${V1}/notifications`)
        .set('authorization', 'Bearer token-bob');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('chapter.context.required');
    });

    it('5a. refuses a council on a chapter-kind route, as a non-member', async () => {
      app = await boot({ active_chapter_id: CHAPTER_B }, seedTenants());

      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/tasks`),
        COUNCIL,
      );

      expect(res.status).toBe(403);
      expectDeniedBody(res.body, 'chapter.context.invalid');
    });

    it('5b. refuses a chapter on a council-kind route, as a non-member', async () => {
      app = await boot({ active_chapter_id: CHAPTER_B }, seedTenants());

      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/council-probe`),
        CHAPTER_B,
      );

      expect(res.status).toBe(403);
      expectDeniedBody(res.body, 'chapter.context.invalid');
    });

    it('5c. serves the council on a council-kind route (positive control)', async () => {
      app = await boot({ active_chapter_id: CHAPTER_B }, seedTenants());

      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/council-probe`),
        COUNCIL,
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ chapter_id: COUNCIL });
    });

    describe('6. GET /v1/tenants/resolve', () => {
      const resolve = (slug: string) =>
        request(app.getHttpServer())
          .get(`${V1}/tenants/resolve`)
          .query({ slug })
          .set('authorization', 'Bearer token-bob');

      /** The body minus `requestId`, which differs on every request. */
      const comparable = (res: request.Response) => {
        const { requestId, ...rest } = res.body as Record<string, unknown>;
        expect(requestId).toEqual(expect.stringMatching(/^req_/));
        return rest;
      };

      it('answers an unknown slug and another tenant’s current and retired slugs identically', async () => {
        app = await boot({ active_chapter_id: CHAPTER_B });

        const unknown = await resolve('nobody-here');
        const theirCurrent = await resolve('alpha-rpi');
        const theirRetired = await resolve('alpha-old');

        expect(unknown.status).toBe(404);
        expect(theirCurrent.status).toBe(404);
        expect(theirRetired.status).toBe(404);
        expect(comparable(unknown)).toEqual(comparable(theirCurrent));
        expect(comparable(unknown)).toEqual(comparable(theirRetired));
        expect(comparable(unknown)).toMatchObject({ code: 'tenant.not_found' });
        expect(JSON.stringify(theirCurrent.body)).not.toContain(CHAPTER_A);
        expect(JSON.stringify(theirRetired.body)).not.toContain('alpha-rpi');
      });

      it('resolves the caller’s own current slug without a redirect', async () => {
        app = await boot({ active_chapter_id: CHAPTER_B });

        const res = await resolve('beta-rpi');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          id: CHAPTER_B,
          name: 'Beta',
          kind: 'chapter',
          slug: 'beta-rpi',
          redirected: false,
        });
      });

      it('redirects the caller’s own retired slug to the current one', async () => {
        app = await boot({ active_chapter_id: CHAPTER_B });

        const res = await resolve('beta-old');

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
          id: CHAPTER_B,
          slug: 'beta-rpi',
          redirected: true,
        });
      });

      it('7. resolves a slug the tenant took back without a redirect', async () => {
        // The state after B retires `beta-rpi` and clears `retired_at` on
        // `beta-old` (the database half of test 7, that another tenant can't
        // insert a retired slug and the owner can take one back, is the
        // `tenant-slugs` PGlite tier).
        const tables = seed();
        tables.tenant_slugs = tables.tenant_slugs.map((row) =>
          row.chapter_id !== CHAPTER_B
            ? row
            : {
                ...row,
                retired_at:
                  row.slug === 'beta-rpi' ? '2026-11-20T00:00:00.000Z' : null,
              },
        );
        app = await boot({ active_chapter_id: CHAPTER_B }, tables);

        const back = await resolve('beta-old');
        const left = await resolve('beta-rpi');

        expect(back.body).toMatchObject({
          slug: 'beta-old',
          redirected: false,
        });
        expect(left.body).toMatchObject({ slug: 'beta-old', redirected: true });
      });
    });

    it('GET /v1/chapters carries each tenant’s slug and kind', async () => {
      app = await boot({ active_chapter_id: CHAPTER_B }, seedTenants());

      const res = await request(app.getHttpServer())
        .get(`${V1}/chapters`)
        .set('authorization', 'Bearer token-bob');

      expect(res.status).toBe(200);
      const byId = Object.fromEntries(
        res.body.map(
          (s: {
            chapter_id: string;
            slug: string;
            kind: string;
            school: null;
          }) => [s.chapter_id, [s.slug, s.kind, s.school]],
        ),
      );
      expect(byId).toEqual({
        [CHAPTER_A]: ['alpha-rpi', 'chapter', null],
        [CHAPTER_B]: ['beta-rpi', 'chapter', null],
        [COUNCIL]: ['rpi-ifc', 'council', null],
      });
    });
  });

  describe('client-supplied chapter id outside ChapterGuard', () => {
    // `/notifications/preferences` carries no ChapterGuard — it takes the chapter
    // straight off the query string, so `assertChapterMembership` in
    // NotificationService is the only thing standing between Bob and chapter A.
    it('does not return another chapter’s notification preferences', async () => {
      app = await boot({ active_chapter_id: CHAPTER_B });

      const res = await request(app.getHttpServer())
        .get(`${V1}/notifications/preferences`)
        .query({ chapterId: CHAPTER_A })
        .set('authorization', 'Bearer token-bob');

      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain('is_enabled');
    });

    it('does not let a caller write notification preferences for another chapter', async () => {
      app = await boot({ active_chapter_id: CHAPTER_B });

      const res = await request(app.getHttpServer())
        .patch(`${V1}/notifications/preferences`)
        .set('authorization', 'Bearer token-bob')
        .send({ chapter_id: CHAPTER_A, category: 'chat', is_enabled: false });

      expect(res.status).toBe(403);
    });
  });

  describe('in-app notification history is active-chapter only (#1518)', () => {
    it('does not list another chapter’s rows while chapter B is active', async () => {
      app = await boot(
        { active_chapter_id: CHAPTER_B },
        seedDualChapterNotifications(),
      );

      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/notifications`),
      );

      expect(res.status).toBe(200);
      expect(res.body.map((n: { id: string }) => n.id)).toEqual([NOTIF_B]);
      expect(JSON.stringify(res.body)).not.toContain(NOTIF_A);
      expect(JSON.stringify(res.body)).not.toContain('Chapter A notice');
    });

    it('does not list another chapter’s rows while chapter A is active', async () => {
      app = await boot(
        { active_chapter_id: CHAPTER_A },
        seedDualChapterNotifications(),
      );

      const res = await asBob(
        request(app.getHttpServer()).get(`${V1}/notifications`),
        CHAPTER_A,
      );

      expect(res.status).toBe(200);
      expect(res.body.map((n: { id: string }) => n.id)).toEqual([NOTIF_A]);
      expect(JSON.stringify(res.body)).not.toContain(NOTIF_B);
      expect(JSON.stringify(res.body)).not.toContain('Chapter B notice');
    });

    it('does not mark another chapter’s notification read', async () => {
      app = await boot(
        { active_chapter_id: CHAPTER_B },
        seedDualChapterNotifications(),
      );

      const foreign = await asBob(
        request(app.getHttpServer()).patch(
          `${V1}/notifications/${NOTIF_A}/read`,
        ),
      );
      expect(foreign.status).toBe(404);

      const own = await asBob(
        request(app.getHttpServer()).patch(
          `${V1}/notifications/${NOTIF_B}/read`,
        ),
      );
      expect(own.status).toBe(200);
      expect(own.body.id).toBe(NOTIF_B);
      expect(own.body.read_at).toEqual(expect.any(String));
    });
  });
});
