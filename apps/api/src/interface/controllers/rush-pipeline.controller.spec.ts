import { RushPipelineController } from './rush-pipeline.controller';
import {
  PERMISSIONS_ANY_KEY,
  PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';
import { REQUIRED_MODULE_KEY } from '../decorators/module.decorator';
import type { RushPipelineService } from '../../application/services/rush-pipeline.service';
import type { RbacService } from '../../application/services/rbac.service';
import { SystemPermissions } from '#domain/constants/permissions';

/**
 * The pipeline's routes (#5924). Each key is the whole gate on its route, so
 * a dropped or swapped decorator would let any member edit stages or read
 * notes with no other test noticing.
 */
describe('RushPipelineController permissions', () => {
  const controller = new RushPipelineController(
    {} as RushPipelineService,
    {} as RbacService,
  );

  const ROUTES = [
    ['pipeline', SystemPermissions.RUSH_VIEW],
    ['stages', SystemPermissions.RUSH_VIEW],
    ['saveStages', SystemPermissions.RUSH_MANAGE],
    ['moveStage', SystemPermissions.RUSH_ADD],
    ['createTag', SystemPermissions.RUSH_MANAGE],
    ['renameTag', SystemPermissions.RUSH_MANAGE],
    ['deleteTag', SystemPermissions.RUSH_MANAGE],
    ['setTags', SystemPermissions.RUSH_NOTES],
    ['rate', SystemPermissions.RUSH_VOTE],
    ['notes', SystemPermissions.RUSH_READ_NOTES],
    ['addNote', SystemPermissions.RUSH_NOTES],
    ['editNote', SystemPermissions.RUSH_NOTES],
  ] as const;

  it('floors every route at members:view behind the rush module', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, RushPipelineController),
    ).toEqual([SystemPermissions.MEMBERS_VIEW]);
    expect(
      Reflect.getMetadata(REQUIRED_MODULE_KEY, RushPipelineController),
    ).toBe('rush');
  });

  it.each(ROUTES)('%s requires %s', (handler, permission) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, controller[handler])).toEqual([
      permission,
    ]);
    expect(
      Reflect.getMetadata(PERMISSIONS_ANY_KEY, controller[handler]),
    ).toBeUndefined();
  });

  it('deleteNote requires rush:notes or rush:manage', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_ANY_KEY, controller.deleteNote),
    ).toEqual([SystemPermissions.RUSH_NOTES, SystemPermissions.RUSH_MANAGE]);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, controller.deleteNote),
    ).toBeUndefined();
  });
});

describe('RushPipelineController permission reads', () => {
  const build = (held: boolean) => {
    const pipelineService = {
      getPipeline: jest.fn().mockResolvedValue({}),
      deleteNote: jest.fn().mockResolvedValue(undefined),
    };
    const rbacService = {
      memberHasAnyPermission: jest.fn().mockResolvedValue(held),
    };
    const controller = new RushPipelineController(
      pipelineService as unknown as RushPipelineService,
      rbacService as unknown as RbacService,
    );
    return { controller, pipelineService, rbacService };
  };

  it.each([true, false])(
    "pipeline passes the viewer's rush:view_results (%s) through",
    async (held) => {
      const { controller, pipelineService, rbacService } = build(held);

      await controller.pipeline('ch-1', 'user-1');

      expect(rbacService.memberHasAnyPermission).toHaveBeenCalledWith(
        'ch-1',
        'user-1',
        [SystemPermissions.RUSH_VIEW_RESULTS],
      );
      const [chapterId, viewer] = pipelineService.getPipeline.mock.calls[0];
      expect(chapterId).toBe('ch-1');
      expect(viewer.id).toBe('user-1');
      await expect(viewer.canViewResults).resolves.toBe(held);
    },
  );

  it('pipeline leaves no unhandled rejection when the permission read fails', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const pipelineService = {
        getPipeline: jest.fn().mockRejectedValue(new Error('read failed')),
      };
      const controller = new RushPipelineController(
        pipelineService as unknown as RushPipelineService,
        {
          memberHasAnyPermission: jest
            .fn()
            .mockRejectedValue(new Error('roles read failed')),
        } as unknown as RbacService,
      );
      await expect(controller.pipeline('ch-1', 'user-1')).rejects.toThrow(
        'read failed',
      );
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it.each([true, false])(
    'deleteNote passes canManage=%s from rush:manage',
    async (held) => {
      const { controller, pipelineService, rbacService } = build(held);

      await controller.deleteNote('ch-1', 'user-1', 'cand-1', 'note-1');

      expect(rbacService.memberHasAnyPermission).toHaveBeenCalledWith(
        'ch-1',
        'user-1',
        [SystemPermissions.RUSH_MANAGE],
      );
      expect(pipelineService.deleteNote).toHaveBeenCalledWith(
        'note-1',
        'cand-1',
        'ch-1',
        'user-1',
        held,
      );
    },
  );
});
