import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import {
  PERMISSIONS_ANY_KEY,
  PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';
import {
  DEFAULT_TENANT_KINDS,
  TENANT_KINDS_KEY,
} from '../decorators/tenant-kinds.decorator';
import { isCouncilPermission } from '@repo/validation';

/**
 * `school-layer.md` § 4.2 rule 1 (#5933): a route that requires a `council:`
 * key serves the council tenant kind alone. A chapter's role can hold any
 * string, so a chapter that gave itself `council:recruitment_view` would
 * reach a council route that forgot `@TenantKinds('council')`, and a
 * council's key on a route that also served chapters would be a switch a
 * chapter's `*` passes. Read off the decorators of every controller here, as
 * `route-access-ledger.spec.ts` reads its guards.
 */

type Handler = (...args: unknown[]) => unknown;

interface KindRoute {
  key: string;
  guards: string[];
  permissions: string[];
  kinds: readonly string[];
}

function metadata<T>(key: string, target: object): T | undefined {
  return Reflect.getMetadata(key, target) as T | undefined;
}

function collect(): KindRoute[] {
  const routes: KindRoute[] = [];
  for (const file of readdirSync(__dirname)) {
    if (!file.endsWith('.controller.ts')) continue;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- every controller in the directory, without a hand-kept list
    const exported = require(join(__dirname, file)) as Record<string, unknown>;
    for (const controller of Object.values(exported)) {
      if (typeof controller !== 'function') continue;
      if (metadata(PATH_METADATA, controller) === undefined) continue;
      const proto = (controller as { prototype: Record<string, Handler> })
        .prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        if (metadata(METHOD_METADATA, handler) === undefined) continue;
        const guards = [controller, handler].flatMap((target) =>
          (metadata<{ name: string }[]>(GUARDS_METADATA, target) ?? []).map(
            (guard) => guard.name,
          ),
        );
        const permissions = [controller, handler].flatMap((target) => [
          ...(metadata<string[]>(PERMISSIONS_KEY, target) ?? []),
          ...(metadata<string[]>(PERMISSIONS_ANY_KEY, target) ?? []),
        ]);
        // Handler first, as `ChapterGuard`'s `getAllAndOverride` reads it.
        const kinds =
          metadata<string[]>(TENANT_KINDS_KEY, handler) ??
          metadata<string[]>(TENANT_KINDS_KEY, controller) ??
          DEFAULT_TENANT_KINDS;
        routes.push({
          key: `${controller.name}.${name}`,
          guards,
          permissions,
          kinds,
        });
      }
    }
  }
  return routes;
}

describe('council route kinds', () => {
  const routes = collect();

  it('finds the council routes (a broken discovery would pass everything below)', () => {
    expect(routes.some((r) => r.key === 'CouncilController.get')).toBe(true);
  });

  it('every route requiring a council key serves the council kind alone', () => {
    const wrong = routes
      .filter((r) => r.permissions.some(isCouncilPermission))
      .filter((r) => r.kinds.length !== 1 || r.kinds[0] !== 'council')
      .map((r) => r.key);
    expect(wrong).toEqual([]);
  });

  it('every route declaring the council kind runs ChapterGuard, which reads it', () => {
    const unread = routes
      .filter((r) => r.kinds.includes('council'))
      .filter((r) => !r.guards.includes('ChapterGuard'))
      .map((r) => r.key);
    expect(unread).toEqual([]);
  });

  it('a council-only route is a CouncilController route', () => {
    const councilOnly = routes
      .filter(
        (r) =>
          r.guards.includes('ChapterGuard') &&
          r.kinds.length === 1 &&
          r.kinds[0] === 'council',
      )
      .map((r) => r.key);
    expect(councilOnly.length).toBeGreaterThan(0);
    for (const key of councilOnly) expect(key).toMatch(/^Council/);
  });
});
