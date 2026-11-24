/**
 * A tenant's URL slug, a row of `tenant_slugs` (ADR-27 decision 5,
 * `20261123194106_tenant_slugs_and_kind.sql`).
 *
 * The primary key is the slug and spans retired rows, so no slug ever passes
 * to a second tenant. A tenant's current slug is its row with no
 * `retired_at`; the database allows one.
 */
export interface TenantSlug {
  slug: string;
  /** Null once the tenant is deleted: the slug stays taken, ownerless. */
  chapter_id: string | null;
  retired_at: string | null;
  created_at: string;
}
