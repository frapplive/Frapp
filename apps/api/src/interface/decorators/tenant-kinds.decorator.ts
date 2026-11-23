import { SetMetadata } from '@nestjs/common';
import type { TenantKind } from '@repo/validation';

export const TENANT_KINDS_KEY = 'tenant_kinds';

/**
 * The tenant kinds (`chapters.kind`) a `ChapterGuard` route serves, per
 * ADR-27 decision 3.
 *
 * A route without it serves `chapter` alone (`DEFAULT_TENANT_KINDS`), so
 * every route written before councils existed refuses a council tenant
 * without being edited. A council route says `@TenantKinds('council')`, and a
 * route that serves both lists both. A tenant of a kind the route doesn't
 * serve is refused as `403 chapter.context.invalid`, the same answer a
 * non-member gets, so the response doesn't reveal what the id is.
 *
 * A handler-level decorator overrides the class (`getAllAndOverride`).
 */
export const TenantKinds = (...kinds: [TenantKind, ...TenantKind[]]) =>
  SetMetadata(TENANT_KINDS_KEY, kinds);

export const DEFAULT_TENANT_KINDS: readonly TenantKind[] = ['chapter'];
