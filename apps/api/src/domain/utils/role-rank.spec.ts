import {
  addedPermissions,
  canAssignAt,
  canAssignRoleOnMemberAt,
  canCorrectProfileAt,
  canReach,
  canSetPledgeClassOf,
  effectivePermissions,
  holderRank,
  OUTSIDE_TIERS_RANK,
  permissionsNotHeld,
  ranksAtOrAbove,
  roleRank,
  tierPositions,
  WILDCARD_RANK,
  type ActorReach,
} from './role-rank';

// A chapter that renamed and reordered its tiers: nothing here may read a
// tier's name or assume there are four (#4068 decision 5).
const positions = tierPositions([
  { id: 'board', position: 1 },
  { id: 'chairs', position: 2 },
  { id: 'brothers', position: 3 },
]);

const role = (tier_id: string | null, permissions: string[] = []) => ({
  tier_id,
  permissions,
});

function actor(rank: number, permissions: string[] = []): ActorReach {
  return {
    memberId: 'm',
    rank,
    permissions: new Set(permissions),
    wildcard: permissions.includes('*'),
  };
}

describe('roleRank', () => {
  it("reads the chapter's own position for the role's tier", () => {
    expect(roleRank(role('chairs'), positions)).toBe(2);
  });

  it('ranks a role outside the tiers, or in a tier it cannot find, below every tier', () => {
    expect(roleRank(role(null), positions)).toBe(OUTSIDE_TIERS_RANK);
    expect(roleRank(role('deleted'), positions)).toBe(OUTSIDE_TIERS_RANK);
  });

  it('ranks a wildcard role above everything, wherever it sits', () => {
    expect(roleRank(role('brothers', ['*']), positions)).toBe(WILDCARD_RANK);
  });
});

describe('holderRank and ranksAtOrAbove', () => {
  it("takes the highest of a member's roles", () => {
    expect(
      holderRank([role('brothers'), role('chairs'), role(null)], positions),
    ).toBe(2);
    expect(holderRank([], positions)).toBe(OUTSIDE_TIERS_RANK);
  });

  it('answers whether A ranks at or above B', () => {
    expect(ranksAtOrAbove(1, 2)).toBe(true);
    expect(ranksAtOrAbove(2, 2)).toBe(true);
    expect(ranksAtOrAbove(3, 2)).toBe(false);
    expect(ranksAtOrAbove(OUTSIDE_TIERS_RANK, OUTSIDE_TIERS_RANK)).toBe(true);
  });
});

describe('canReach', () => {
  it('reaches only what ranks strictly below the actor', () => {
    const chair = actor(2);
    expect(canReach(chair, 3)).toBe(true);
    expect(canReach(chair, OUTSIDE_TIERS_RANK)).toBe(true);
    expect(canReach(chair, 2)).toBe(false);
    expect(canReach(chair, 1)).toBe(false);
    expect(canReach(chair, WILDCARD_RANK)).toBe(false);
  });

  it('reaches nothing from outside the tiers', () => {
    expect(canReach(actor(OUTSIDE_TIERS_RANK), OUTSIDE_TIERS_RANK)).toBe(false);
  });

  it('lets a wildcard holder reach everything', () => {
    expect(canReach(actor(WILDCARD_RANK, ['*']), WILDCARD_RANK)).toBe(true);
  });
});

describe('canAssignAt', () => {
  it('reaches only below without roles:assign_own_level', () => {
    expect(canAssignAt(actor(2), 3)).toBe(true);
    expect(canAssignAt(actor(2), 2)).toBe(false);
  });

  it("reaches the actor's own rank too with it, never above (#5725)", () => {
    const cabinet = actor(1, ['roles:assign_own_level']);
    expect(canAssignAt(cabinet, 2)).toBe(true);
    expect(canAssignAt(cabinet, 1)).toBe(true);
    expect(canAssignAt(cabinet, WILDCARD_RANK)).toBe(false);
  });

  it('still reaches nothing from outside the tiers', () => {
    const outside = actor(OUTSIDE_TIERS_RANK, ['roles:assign_own_level']);
    expect(canAssignAt(outside, OUTSIDE_TIERS_RANK)).toBe(false);
  });
});

