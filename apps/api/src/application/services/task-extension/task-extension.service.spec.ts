import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { TaskStatus, type Task } from '#domain/entities/task.entity';
import type { TaskExtensionRequest } from '#domain/entities/task-extension-request.entity';
import { TaskExtensionService } from './task-extension.service';

const CHAPTER = 'ch-1';
const MEMBER = 'member-1';
const CREATOR = 'officer-1';
const OTHER_OFFICER = 'officer-2';

/** A day ahead of now, as `YYYY-MM-DD`, so a request is always still to come. */
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const task = (over: Partial<Task> = {}): Task => ({
  id: 'task-1',
  chapter_id: CHAPTER,
  title: 'Sweep the porch',
  description: null,
  assignee_id: MEMBER,
  created_by: CREATOR,
  due_date: day(1),
  due_at: null,
  status: TaskStatus.TODO,
  point_reward: null,
  points_awarded: false,
  completed_at: null,
  completed_by: null,
  confirmed_at: null,
  sent_back_at: null,
  proof_kind: 'none',
  proof_link: null,
  sent_back_reason: null,
  completion_note: null,
  series_id: null,
  occurrence_date: null,
  group_id: null,
  meeting_id: null,
  followed_by: null,
  attachments: [],
  fixed_deadline: false,
  created_at: '2026-11-01T00:00:00.000Z',
  ...over,
});

const stored = (
  over: Partial<TaskExtensionRequest> = {},
): TaskExtensionRequest => ({
  id: 'req-1',
  chapter_id: CHAPTER,
  task_id: 'task-1',
  requester_id: MEMBER,
  reason: 'My shift ran late',
  from_due_date: day(1),
  from_due_at: null,
  to_due_date: day(2),
  to_due_at: null,
  status: 'pending',
  needs_officer: null,
  ai_verdict: null,
  ai_note: null,
  auto_approved: false,
  decided_by: null,
  decided_at: null,
  decline_reason: null,
  created_at: '2026-11-26T00:00:00.000Z',
  ...over,
});

