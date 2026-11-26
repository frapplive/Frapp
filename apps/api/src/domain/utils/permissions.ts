import { WILDCARD } from '../constants/permissions';

/**
 * Flatten a member's role permission lists into one effective permission set.
 *
 * This is the single definition of the flatten policy: the union of every
 * held role's `permissions`. Both `PermissionsGuard` and `RbacService` call
 * it so route enforcement can never drift from what `/users/me/permissions`
 * reports.
 */
export function flattenPermissionSets(
  rolePermissionLists: readonly (readonly string[] | null | undefined)[],
): Set<string> {
  const set = new Set<string>();
  for (const permissions of rolePermissionLists) {
    for (const permission of permissions ?? []) set.add(permission);
  }
  return set;
}

/** What a route demands, after handler- and class-level metadata are merged. */
export interface RequiredPermissions {
  /** Every one of these is required. */
  all: string[];
  /** AND of ORs: the caller must hold at least one permission from each group. */
  anyOf: string[][];
}

/**
 * The permissions a route demands, from its `@RequirePermissions` and
 * `@RequireAnyOfPermissions` metadata on the handler and on its controller.
 *
 * - `all` is the union of both levels' `@RequirePermissions` lists, handler
 *   first, order kept, duplicates dropped.
 * - `anyOf` holds one OR-group per level that set `@RequireAnyOfPermissions`,
 *   handler first; the caller must satisfy every group. An empty list sets no
 *   group.
 *
 * `PermissionsGuard` enforces exactly this, so anything that must know what a
 * route demands without running the guard (an in-process call skips Nest's
 * guards, #1306) computes it here (#3275).
 */
export function resolveRequiredPermissions(
  handlerAll?: readonly string[],
  classAll?: readonly string[],
  handlerAny?: readonly string[],
  classAny?: readonly string[],
): RequiredPermissions {
  const all: string[] = [];
  const seen = new Set<string>();
  for (const list of [handlerAll, classAll]) {
    for (const permission of list ?? []) {
      if (!seen.has(permission)) {
        seen.add(permission);
        all.push(permission);
      }
    }
  }

  const anyOf: string[][] = [];
  if (handlerAny?.length) anyOf.push([...handlerAny]);
  if (classAny?.length) anyOf.push([...classAny]);

  return { all, anyOf };
}

/**
 * The permission set an action may draw on when it acts for `caller` on text
 * `injector` wrote.
 *
 * It is the *intersection* of the two: a benign question must not let text
 * someone else wrote reach for anything its author couldn't do themselves.
 * With no injector, the caller's own permissions are the ceiling.
 *
 * The wildcard is handled explicitly rather than as a literal string. The
 * President's authority is the seeded `*`, so a naive set intersection would
 * produce a near-empty ceiling and refuse every legitimate read.
 */
export interface AuthorityCeiling {
  /** Both sides hold `*`; every permission is permitted. */
  unbounded: boolean;
  /** Permitted permissions when not unbounded. */
  permissions: Set<string>;
}

export function authorityCeiling(
  caller: Iterable<string>,
  injector?: Iterable<string>,
): AuthorityCeiling {
  const callerSet = new Set(caller);
  const injectorSet = injector === undefined ? callerSet : new Set(injector);

  const callerWild = callerSet.has(WILDCARD);
  const injectorWild = injectorSet.has(WILDCARD);

  // Each branch below returns a set that provably cannot contain the wildcard:
  // reaching it means the *other* side was not wildcard, and both-wildcard is
  // already handled. So no filtering of `*` out of the result is needed.
  if (callerWild && injectorWild) {
    return { unbounded: true, permissions: new Set() };
  }
  if (callerWild) {
    return { unbounded: false, permissions: injectorSet };
  }
  if (injectorWild) {
    return { unbounded: false, permissions: callerSet };
  }
  return {
    unbounded: false,
    permissions: new Set([...callerSet].filter((p) => injectorSet.has(p))),
  };
}

export function ceilingPermits(
  ceiling: AuthorityCeiling,
  permission: string,
): boolean {
  return ceiling.unbounded || ceiling.permissions.has(permission);
}