describe('canAssignRoleOnMemberAt (#5843, #5903)', () => {
  it('on a member below or level, follows canAssignAt', () => {
    expect(canAssignRoleOnMemberAt(actor(2), 3, 3)).toBe(true);
    expect(canAssignRoleOnMemberAt(actor(2), 3, 2)).toBe(true);
    expect(canAssignRoleOnMemberAt(actor(2), 2, 2)).toBe(false);
    const cabinet = actor(1, ['roles:assign_own_level']);
    expect(canAssignRoleOnMemberAt(cabinet, 1, 1)).toBe(true);
  });

  it('on a member ranked above, the President included, reaches only roles below the actor', () => {
    expect(canAssignRoleOnMemberAt(actor(2), 3, 1)).toBe(true);
    expect(canAssignRoleOnMemberAt(actor(1), 2, WILDCARD_RANK)).toBe(true);
    expect(canAssignRoleOnMemberAt(actor(1), OUTSIDE_TIERS_RANK, 0)).toBe(true);
    expect(canAssignRoleOnMemberAt(actor(2), 2, 1)).toBe(false);
    expect(canAssignRoleOnMemberAt(actor(2), 1, 1)).toBe(false);
    expect(canAssignRoleOnMemberAt(actor(1), WILDCARD_RANK, 0)).toBe(false);
  });

  it('never reaches their own rank on a member above, even with roles:assign_own_level', () => {
    const cabinet = actor(1, ['roles:assign_own_level']);
    expect(canAssignRoleOnMemberAt(cabinet, 1, WILDCARD_RANK)).toBe(false);
  });

  it('reaches no other member from outside the tiers', () => {
    const outside = actor(OUTSIDE_TIERS_RANK, ['roles:assign_own_level']);
    expect(
      canAssignRoleOnMemberAt(outside, OUTSIDE_TIERS_RANK, OUTSIDE_TIERS_RANK),
    ).toBe(false);
    expect(canAssignRoleOnMemberAt(outside, OUTSIDE_TIERS_RANK, 1)).toBe(false);
  });
});

describe('canCorrectProfileAt (#5900)', () => {
  it('reaches a member below or level with the actor, never above', () => {
    expect(canCorrectProfileAt(actor(2), 3)).toBe(true);
    expect(canCorrectProfileAt(actor(2), 2)).toBe(true);
    expect(canCorrectProfileAt(actor(2), 1)).toBe(false);
  });

  it('never reaches a `*` holder, even from the top tier (#5903 kept this)', () => {
    expect(canCorrectProfileAt(actor(1), WILDCARD_RANK)).toBe(false);
  });

  it('reaches a member outside the tiers, but not from outside them', () => {
    expect(canCorrectProfileAt(actor(3), OUTSIDE_TIERS_RANK)).toBe(true);
    expect(
      canCorrectProfileAt(actor(OUTSIDE_TIERS_RANK), OUTSIDE_TIERS_RANK),
    ).toBe(false);
  });
});

describe('canSetPledgeClassOf (#5903)', () => {
  it('reaches any member from inside the tiers, the President included', () => {
    expect(canSetPledgeClassOf(actor(3))).toBe(true);
    expect(canSetPledgeClassOf(actor(WILDCARD_RANK, ['*']))).toBe(true);
  });

  it('reaches no other member from outside the tiers', () => {
    expect(canSetPledgeClassOf(actor(OUTSIDE_TIERS_RANK))).toBe(false);
  });
});

describe('permissionsNotHeld', () => {
  it('lists what the actor would grant without holding, once each, sorted', () => {
    expect(
      permissionsNotHeld(actor(2, ['tasks:manage']), [
        'tasks:manage',
        'roles:manage',
        'billing:view',
        'roles:manage',
      ]),
    ).toEqual(['billing:view', 'roles:manage']);
  });

  it('is empty for a wildcard holder', () => {
    expect(permissionsNotHeld(actor(0, ['*']), ['roles:manage'])).toEqual([]);
  });
});

describe('effectivePermissions', () => {
  // The same rule as the database's role_effective_permissions.
  it("is the tier's list plus overrides that are on, minus those that are off", () => {
    expect(
      effectivePermissions(['members:view', 'polls:create'], {
        'polls:create': false,
        'service:approve': true,
      }),
    ).toEqual(['members:view', 'service:approve']);
  });
});

describe('addedPermissions', () => {
  it('lists what after holds that before does not', () => {
    expect(addedPermissions(['a', 'b'], ['b', 'c', 'c', 'a'])).toEqual(['c']);
  });
});
