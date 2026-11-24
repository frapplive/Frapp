import type { TenantSlug } from '../entities/tenant-slug.entity';

export const TENANT_SLUG_REPOSITORY = 'TENANT_SLUG_REPOSITORY';

/** The `tenant_slugs` registry (ADR-27 decision 5). Read-only in step 1. */
export interface ITenantSlugRepository {
  /**
   * The slug's row, current or retired, whoever holds it, or null. Slugs are
   * global, so this is not tenant-scoped: the caller decides whether the
   * reader may know about the row (`TenantService.resolve`).
   */
  findBySlug(slug: string): Promise<TenantSlug | null>;
  /** The current slug of each of these tenants that has one. */
  findCurrentByChapterIds(chapterIds: string[]): Promise<TenantSlug[]>;
}
