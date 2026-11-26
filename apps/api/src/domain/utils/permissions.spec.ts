import {
  authorityCeiling,
  ceilingPermits,
  flattenPermissionSets,
  resolveRequiredPermissions,
} from './permissions';

describe('flattenPermissionSets', () => {
  it('unions every role, skipping a missing list', () => {
    expect([
      ...flattenPermissionSets([['a', 'b'], null, ['b', 'c'], undefined]),
    ]).toEqual(['a', 'b', 'c']);
  });
});

describe('resolveRequiredPermissions', () => {
  it('demands nothing when no level sets metadata', () => {
    expect(resolveRequiredPermissions()).toEqual({ all: [], anyOf: [] });
  });

  it('merges both levels of all-of, handler first, without duplicates', () => {
    expect(resolveRequiredPermissions(['b', 'a', 'b'], ['a', 'c']).all).toEqual(
      ['b', 'a', 'c'],
    );
  });

  it('keeps each level of any-of as its own group, handler first', () => {
    expect(
      resolveRequiredPermissions(undefined, undefined, ['x', 'y'], ['z']).anyOf,
    ).toEqual([['x', 'y'], ['z']]);
  });

  it('sets no group for an empty any-of list', () => {
    expect(resolveRequiredPermissions(['a'], [], [], ['z'])).toEqual({
      all: ['a'],
      anyOf: [['z']],
    });
  });

  it('copies the metadata, so a caller editing the result leaves it alone', () => {
    const handlerAny = ['x'];
    const { anyOf } = resolveRequiredPermissions(
      undefined,
      undefined,
      handlerAny,
    );
    anyOf[0].push('y');
    expect(handlerAny).toEqual(['x']);
  });
});

describe('authorityCeiling', () => {
  it('is unbounded when both sides hold the wildcard', () => {
    const ceiling = authorityCeiling(['*'], ['*']);
    expect(ceiling.unbounded).toBe(true);
    expect(ceilingPermits(ceiling, 'roles:manage')).toBe(true);
  });

  it('is bounded by the injector when only the caller holds the wildcard', () => {
    const ceiling = authorityCeiling(['*'], ['members:view']);
    expect(ceiling.unbounded).toBe(false);
    expect(ceilingPermits(ceiling, 'members:view')).toBe(true);
    expect(ceilingPermits(ceiling, 'roles:manage')).toBe(false);
  });

  it('is bounded by the caller when only the injector holds the wildcard', () => {
    const ceiling = authorityCeiling(['members:view'], ['*']);
    expect(ceiling.unbounded).toBe(false);
    expect(ceilingPermits(ceiling, 'members:view')).toBe(true);
    expect(ceilingPermits(ceiling, '*')).toBe(false);
  });

  it('intersects when neither side holds the wildcard', () => {
    const ceiling = authorityCeiling(
      ['members:view', 'billing:view'],
      ['members:view', 'polls:create'],
    );
    expect([...ceiling.permissions]).toEqual(['members:view']);
  });

  it("is the caller's own permissions when there is no injector", () => {
    expect(authorityCeiling(['*']).unbounded).toBe(true);
    const ceiling = authorityCeiling(['members:view']);
    expect(ceilingPermits(ceiling, 'members:view')).toBe(true);
    expect(ceilingPermits(ceiling, 'roles:manage')).toBe(false);
  });

  it('permits nothing when the injector holds nothing', () => {
    const ceiling = authorityCeiling(['*'], []);
    expect(ceilingPermits(ceiling, 'members:view')).toBe(false);
  });
});
