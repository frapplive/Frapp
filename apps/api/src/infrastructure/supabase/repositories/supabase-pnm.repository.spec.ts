import { SupabasePnmRepository } from './supabase-pnm.repository';
import {
  CHAPTER_A,
  CHAPTER_B,
  createTenantHarness,
} from '#test/helpers/tenant-scope.harness';

/**
 * Tenant scope for PNM records (#5974, `school-layer.md` § 4.3's colliding
 * twins): two councils at one school (seasons, registrations, dismissals),
 * two schools (`pnms`), two chapters (`pnm_interests` and the chapter's own
 * candidate link). The harness's two tenant ids stand for whichever tenant
 * the table keys on.
 */
const PNM = '00000000-0000-4000-8000-0000000000e1';
const STAMP = '2026-11-24T00:00:00Z';

const season = (councilId: string) => ({
  id: `s-${councilId.slice(-4)}`,
  council_id: councilId,
  term: 'Spring 2027',
  opens_at: STAMP,
  closes_at: '2027-02-10T00:00:00Z',
  bid_window_opens_at: null,
  bid_window_closes_at: null,
  status: 'open',
  pnm_retention_days: 180,
  created_at: STAMP,
  updated_at: STAMP,
});

const registration = (councilId: string) => ({
  id: `r-${councilId.slice(-4)}`,
  pnm_id: PNM,
  council_id: councilId,
  term: 'Spring 2027',
  status: 'registered',
  created_at: STAMP,
});

const pnmRow = (schoolId: string) => ({
  id: `p-${schoolId.slice(-4)}`,
  school_id: schoolId,
  user_id: null,
  school_email: 'pat@example.edu',
  email_verified_at: STAMP,
  first_name: 'Pat',
  last_name: 'Tier',
  preferred_name: null,
  class_year: 2030,
  phone: null,
  phone_shared: false,
  merged_into_id: null,
  created_via: 'interest_form',
  created_at: STAMP,
  updated_at: STAMP,
});

const interest = (chapterId: string) => ({
  id: `i-${chapterId.slice(-4)}`,
  pnm_id: PNM,
  chapter_id: chapterId,
  registration_id: null,
  source: 'interest_form',
  source_label: null,
  created_at: STAMP,
  withdrawn_at: null,
});

describe('SupabasePnmRepository — two councils at one school', () => {
  function setup() {
    const harness = createTenantHarness({
      tables: {
        council_recruitment_seasons: [season(CHAPTER_A), season(CHAPTER_B)],
        pnm_council_registrations: [
          registration(CHAPTER_A),
          registration(CHAPTER_B),
        ],
        pnm_duplicate_dismissals: [
          {
            id: 'd-a',
            council_id: CHAPTER_A,
            pnm_a: 'x',
            pnm_b: 'y',
            dismissed_by: null,
            created_at: STAMP,
          },
          {
            id: 'd-b',
            council_id: CHAPTER_B,
            pnm_a: 'x',
            pnm_b: 'y',
            dismissed_by: null,
            created_at: STAMP,
          },
        ],
      },
      tenantColumns: {
        council_recruitment_seasons: 'council_id',
        pnm_council_registrations: 'council_id',
        pnm_duplicate_dismissals: 'council_id',
      },
    });
    return { harness, repo: new SupabasePnmRepository(harness.client) };
  }

  it("findSeason and findSeasons read one council's seasons", async () => {
    const { harness, repo } = setup();
    const row = await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.findSeason(CHAPTER_A, 'Spring 2027'),
    );
    expect(row?.council_id).toBe(CHAPTER_A);
    const rows = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.findSeasons(CHAPTER_B),
    );
    expect(rows.map((r) => r.council_id)).toEqual([CHAPTER_B]);
  });

  it("findRegistrations and findRegistrantIds read one council's list", async () => {
    const { harness, repo } = setup();
    const rows = await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.findRegistrations(CHAPTER_A, 'Spring 2027'),
    );
    expect(rows.map((r) => r.council_id)).toEqual([CHAPTER_A]);
    const ids = await harness.expectTenantScoped(CHAPTER_B, () =>
      repo.findRegistrantIds(CHAPTER_B, [PNM]),
    );
    expect(ids).toEqual([PNM]);
    await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.findAllRegistrantIds(CHAPTER_A),
    );
  });

  it("findDismissals reads one council's answers", async () => {
    const { harness, repo } = setup();
    const rows = await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.findDismissals(CHAPTER_A),
    );
    expect(rows.map((r) => r.council_id)).toEqual([CHAPTER_A]);
  });

  it('merge passes the acting council to merge_pnms', async () => {
    const { harness, repo } = setup();
    await repo.merge(CHAPTER_A, 'p1', 'p2', 'user-1');
    expect(harness.rpcCalls).toEqual([
      {
        fn: 'merge_pnms',
        args: {
          p_council_id: CHAPTER_A,
          p_survivor: 'p1',
          p_loser: 'p2',
          p_actor: 'user-1',
        },
      },
    ]);
  });
});