describe('TaskExtensionService (#6096)', () => {
  let taskRepo: { findById: jest.Mock };
  let requests: Record<string, jest.Mock>;
  let taskService: { update: jest.Mock; followerRecipients: jest.Mock };
  let audiences: { canConfirm: jest.Mock };
  let rbac: { findUserIdsWithPermissions: jest.Mock };
  let notifications: { notifyUser: jest.Mock };
  let reasons: { judge: jest.Mock };
  let service: TaskExtensionService;

  beforeEach(() => {
    taskRepo = { findById: jest.fn().mockResolvedValue(task()) };
    requests = {
      standing: jest
        .fn()
        .mockResolvedValue({ blocked_at: null, restored_at: null }),
      listForTask: jest.fn().mockResolvedValue([]),
      previousSeriesCopyId: jest.fn().mockResolvedValue(null),
      create: jest.fn((row) => Promise.resolve(stored(row))),
      decide: jest.fn((_c, id, decision) =>
        Promise.resolve(stored({ id, ...decision })),
      ),
      findById: jest.fn().mockResolvedValue(stored()),
      reopen: jest.fn().mockResolvedValue(undefined),
      countApprovedSince: jest.fn().mockResolvedValue(1),
      block: jest.fn().mockResolvedValue(undefined),
      restore: jest.fn().mockResolvedValue(true),
      listBlocked: jest.fn().mockResolvedValue([]),
    };
    taskService = {
      update: jest.fn().mockResolvedValue({}),
      followerRecipients: jest.fn().mockResolvedValue([]),
    };
    audiences = {
      canConfirm: jest.fn((_c, ids: string[]) => Promise.resolve(new Set(ids))),
    };
    rbac = {
      findUserIdsWithPermissions: jest
        .fn()
        .mockResolvedValue([CREATOR, OTHER_OFFICER]),
    };
    notifications = { notifyUser: jest.fn().mockResolvedValue(undefined) };
    reasons = {
      judge: jest
        .fn()
        .mockResolvedValue({ verdict: 'valid', note: 'Work ran late.' }),
    };
    const userRepo = {
      findByIds: jest
        .fn()
        .mockResolvedValue([{ id: MEMBER, display_name: 'Sam Lee' }]),
    };
    service = new TaskExtensionService(
      taskRepo as never,
      requests as never,
      userRepo as never,
      taskService as never,
      audiences as never,
      rbac as never,
      notifications as never,
      reasons as never,
    );
  });

  const ask = (over: Partial<Parameters<TaskExtensionService['request']>[0]> = {}) =>
    service.request({
      chapterId: CHAPTER,
      userId: MEMBER,
      taskId: 'task-1',
      dueDate: day(2),
      reason: '  My shift ran late  ',
      ...over,
    });

  describe('asking', () => {
    it('approves a day with a valid reason at once, through the officer edit', async () => {
      const result = await ask();

      expect(reasons.judge).toHaveBeenCalledWith({
        chapterId: CHAPTER,
        userId: MEMBER,
        title: 'Sweep the porch',
        reason: 'My shift ran late',
      });
      expect(requests.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          needs_officer: null,
          ai_verdict: 'valid',
          reason: 'My shift ran late',
        }),
      );
      expect(requests.decide).toHaveBeenCalledWith(
        CHAPTER,
        'req-1',
        expect.objectContaining({ status: 'approved', auto_approved: true }),
      );
      expect(taskService.update).toHaveBeenCalledWith(
        'task-1',
        CHAPTER,
        CREATOR,
        { due_date: day(2), due_at: null },
      );
      expect(result.extension.status).toBe('approved');
      // Nobody is asked to decide what was already decided.
      expect(notifications.notifyUser).not.toHaveBeenCalled();
    });

    it('sends a reason AI calls invalid to an officer, never refusing it', async () => {
      reasons.judge.mockResolvedValue({ verdict: 'invalid', note: 'No reason.' });

      const result = await ask({ reason: 'forgot' });

      expect(result.extension).toMatchObject({
        status: 'pending',
        needs_officer: 'reason_invalid',
      });
      expect(taskService.update).not.toHaveBeenCalled();
      expect(notifications.notifyUser).toHaveBeenCalledWith(
        CREATOR,
        CHAPTER,
        expect.objectContaining({
          title: 'Sam Lee asks for more time: Sweep the porch',
          data: {
            target: { screen: 'tasks', taskId: 'task-1', view: 'extension' },
          },
        }),
      );
    });

    it('sends every request to an officer when AI is off or fails', async () => {
      reasons.judge.mockResolvedValue({ verdict: null });

      const result = await ask();

      expect(result.extension.needs_officer).toBe('ai_unavailable');
      expect(taskService.update).not.toHaveBeenCalled();
    });

    it('sends more than a day to an officer without asking AI', async () => {
      const result = await ask({ dueDate: day(3) });

      expect(result.extension.needs_officer).toBe('over_a_day');
      expect(reasons.judge).not.toHaveBeenCalled();
    });

    it('sends a second request on the same task to an officer', async () => {
      requests.listForTask.mockResolvedValue([stored({ status: 'approved' })]);
      taskRepo.findById.mockResolvedValue(task({ due_date: day(2) }));

      const result = await ask({ dueDate: day(3) });

      expect(result.extension.needs_officer).not.toBe(null);
      expect(reasons.judge).not.toHaveBeenCalled();
    });

    it('counts a withdrawn request as never asked', async () => {
      requests.listForTask.mockResolvedValue([stored({ status: 'withdrawn' })]);

      const result = await ask();

      expect(result.extension.status).toBe('approved');
    });

    it('sends a repeating task extended on its previous copy to an officer', async () => {
      taskRepo.findById.mockResolvedValue(
        task({ series_id: 'series-1', occurrence_date: day(1) }),
      );
      requests.previousSeriesCopyId.mockResolvedValue('task-0');
      requests.listForTask.mockImplementation((_c, taskId: string) =>
        Promise.resolve(
          taskId === 'task-0' ? [stored({ status: 'approved' })] : [],
        ),
      );

      const result = await ask();

      expect(result.extension.needs_officer).toBe('back_to_back');
    });

    it('asks for a time on a task due at a time, and reads a day by the clock', async () => {
      const dueAt = new Date(Date.now() + 2 * 3_600_000);
      taskRepo.findById.mockResolvedValue(
        task({
          due_date: dueAt.toISOString().slice(0, 10),
          due_at: dueAt.toISOString(),
        }),
      );
      await expect(ask({ dueDate: day(1) })).rejects.toThrow(
        'This task is due at a time, so ask for a new time too',
      );

      const later = new Date(dueAt.getTime() + 25 * 3_600_000);
      const result = await ask({
        dueDate: later.toISOString().slice(0, 10),
        dueAt: later.toISOString(),
      });
      expect(result.extension.needs_officer).toBe('over_a_day');
    });

    it.each([
      [
        'a task with a fixed deadline',
        () => taskRepo.findById.mockResolvedValue(task({ fixed_deadline: true })),
        BadRequestException,
      ],
      [
        "someone else's task",
        () => taskRepo.findById.mockResolvedValue(task({ assignee_id: 'x' })),
        ForbiddenException,
      ],
      [
        'a member past 3 extensions in 30 days',
        () =>
          requests.standing.mockResolvedValue({
            blocked_at: '2026-11-20T00:00:00Z',
            restored_at: null,
          }),
        ForbiddenException,
      ],
      [
        'a task that already has one waiting',
        () =>
          requests.listForTask.mockResolvedValue([
            stored({ status: 'pending' }),
          ]),
        ConflictException,
      ],
      [
        'a finished task',
        () =>
          taskRepo.findById.mockResolvedValue(
            task({ status: TaskStatus.COMPLETED }),
          ),
        BadRequestException,
      ],
      [
        'a task with no due date',
        () => taskRepo.findById.mockResolvedValue(task({ due_date: null })),
        BadRequestException,
      ],
    ])('refuses %s', async (_, arrange, error) => {
      arrange();
      await expect(ask()).rejects.toBeInstanceOf(error);
      expect(requests.create).not.toHaveBeenCalled();
    });

    it('refuses a due no later than the one the task has', async () => {
      await expect(ask({ dueDate: day(1) })).rejects.toThrow(
        'Ask for a due later than the one it has',
      );
    });

    it('answers 409 when a second ask races the first to the waiting slot', async () => {
      requests.create.mockResolvedValue(null);
      await expect(ask()).rejects.toBeInstanceOf(ConflictException);
    });

    it('blocks the member at their 3rd extension in 30 days', async () => {
      requests.countApprovedSince.mockResolvedValue(3);

      const result = await ask();

      expect(result.now_blocked).toBe(true);
      expect(requests.block).toHaveBeenCalledWith(
        CHAPTER,
        MEMBER,
        expect.any(String),
      );
    });

    it('counts only extensions since an officer last restored them', async () => {
      const restored = new Date(Date.now() - 86_400_000).toISOString();
      requests.standing.mockResolvedValue({
        blocked_at: null,
        restored_at: restored,
      });

      await ask();

      expect(requests.countApprovedSince).toHaveBeenCalledWith(
        CHAPTER,
        MEMBER,
        restored,
      );
    });

    it('puts an approval whose due could not move back to an officer', async () => {
      taskService.update.mockRejectedValue(new Error('confirmed meanwhile'));

      const result = await ask();

      expect(requests.reopen).toHaveBeenCalledWith(CHAPTER, 'req-1');
      expect(result.extension.status).toBe('pending');
      expect(notifications.notifyUser).toHaveBeenCalled();
    });
  });

  describe('who hears of a waiting request', () => {
    beforeEach(() => {
      reasons.judge.mockResolvedValue({ verdict: null });
    });

    it('the creator and the officers in the group it is from, never the asker', async () => {
      taskRepo.findById.mockResolvedValue(task({ followed_by: 'role:exec' }));
      taskService.followerRecipients.mockResolvedValue(['follower-1', 'follower-2']);
      audiences.canConfirm.mockResolvedValue(new Set([CREATOR, 'follower-1']));

      await ask();

      const told = notifications.notifyUser.mock.calls.map(([id]) => id);
      expect(told.sort()).toEqual(['follower-1', CREATOR]);
    });

    it('every officer when none of them can decide', async () => {
      audiences.canConfirm.mockResolvedValue(new Set());

      await ask();

      const told = notifications.notifyUser.mock.calls.map(([id]) => id);
      expect(told.sort()).toEqual([CREATOR, OTHER_OFFICER]);
    });
  });

  describe('deciding', () => {
    it('approves: moves the due as the officer, and tells the member', async () => {
      const approved = await service.approve(
        CHAPTER,
        'task-1',
        'req-1',
        OTHER_OFFICER,
      );

      expect(approved.status).toBe('approved');
      expect(taskService.update).toHaveBeenCalledWith(
        'task-1',
        CHAPTER,
        OTHER_OFFICER,
        { due_date: day(2), due_at: null },
      );
      expect(notifications.notifyUser).toHaveBeenCalledWith(
        MEMBER,
        CHAPTER,
        expect.objectContaining({ title: 'Sweep the porch' }),
      );
    });

    it('puts the request back when the due cannot move', async () => {
      taskService.update.mockRejectedValue(new BadRequestException('nope'));

      await expect(
        service.approve(CHAPTER, 'task-1', 'req-1', OTHER_OFFICER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(requests.reopen).toHaveBeenCalledWith(CHAPTER, 'req-1');
    });

    it('declines with the reason, and the due stays', async () => {
      const declined = await service.decline(
        CHAPTER,
        'task-1',
        'req-1',
        OTHER_OFFICER,
        '  The event is Friday ',
      );

      expect(declined).toMatchObject({
        status: 'declined',
        decline_reason: 'The event is Friday',
      });
      expect(taskService.update).not.toHaveBeenCalled();
      expect(notifications.notifyUser).toHaveBeenCalledWith(
        MEMBER,
        CHAPTER,
        expect.objectContaining({
          body: 'Not extended · "The event is Friday"',
        }),
      );
    });

    it("refuses an officer's own request", async () => {
      await expect(
        service.approve(CHAPTER, 'task-1', 'req-1', MEMBER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('closes a request the task has moved past, as a 409', async () => {
      taskRepo.findById.mockResolvedValue(task({ due_date: day(4) }));

      await expect(
        service.approve(CHAPTER, 'task-1', 'req-1', OTHER_OFFICER),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(requests.decide).toHaveBeenCalledWith(
        CHAPTER,
        'req-1',
        expect.objectContaining({ status: 'withdrawn' }),
      );
      expect(taskService.update).not.toHaveBeenCalled();
    });

    it('answers 409 when another officer decided first', async () => {
      requests.decide.mockResolvedValue(null);

      await expect(
        service.decline(CHAPTER, 'task-1', 'req-1', OTHER_OFFICER, 'No'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it('restores a blocked member, and 404s one who was never blocked', async () => {
    await service.restore(CHAPTER, MEMBER);
    expect(requests.restore).toHaveBeenCalledWith(
      CHAPTER,
      MEMBER,
      expect.any(String),
    );

    requests.restore.mockResolvedValue(false);
    await expect(service.restore(CHAPTER, MEMBER)).rejects.toThrow(
      'This member can already ask for more time',
    );
  });
});
