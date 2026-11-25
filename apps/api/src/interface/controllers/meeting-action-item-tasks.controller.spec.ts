import { SystemPermissions } from '#domain/constants/permissions';
import { MeetingActionItemTasksController } from './meeting-action-item-tasks.controller';

const CHAPTER = 'chapter-1';
const USER = 'user-1';
const MEETING = '11111111-1111-4111-8111-111111111111';

/**
 * The minutes' checkboxes (#4313) and, for an officer, each item's task
 * (#6051): who may read every task is told which task and whose; everyone
 * else only whether it is done (`tasks.md` § Visibility).
 */
describe('MeetingActionItemTasksController', () => {
  const mark = {
    index: 0,
    done: false,
    group: { done: 0, total: 2 },
    task: {
      id: 'task-1',
      who: {
        audience: 'people' as const,
        audience_name: null,
        assignee_ids: ['u-1', 'u-2'],
      },
    },
  };

  function build(manages: boolean) {
    const actionItemTasks = jest.fn(
      async (
        _chapter: string,
        _meeting: string,
        _viewer: string,
        options: { withTask?: boolean },
      ) => [options.withTask ? mark : { ...mark, task: null }],
    );
    const memberHasAnyPermission = jest.fn(async () => manages);
    const controller = new MeetingActionItemTasksController(
      { actionItemTasks } as never,
      { memberHasAnyPermission } as never,
    );
    return { controller, actionItemTasks, memberHasAnyPermission };
  }

  it('tells an officer who manages tasks which task each item became, and whose', async () => {
    const { controller, actionItemTasks, memberHasAnyPermission } = build(true);
    await expect(controller.list(CHAPTER, USER, MEETING)).resolves.toEqual([
      mark,
    ]);
    expect(memberHasAnyPermission).toHaveBeenCalledWith(CHAPTER, USER, [
      SystemPermissions.TASKS_MANAGE,
    ]);
    expect(actionItemTasks).toHaveBeenCalledWith(CHAPTER, MEETING, USER, {
      withTask: true,
    });
  });

  it('tells a member who cannot manage tasks only whether each is done', async () => {
    const { controller, actionItemTasks } = build(false);
    const [only] = await controller.list(CHAPTER, USER, MEETING);
    expect(only).toEqual({ ...mark, task: null });
    expect(actionItemTasks).toHaveBeenCalledWith(CHAPTER, MEETING, USER, {
      withTask: false,
    });
  });
});
