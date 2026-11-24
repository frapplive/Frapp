import { SupabaseTenantSlugRepository } from './supabase-tenant-slug.repository';
import {
  CHAPTER_A,
  CHAPTER_B,
  createTenantHarness,
  type TenantHarness,
} from '#test/helpers/tenant-scope.harness';

/**
 * Tenant scope for the slug registry (ADR-27, #5918).
 *
 * `findCurrentByChapterIds` reads only the tenants it is given. It filters
 * with `.in`, which `expectTenantScoped` doesn't count as a tenant predicate
 * (it wants `.eq`), so the results are checked by hand against twins that
 * collide on every column the query filters by. `findBySlug` is global on purpose (a slug
 * names one tenant, whoever asks), so its spec pins that it returns the row
 * as stored, retired or not, and `TenantService.resolve` is what refuses a
 * reader who isn't that tenant's member.
 */
describe('SupabaseTenantSlugRepository — tenant scope', () => {
  let harness: TenantHarness;
  let repo: SupabaseTenantSlugRepository;

  beforeEach(() => {
    harness = createTenantHarness({
      tables: {
        tenant_slugs: [
          {
            slug: 'alpha-rpi',
            chapter_id: CHAPTER_A,
            retired_at: null,
            created_at: '2026-11-23T00:00:00Z',
          },
          {
            slug: 'alpha-old',
            chapter_id: CHAPTER_A,
            retired_at: '2026-11-01T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
          },
          {
            slug: 'beta-rpi',
            chapter_id: CHAPTER_B,
            retired_at: null,
            created_at: '2026-11-23T00:00:00Z',
          },
          {
            slug: 'beta-old',
            chapter_id: CHAPTER_B,
            retired_at: '2026-11-01T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      // The slug is the table's primary key, so twins can't share one. The
      // scoped read filters on `chapter_id` and `retired_at`, which collide.
      collisionExempt: { tenant_slugs: ['slug'] },
    });
    repo = new SupabaseTenantSlugRepository(harness.client);
  });

  it('findCurrentByChapterIds reads one tenant’s current slug only', async () => {
    const rows = await repo.findCurrentByChapterIds([CHAPTER_A]);

    expect(rows.map((r) => r.slug)).toEqual(['alpha-rpi']);
    expect(rows.every((r) => r.chapter_id === CHAPTER_A)).toBe(true);
  });

  it('findCurrentByChapterIds returns each named tenant’s current slug, retired ones left out', async () => {
    const rows = await repo.findCurrentByChapterIds([CHAPTER_A, CHAPTER_B]);

    expect(rows.map((r) => r.slug).sort()).toEqual(['alpha-rpi', 'beta-rpi']);
  });

  it('findCurrentByChapterIds asks nothing for no tenants', async () => {
    await expect(repo.findCurrentByChapterIds([])).resolves.toEqual([]);
    expect(harness.ops).toHaveLength(0);
  });

  it('findBySlug returns the row as stored, retired or current', async () => {
    await expect(repo.findBySlug('alpha-old')).resolves.toMatchObject({
      chapter_id: CHAPTER_A,
      retired_at: '2026-11-01T00:00:00Z',
    });
    await expect(repo.findBySlug('beta-rpi')).resolves.toMatchObject({
      chapter_id: CHAPTER_B,
      retired_at: null,
    });
    await expect(repo.findBySlug('nobody-here')).resolves.toBeNull();
  });
});