describe('SupabasePnmRepository — two schools', () => {
  it('findLivePnmsAtSchool reads one school', async () => {
    const harness = createTenantHarness({
      tables: { pnms: [pnmRow(CHAPTER_A), pnmRow(CHAPTER_B)] },
      tenantColumns: { pnms: 'school_id' },
    });
    const repo = new SupabasePnmRepository(harness.client);

    const rows = await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.findLivePnmsAtSchool(CHAPTER_A, [
        `p-${CHAPTER_A.slice(-4)}`,
        `p-${CHAPTER_B.slice(-4)}`,
      ]),
    );

    expect(rows.map((r) => r.school_id)).toEqual([CHAPTER_A]);
  });
});

describe('SupabasePnmRepository — two chapters', () => {
  function setup() {
    const harness = createTenantHarness({
      tables: {
        pnm_interests: [interest(CHAPTER_A), interest(CHAPTER_B)],
      },
    });
    return { harness, repo: new SupabasePnmRepository(harness.client) };
  }

  it('findInterests reads only the chapters named', async () => {
    const { harness, repo } = setup();
    // A council reads its accepted chapters together, so the filter is a
    // list, not one chapter: the list is what keeps the other chapter out.
    const rows = await repo.findInterests([PNM], [CHAPTER_A]);
    expect(rows.map((r) => r.chapter_id)).toEqual([CHAPTER_A]);
    expect(harness.ops[0]).toMatchObject({ table: 'pnm_interests' });
    expect(harness.ops[0].filters).toContainEqual(
      expect.objectContaining({ column: 'chapter_id', value: [CHAPTER_A] }),
    );
  });

  it("isLinkedToChapter reads only that chapter's interest and candidate", async () => {
    const candidate = (chapterId: string) => ({
      id: `rc-${chapterId.slice(-4)}`,
      chapter_id: chapterId,
      pnm_id: PNM,
      display_name: 'Pat Tier',
      name_key: 'pat tier',
      user_id: null,
      stage: 'new',
      bid_status: 'none',
      created_by: 'u',
      created_at: STAMP,
      origin: 'pnm',
    });
    const harness = createTenantHarness({
      tables: {
        pnm_interests: [
          { ...interest(CHAPTER_A), withdrawn_at: STAMP },
          { ...interest(CHAPTER_B), withdrawn_at: STAMP },
        ],
        rush_candidates: [candidate(CHAPTER_A), candidate(CHAPTER_B)],
      },
    });
    const repo = new SupabasePnmRepository(harness.client);

    // A withdrawn interest doesn't link; the chapter's own candidate does.
    const linked = await harness.expectTenantScoped(CHAPTER_A, () =>
      repo.isLinkedToChapter(CHAPTER_A, PNM),
    );

    expect(linked).toBe(true);
  });

  it('asks nothing for no PNMs or no chapters', async () => {
    const { harness, repo } = setup();
    await expect(repo.findInterests([], [CHAPTER_A])).resolves.toEqual([]);
    await expect(repo.findInterests([PNM], [])).resolves.toEqual([]);
    await expect(repo.findLivePnmsAtSchool(CHAPTER_A, [])).resolves.toEqual([]);
    expect(harness.ops).toHaveLength(0);
  });
});
