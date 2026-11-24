import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RUSH_MEMBER_PERMISSIONS } from '@repo/validation';
import { RushController } from './rush.controller';
import { PermissionsGuard } from '../guards/permissions.guard';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { RushService } from '../../application/services/rush.service';
import type { RbacService } from '../../application/services/rbac.service';
import type { FrappSupabaseClient } from '../../infrastructure/supabase/database.types';
import {
  DEFAULT_SYSTEM_ROLES,
  SystemPermissions,
  SystemRoleKeys,
} from '#domain/constants/permissions';

/**
 * Recruitment's permissions (#4070). Until then every rush route asked only
 * for `members:view`, so the decorators are what the change is: drop one and
 * any member can vote or record a bid again, with no other test noticing.
 * The routes are pinned, and the real `PermissionsGuard` is run against each
 * to show a role without the key is refused.
 */
describe('RushController permissions', () => {
  const controller = new RushController({} as RushService, {} as RbacService);

  const ROUTES = [
    ['lookup', SystemPermissions.RUSH_VIEW],
    ['matches', SystemPermissions.RUSH_VIEW],
    ['getOne', SystemPermissions.RUSH_VIEW],
    ['create', SystemPermissions.RUSH_ADD],
    ['vote', SystemPermissions.RUSH_VOTE],
    ['bid', SystemPermissions.RUSH_BID],
  ] as const;

  it('floors every route at members:view', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RushController)).toEqual([
      SystemPermissions.MEMBERS_VIEW,
    ]);
  });

  it.each(ROUTES)('%s requires %s', (handler, permission) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, controller[handler])).toEqual([
      permission,
    ]);
  });

  /** A guard whose role lookup answers one role with `permissions`. */
  const guardFor = (permissions: readonly string[]) => {
    const from = (table: string) => {
      const chain = {
        select: () => chain,
        in: () => chain,
        eq: () => chain,
        then: (resolve: (result: { data: unknown[] }) => unknown) =>
          resolve({
            data: table === 'roles' ? [{ permissions: [...permissions] }] : [],
          }),
      };
      return chain;
    };
    return new PermissionsGuard(new Reflector(), {
      from,
    } as unknown as FrappSupabaseClient);
  };

  const contextFor = (handler: (typeof ROUTES)[number][0]): ExecutionContext =>
    ({
      getHandler: () => controller[handler],
      getClass: () => RushController,
      switchToHttp: () => ({
        getRequest: () => ({
          member: { role_ids: ['role-1'], custom_role_ids: [] },
          chapterId: 'chapter-1',
        }),
      }),
    }) as unknown as ExecutionContext;

  describe.each(ROUTES)('%s', (handler, permission) => {
    it(`refuses a role that holds every other rush key but not ${permission}`, async () => {
      const others = [
        SystemPermissions.MEMBERS_VIEW,
        ...RUSH_MEMBER_PERMISSIONS,
        SystemPermissions.RUSH_MANAGE,
      ].filter((held) => held !== permission);

      await expect(
        guardFor(others).canActivate(contextFor(handler)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('admits the seeded Member role, as before the keys existed', async () => {
      const member = DEFAULT_SYSTEM_ROLES.find(
        (role) => role.system_key === SystemRoleKeys.MEMBER,
      )!;

      await expect(
        guardFor(member.permissions).canActivate(contextFor(handler)),
      ).resolves.toBe(true);
    });

    it('admits the wildcard', async () => {
      await expect(
        guardFor([SystemPermissions.WILDCARD]).canActivate(contextFor(handler)),
      ).resolves.toBe(true);
    });
  });
});

/**
 * `rush:view_results` gates no route (#4084): each candidate read, vote and
 * bid asks whether the caller holds it, and the service leaves the count out
 * when not. Pinned here so a handler can't skip the question and show the
 * count to everyone again.
 */
describe('RushController rush:view_results', () => {
  const setup = (canViewResults: boolean) => {
    const rushService = {
      findView: jest.fn().mockResolvedValue({}),
      findViewByName: jest.fn().mockResolvedValue({}),
      vote: jest.fn().mockResolvedValue({}),
      bid: jest.fn().mockResolvedValue({}),
    };
    const rbacService = {
      memberHasAnyPermission: jest.fn().mockResolvedValue(canViewResults),
    };
    return build(rushService, rbacService);
  };

  const build = (
    rushService: Record<string, jest.Mock>,
    rbacService: { memberHasAnyPermission: jest.Mock },
  ) => {
    const controller = new RushController(
      rushService as unknown as RushService,
      rbacService as unknown as RbacService,
    );
    return { controller, rushService, rbacService };
  };

  // The permission read starts before the service runs, so a request that
  // fails first (a 404) must not leave its rejection unhandled.
  it('leaves no unhandled rejection when the permission read fails after a 404', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { controller } = build(
        { findView: jest.fn().mockRejectedValue(new Error('not found')) },
        {
          memberHasAnyPermission: jest
            .fn()
            .mockRejectedValue(new Error('roles read failed')),
        },
      );
      await expect(
        controller.getOne('ch-1', 'user-1', 'cand-1'),
      ).rejects.toThrow('not found');
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it.each([true, false])(
    "passes canViewResults=%s from the caller's roles to every read",
    async (canViewResults) => {
      const { controller, rushService, rbacService } = setup(canViewResults);

      await controller.lookup('ch-1', 'user-1', { name: 'Sam' });
      await controller.getOne('ch-1', 'user-1', 'cand-1');
      await controller.vote('ch-1', 'user-1', 'cand-1');
      await controller.bid('ch-1', 'user-1', 'cand-1');

      const viewers = [
        rushService.findViewByName.mock.calls[0][1],
        rushService.findView.mock.calls[0][2],
        rushService.vote.mock.calls[0][2],
        rushService.bid.mock.calls[0][2],
      ];
      for (const viewer of viewers) {
        expect(viewer.id).toBe('user-1');
        await expect(viewer.canViewResults).resolves.toBe(canViewResults);
      }
      expect(rbacService.memberHasAnyPermission).toHaveBeenCalledTimes(4);
      for (const call of rbacService.memberHasAnyPermission.mock.calls) {
        expect(call).toEqual([
          'ch-1',
          'user-1',
          [SystemPermissions.RUSH_VIEW_RESULTS],
        ]);
      }
    },
  );
});
