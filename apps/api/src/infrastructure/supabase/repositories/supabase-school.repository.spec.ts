import { SupabaseSchoolRepository } from './supabase-school.repository';
import {
  CHAPTER_A,
  CHAPTER_B,
  createTenantHarness,
  type TenantHarness,
} from '#test/helpers/tenant-scope.harness';

/**
 * Tenant scope for the school layer (#5929; school-layer.md § 4.3, "two
 * schools (`school_members`, …)").
 *
 * The tenant here is the school, not a chapter: the harness's two tenant ids
 * stand for school A and school B, and `school_id` is each table's tenant
 * column. One person holds a colliding row at both schools, so only the
 * school filter can tell them apart. A second harness keys `school_members`
 * on `user_id`, for the read that lists one person's own schools.
 */
const SCHOOL_A = CHAPTER_A;
const SCHOOL_B = CHAPTER_B;
const PERSON = '00000000-0000-4000-8000-0000000000aa';

function memberRow(schoolId: string, userId: string) {
  return {
    id: `m-${schoolId.slice(-4)}-${userId.slice(-2)}`,
    school_id: schoolId,
    user_id: userId,
    status: 'member',
    verified_via: 'email_code',
    verified_email: 'student@example.edu',
    verified_at: '2026-11-23T00:00:00Z',
    directory_visibility: 'hidden',
    left_at: null,
    created_at: '2026-11-23T00:00:00Z',
  };
}

function verificationRow(schoolId: string) {
  return {
    id: `v-${schoolId.slice(-4)}`,
    school_id: schoolId,
    user_id: PERSON,
    email: 'student@example.edu',
    code_salt: 'salt',
    code_hash: 'hash',
    ip_hash: null,
    attempts: 0,
    expires_at: '2026-11-23T00:10:00Z',
    closed_at: null,
    outcome: null,
    created_at: '2026-11-23T00:00:00Z',
  };
}

describe('SupabaseSchoolRepository — school scope', () => {
  let harness: TenantHarness;
  let repo: SupabaseSchoolRepository;

  beforeEach(() => {
    harness = createTenantHarness({
      tables: {
        school_members: [
          memberRow(SCHOOL_A, PERSON),
          memberRow(SCHOOL_B, PERSON),
        ],
        school_email_verifications: [
          verificationRow(SCHOOL_A),
          verificationRow(SCHOOL_B),
        ],
        school_slugs: [
          {
            // The harness tracks rows by `id`; the table's key is the slug.
            id: 'slug-a',
            slug: 'school-a',
            school_id: SCHOOL_A,
            retired_at: null,
            created_at: '2026-11-23T00:00:00Z',
          },
          {
            id: 'slug-b',
            slug: 'school-b',
            school_id: SCHOOL_B,
            retired_at: null,
            created_at: '2026-11-23T00:00:00Z',
          },
        ],
        school_email_domains: [
          {
            id: 'd-a',
            school_id: SCHOOL_A,
            domain: 'example.edu',
            include_subdomains: false,
            status: 'verified',
            verified_via: 'staff',
            verified_by: null,
            verified_at: '2026-11-23T00:00:00Z',
            created_at: '2026-11-23T00:00:00Z',
          },
          {
            id: 'd-b',
            school_id: SCHOOL_B,
            domain: 'example.edu',
            include_subdomains: false,
            status: 'verified',
            verified_via: 'staff',
            verified_by: null,
            verified_at: '2026-11-23T00:00:00Z',
            created_at: '2026-11-23T00:00:00Z',
          },
        ],
      },
      tenantColumns: {
        school_members: 'school_id',
        school_email_verifications: 'school_id',
        school_slugs: 'school_id',
        school_email_domains: 'school_id',
      },
      // Row ids and slugs are keys, so twins can't share them; every column
      // a scoped read filters on collides.
      collisionExempt: {
        school_slugs: ['slug'],
      },
    });
    repo = new SupabaseSchoolRepository(harness.client);
  });

  it("findLiveMembership reads one school's row for the person", async () => {
    const row = await harness.expectTenantScoped(SCHOOL_A, () =>
      repo.findLiveMembership(SCHOOL_A, PERSON),
    );

    expect(row).toMatchObject({ school_id: SCHOOL_A, user_id: PERSON });
  });

  it("findOpenVerification reads one school's open code for the person", async () => {
    const row = await harness.expectTenantScoped(SCHOOL_B, () =>
      repo.findOpenVerification(SCHOOL_B, PERSON),
    );

    expect(row).toMatchObject({ id: 'v-' + SCHOOL_B.slice(-4) });
  });

  it('findCurrentSlugs and findVerifiedDomains read only the schools named', async () => {
    const slugs = await repo.findCurrentSlugs([SCHOOL_A]);
    const domains = await repo.findVerifiedDomains([SCHOOL_A]);

    expect([...slugs.entries()]).toEqual([[SCHOOL_A, 'school-a']]);
    expect([...domains.keys()]).toEqual([SCHOOL_A]);
  });

  it('findCurrentSlugs and findVerifiedDomains ask nothing for no schools', async () => {
    await expect(repo.findCurrentSlugs([])).resolves.toEqual(new Map());
    await expect(repo.findVerifiedDomains([])).resolves.toEqual(new Map());
    expect(harness.ops).toHaveLength(0);
  });
});

describe("SupabaseSchoolRepository — a person's own schools", () => {
  it('findLiveMembershipsByUser reads only that person’s rows', async () => {
    const harness = createTenantHarness({
      tables: {
        school_members: [
          { ...memberRow(SCHOOL_A, CHAPTER_A), user_id: CHAPTER_A },
          { ...memberRow(SCHOOL_A, CHAPTER_B), user_id: CHAPTER_B },
        ],
      },
      tenantColumns: { school_members: 'user_id' },
    });
    const repo = new SupabaseSchoolRepository(harness.client);

    const rows = await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.findLiveMembershipsByUser(CHAPTER_A),
    );

    expect(rows.map((r) => r.user_id)).toEqual([CHAPTER_A]);
  });
});
