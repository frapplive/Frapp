import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RUSH_MEMBER_PERMISSIONS } from '@repo/validation';
import { RushBidController } from './rush-bid.controller';
import { PermissionsGuard } from '../guards/permissions.guard';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { RushBidService } from '../../application/services/rush-bid.service';
import type { FrappSupabaseClient } from '../../infrastructure/supabase/database.types';
import { SystemPermissions } from '#domain/constants/permissions';

/**
 * The bid answers (#5973): recording a decline or an acceptance takes
 * `rush:bid`, as extending does; confirming a recorded acceptance and
 * rescinding take `rush:manage` (`spec/behavior/rush.md` § Bids). The keys
 * are pinned per route and the real `PermissionsGuard` run against each, so
 * dropping a decorator lets any member answer a bid only with a failing test.
 */
describe('RushBidController permissions', () => {
  const controller = new RushBidController({} as RushBidService);

  const ROUTES = [
    ['decline', SystemPermissions.RUSH_BID],
    ['accept', SystemPermissions.RUSH_BID],
    ['confirm', SystemPermissions.RUSH_MANAGE],
    ['rescind', SystemPermissions.RUSH_MANAGE],
  ] as const;

  it('floors every route at members:view', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, RushBidController)).toEqual([
      SystemPermissions.MEMBERS_VIEW,
    ]);
  });

  it.each(ROUTES)('%s requires %s', (handler, permission) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, controller[handler])).toEqual([
      permission,
    ]);
  });

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
      getClass: () => RushBidController,
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

    it('admits a role holding the key', async () => {
      await expect(
        guardFor([SystemPermissions.MEMBERS_VIEW, permission]).canActivate(
          contextFor(handler),
        ),
      ).resolves.toBe(true);
    });
  });
});
