import { SupabaseAffiliationRepository } from './supabase-affiliation.repository';
import {
  CHAPTER_A,
  CHAPTER_B,
  createTenantHarness,
  type TenantHarness,
} from '#test/helpers/tenant-scope.harness';

/**
 * Tenant scope for affiliations (#5974, `school-layer.md` § 4.3 "two
 * chapters"). Each read serves one tenant: a chapter's school and council
 * links key on `chapter_id`, a council's on `council_id`, and a school's
 * listing on `school_id`. Twins collide on every other column, so only the
 * tenant filter tells them apart; a single link is read by its id and the
 * tenant together, so another tenant's link id finds nothing.
 */
const SCHOOL = '00000000-0000-4000-8000-0000000000d1';
const COUNCIL = '00000000-0000-4000-8000-0000000000d2';

const schoolLink = (chapterId: string) => ({
  id: `sl-${chapterId.slice(-4)}`,
  school_id: SCHOOL,
  chapter_id: chapterId,
  is_primary: true,
  status: 'active',
  proposed_by: null,
  confirmed_by: null,
  confirmed_at: null,
  ended_at: null,
  created_at: '2026-11-24T00:00:00Z',
});

const councilLink = (column: 'chapter_id' | 'council_id', tenant: string) => ({
  id: `cl-${column}-${tenant.slice(-4)}`,
  council_id: column === 'council_id' ? tenant : COUNCIL,
  chapter_id: column === 'chapter_id' ? tenant : CHAPTER_A,
  status: 'accepted',
  proposed_by_side: 'chapter',
  proposed_by: null,
  decided_by: null,
  decided_at: null,
  created_at: '2026-11-24T00:00:00Z',
});

describe("SupabaseAffiliationRepository — a chapter's links", () => {
  let harness: TenantHarness;
  let repo: SupabaseAffiliationRepository;

  beforeEach(() => {
    harness = createTenantHarness({
      tables: {
        school_chapters: [schoolLink(CHAPTER_A), schoolLink(CHAPTER_B)],
        council_chapters: [
          councilLink('chapter_id', CHAPTER_A),
          councilLink('chapter_id', CHAPTER_B),
        ],
      },
      collisionExempt: { council_chapters: ['council_id'] },
    });
    repo = new SupabaseAffiliationRepository(harness.client);
  });

  it("findLiveSchoolLinks reads one chapter's links", async () => {
    const rows = await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.findLiveSchoolLinks(CHAPTER_A),
    );
    expect(rows.map((r) => r.chapter_id)).toEqual([CHAPTER_A]);
  });

  it("findLiveLinksForChapter reads one chapter's council links", async () => {
    const rows = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.findLiveLinksForChapter(CHAPTER_B),
    );
    expect(rows.map((r) => r.chapter_id)).toEqual([CHAPTER_B]);
  });

  it("findChapterLink finds nothing by another chapter's link id", async () => {
    const other = `cl-chapter_id-${CHAPTER_B.slice(-4)}`;
    const row = await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.findChapterLink(CHAPTER_A, other),
    );
    expect(row).toBeNull();
  });

  it('setSchoolLinkStatus names the chapter to the function', async () => {
    await repo.setSchoolLinkStatus(CHAPTER_A, 'sl-x', 'active', 'user-1');
    expect(harness.rpcCalls).toEqual([
      {
        fn: 'set_school_chapter_status',
        args: {
          p_link_id: 'sl-x',
          p_chapter_id: CHAPTER_A,
          p_status: 'active',
          p_actor: 'user-1',
        },
      },
    ]);
  });
});

describe("SupabaseAffiliationRepository — a council's links", () => {
  let harness: TenantHarness;
  let repo: SupabaseAffiliationRepository;

  beforeEach(() => {
    harness = createTenantHarness({
      tables: {
        council_chapters: [
          councilLink('council_id', CHAPTER_A),
          councilLink('council_id', CHAPTER_B),
        ],
      },
      tenantColumns: { council_chapters: 'council_id' },
      collisionExempt: { council_chapters: ['chapter_id'] },
    });
    repo = new SupabaseAffiliationRepository(harness.client);
  });

  it("findLiveLinksForCouncil reads one council's links", async () => {
    const rows = await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.findLiveLinksForCouncil(CHAPTER_A),
    );
    expect(rows.map((r) => r.council_id)).toEqual([CHAPTER_A]);
  });

  it("findCouncilLink finds nothing by another council's link id", async () => {
    const other = `cl-council_id-${CHAPTER_B.slice(-4)}`;
    const row = await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.findCouncilLink(CHAPTER_A, other),
    );
    expect(row).toBeNull();
  });

  it('setCouncilLinkStatus names both tenants and the side to the function', async () => {
    await repo.setCouncilLinkStatus(
      CHAPTER_A,
      CHAPTER_B,
      'council',
      'accepted',
      'user-1',
    );
    expect(harness.rpcCalls).toEqual([
      {
        fn: 'set_council_chapter_status',
        args: {
          p_council_id: CHAPTER_A,
          p_chapter_id: CHAPTER_B,
          p_side: 'council',
          p_status: 'accepted',
          p_actor: 'user-1',
        },
      },
    ]);
  });
});

describe("SupabaseAffiliationRepository — a school's chapters", () => {
  it('findActiveChapterIdsAtSchool reads one school', async () => {
    const harness = createTenantHarness({
      tables: {
        school_chapters: [
          {
            ...schoolLink(CHAPTER_A),
            id: 'sa',
            school_id: CHAPTER_A,
            chapter_id: 'x',
          },
          {
            ...schoolLink(CHAPTER_B),
            id: 'sb',
            school_id: CHAPTER_B,
            chapter_id: 'x',
          },
        ],
      },
      tenantColumns: { school_chapters: 'school_id' },
    });
    const repo = new SupabaseAffiliationRepository(harness.client);

    const ids = await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.findActiveChapterIdsAtSchool(CHAPTER_A),
    );

    expect(ids).toEqual(['x']);
  });

  it('asks nothing for no schools or no tenants', async () => {
    const harness = createTenantHarness({
      tables: {},
    });
    const repo = new SupabaseAffiliationRepository(harness.client);

    await expect(repo.findCouncilsAtSchools([])).resolves.toEqual([]);
    await expect(repo.findListings([])).resolves.toEqual([]);
    expect(harness.ops).toHaveLength(0);
  });
});
