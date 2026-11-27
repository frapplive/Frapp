import { MeetingActionItemTasksController } from './meeting-action-item-tasks.controller';

const CHAPTER = '11111111-1111-4111-8111-111111111111';
const VIEWER = '22222222-2222-4222-8222-222222222222';
const MEETING = '55555555-5555-4555-8555-555555555555';

const mark = {
  index: 0,
  done: false,
  group: null,
  status: 'TODO',
  assignee_ids: ['33333333-3333-4333-8333-333333333333'],
  task_id: 't-1',
};

function build(manages: boolean) {
  const suggestions = {
    actionItemTasks: jest.fn(async () => [mark]),
    makeTask: jest.fn(async () => mark),
  };
  const rbac = { memberHasAnyPermission: jest.fn(async () => manages) };
  const controller = new MeetingActionItemTasksController(
    suggestions as never,
    rbac as never,
  );
  return { controller, suggestions, rbac };
}

describe('MeetingActionItemTasksController (#6062)', () => {
  it('gives a task manager the task id', async () => {
    const { controller, rbac } = build(true);
    await expect(controller.list(CHAPTER, VIEWER, MEETING)).resolves.toEqual([
      mark,
    ]);
    expect(rbac.memberHasAnyPermission).toHaveBeenCalledWith(CHAPTER, VIEWER, [
      'tasks:manage',
    ]);
  });

  it('shows anyone else who has it and its status, without the task id', async () => {
    const { controller } = build(false);
    await expect(controller.list(CHAPTER, VIEWER, MEETING)).resolves.toEqual([
      { ...mark, task_id: null },
    ]);
  });

  it('passes the write on with the chapter’s modules', async () => {
    const { controller, suggestions } = build(true);
    const body = { text: 'Book the bus', assignee_ids: [VIEWER] };
    await controller.makeTask(
      CHAPTER,
      VIEWER,
      { tasks: true },
      MEETING,
      2,
      body,
    );
    expect(suggestions.makeTask).toHaveBeenCalledWith(
      CHAPTER,
      VIEWER,
      MEETING,
      2,
      body,
      { tasks: true },
    );
  });
});
