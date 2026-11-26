import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  TASK_EXTENSION_BLOCK_COUNT,
  TASK_EXTENSION_BLOCK_DAYS,
  TASK_EXTENSION_COPY,
  extensionFitsADay,
  extensionHours,
} from '@repo/validation';
import { SystemPermissions } from '#domain/constants/permissions';
import { TaskStatus, type Task } from '#domain/entities/task.entity';
import type {
  TaskExtensionNeedsOfficer,
  TaskExtensionRequest,
} from '#domain/entities/task-extension-request.entity';
import {
  TASK_REPOSITORY,
  type ITaskRepository,
} from '#domain/repositories/task.repository.interface';
import {
  TASK_EXTENSION_REQUEST_REPOSITORY,
  type ITaskExtensionRequestRepository,
} from '#domain/repositories/task-extension-request.repository.interface';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '#domain/repositories/user.repository.interface';
import {
  extensionSummary,
  extensionStillFits as stillFits,
} from '#domain/utils/task-extension';
import type { TaskExtensionSummary } from '#domain/entities/task.entity';
import { reportCaughtFailure } from '../../../infrastructure/observability/report-caught-failure';
import { NotificationService } from '../notification.service';
import {
  TASK_EXTENSION_PUSH_THREAD,
  formatTaskDue,
  taskExtensionAskedCopy,
  taskExtensionDecidedCopy,
} from '../push-copy';
import { RbacService } from '../rbac.service';
import { checkedDueAt, checkedDueDate } from '../task-input-checks';
import { TaskAudienceService } from '../task-audience.service';
import { displayNameFor, notifyQuietly } from '../task-push';
import { TaskService } from '../task.service';
import { TaskExtensionReasonService } from './task-extension-reason.service';

/** The refusal codes the apps read (`spec/behavior/tasks.md` § Asking for more time). */
export const TASK_EXTENSION_ERRORS = {
  fixed: 'task.extension_fixed_deadline',
  blocked: 'task.extension_blocked',
  waiting: 'task.extension_waiting',
  stale: 'task.extension_stale',
} as const;

const DAY_MS = 86_400_000;

export interface RequestExtensionInput {
  chapterId: string;
  userId: string;
  taskId: string;
  dueDate: string;
  dueAt?: string | null;
  reason: string;
}

/**
 * Asking for more time on a task (#6096, `spec/behavior/tasks.md` § Asking
 * for more time; Paul's design on the issue, 2026-11-25).
 *
 * - The assignee of an open, dated task without a fixed deadline asks for a
 *   later due with a reason. One request waits per task.
 * - One extension of up to a day is approved at once when AI judges the
 *   reason valid. More than a day, a second request on the task, or a
 *   repeating task extended on its previous copy too waits on an officer,
 *   and so does a reason AI calls invalid or can't judge (AI off for the
 *   chapter or the member, or the call failing). Nobody is refused by AI.
 * - Approving moves the due through the officer's edit
 *   (`TaskService.update`), so the reminders re-arm; a group task's copy
 *   moves alone.
 * - A member granted 3 extensions in 30 days can't ask again until an
 *   officer restores it (Winston's default, 2026-11-26).
 */
@Injectable()
export class TaskExtensionService {
  private readonly logger = new Logger(TaskExtensionService.name);

  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(TASK_EXTENSION_REQUEST_REPOSITORY)
    private readonly requests: ITaskExtensionRequestRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly taskService: TaskService,
    private readonly audiences: TaskAudienceService,
    private readonly rbac: RbacService,
    private readonly notificationService: NotificationService,
    private readonly reasons: TaskExtensionReasonService,
  ) {}

  async request(
    input: RequestExtensionInput,
  ): Promise<{ extension: TaskExtensionSummary; now_blocked: boolean }> {
    const { chapterId, userId } = input;
    const task = await this.taskRepo.findById(input.taskId, chapterId);
    if (!task) throw new NotFoundException('Task not found');
    if (task.assignee_id !== userId) {
      throw new ForbiddenException(
        'Only the member a task is for can ask for more time on it',
      );
    }
    if (task.points_awarded || task.status === TaskStatus.COMPLETED) {
      throw new BadRequestException('This task is already done');
    }
    if (!task.due_date) {
      throw new BadRequestException('This task has no due date to move');
    }
    if (task.fixed_deadline) {
      throw new BadRequestException({
        code: TASK_EXTENSION_ERRORS.fixed,
        message: "This task has a fixed deadline, so it can't be extended",
      });
    }
    const standing = await this.requests.standing(chapterId, userId);
    if (standing?.blocked_at) {
      throw new ForbiddenException({
        code: TASK_EXTENSION_ERRORS.blocked,
        message: TASK_EXTENSION_COPY.blocked,
      });
    }

    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('Say why you need more time');
    const from = { due_date: task.due_date.slice(0, 10), due_at: task.due_at };
    const to = this.checkedNewDue(task, input);

    const earlier = (await this.requests.listForTask(chapterId, task.id)).filter(
      (row) => row.status !== 'withdrawn',
    );
    if (earlier.some((row) => row.status === 'pending')) {
      throw new ConflictException({
        code: TASK_EXTENSION_ERRORS.waiting,
        message: 'You already asked for more time on this task',
      });
    }
    let needsOfficer = await this.officerRule(task, from, to, earlier);
    let verdict: Awaited<ReturnType<TaskExtensionReasonService['judge']>> = {
      verdict: null,
    };
    if (!needsOfficer) {
      verdict = await this.reasons.judge({
        chapterId,
        userId,
        title: task.title,
        reason,
      });
      needsOfficer =
        verdict.verdict === 'valid'
          ? null
          : verdict.verdict === 'invalid'
            ? 'reason_invalid'
            : 'ai_unavailable';
    }

    // Written as waiting first, so the one-waiting index refuses a second
    // ask racing this one even on the automatic path.
    const created = await this.requests.create({
      chapter_id: chapterId,
      task_id: task.id,
      requester_id: userId,
      reason,
      from_due_date: from.due_date,
      from_due_at: from.due_at ? new Date(from.due_at).toISOString() : null,
      to_due_date: to.due_date,
      to_due_at: to.due_at,
      status: 'pending',
      needs_officer: needsOfficer,
      ai_verdict: verdict.verdict,
      ai_note: verdict.verdict ? verdict.note : null,
      auto_approved: false,
      decided_by: null,
      decided_at: null,
      decline_reason: null,
    });
    if (!created) {
      throw new ConflictException({
        code: TASK_EXTENSION_ERRORS.waiting,
        message: 'You already asked for more time on this task',
      });
    }

    if (needsOfficer) {
      await this.notifyApprovers(task, created);
      return { extension: extensionSummary(created)!, now_blocked: false };
    }

    const approved = await this.requests.decide(chapterId, created.id, {
      status: 'approved',
      decided_by: null,
      decided_at: new Date().toISOString(),
      auto_approved: true,
    });
    if (!approved) {
      // Decided in the moment between: whatever decided it stands.
      const now = await this.requests.findById(chapterId, created.id);
      return {
        extension: extensionSummary(now ?? created)!,
        now_blocked: false,
      };
    }
    try {
      await this.moveDue(task, approved, task.created_by);
    } catch (error) {
      // The due didn't move: the request waits on an officer instead.
      await this.requests.reopen(chapterId, created.id);
      reportCaughtFailure(this.logger, {
        level: 'warning',
        site: 'task-extension-auto-approve',
        message: `automatic extension on task ${task.id} could not move the due`,
        error,
      });
      await this.notifyApprovers(task, created);
      return { extension: extensionSummary(created)!, now_blocked: false };
    }
    const nowBlocked = await this.blockIfOverLimit(chapterId, userId);
    return { extension: extensionSummary(approved)!, now_blocked: nowBlocked };
  }

  async approve(
    chapterId: string,
    taskId: string,
    requestId: string,
    officerId: string,
  ): Promise<TaskExtensionRequest> {
    const { task, request } = await this.waiting(
      chapterId,
      taskId,
      requestId,
      officerId,
    );
    const approved = await this.requests.decide(chapterId, request.id, {
      status: 'approved',
      decided_by: officerId,
      decided_at: new Date().toISOString(),
    });
    if (!approved) throw this.alreadyDecided();
    try {
      await this.moveDue(task, approved, officerId);
    } catch (error) {
      await this.requests.reopen(chapterId, request.id);
      throw error;
    }
    await this.blockIfOverLimit(chapterId, request.requester_id);
    await this.notifyRequester(task, approved);
    return approved;
  }

  async decline(
    chapterId: string,
    taskId: string,
    requestId: string,
    officerId: string,
    reason: string,
  ): Promise<TaskExtensionRequest> {
    const trimmed = reason.trim();
    if (!trimmed) throw new BadRequestException('Say why not');
    const { task, request } = await this.waiting(
      chapterId,
      taskId,
      requestId,
      officerId,
    );
    const declined = await this.requests.decide(chapterId, request.id, {
      status: 'declined',
      decided_by: officerId,
      decided_at: new Date().toISOString(),
      decline_reason: trimmed,
    });
    if (!declined) throw this.alreadyDecided();
    await this.notifyRequester(task, declined);
    return declined;
  }

  /** Lets a member ask for more time again (#6096). 404 when they could. */
  async restore(chapterId: string, userId: string): Promise<void> {
    const restored = await this.requests.restore(
      chapterId,
      userId,
      new Date().toISOString(),
    );
    if (!restored) {
      throw new NotFoundException('This member can already ask for more time');
    }
  }

  listBlocked(chapterId: string) {
    return this.requests.listBlocked(chapterId);
  }

  /** The asked-for due, checked: later than the task's, and still to come. */
  private checkedNewDue(
    task: Task,
    input: RequestExtensionInput,
  ): { due_date: string; due_at: string | null } {
    const dueDate = checkedDueDate(input.dueDate.slice(0, 10));
    let dueAt: string | null = null;
    if (task.due_at) {
      if (!input.dueAt) {
        throw new BadRequestException(
          'This task is due at a time, so ask for a new time too',
        );
      }
      dueAt = checkedDueAt(dueDate, input.dueAt);
    } else if (input.dueAt) {
      throw new BadRequestException(
        'This task is due by a day, so ask for a new day',
      );
    }
    const to = { due_date: dueDate, due_at: dueAt };
    const hours = extensionHours(
      { due_date: task.due_date, due_at: task.due_at },
      to,
    );
    if (hours === null || hours <= 0) {
      throw new BadRequestException('Ask for a due later than the one it has');
    }
    const endOf = dueAt
      ? Date.parse(dueAt)
      : Date.parse(`${dueDate}T00:00:00.000Z`) + DAY_MS;
    if (endOf <= Date.now()) {
      throw new BadRequestException('Ask for a due that is still to come');
    }
    return to;
  }

  /**
   * Why the request needs an officer whatever its reason, or null when a
   * valid reason may approve it (Paul: "anything over a day, a second
   * request, or if it's a recurring task … back to back").
   */
  private async officerRule(
    task: Task,
    from: { due_date: string; due_at: string | null },
    to: { due_date: string; due_at: string | null },
    earlier: TaskExtensionRequest[],
  ): Promise<TaskExtensionNeedsOfficer | null> {
    if (!extensionFitsADay(from, to)) return 'over_a_day';
    if (earlier.length > 0) return 'second_request';
    if (task.series_id && task.occurrence_date) {
      const previous = await this.requests.previousSeriesCopyId(
        task.chapter_id,
        task.series_id,
        task.occurrence_date,
      );
      if (previous) {
        const before = await this.requests.listForTask(
          task.chapter_id,
          previous,
        );
        if (before.some((row) => row.status === 'approved')) {
          return 'back_to_back';
        }
      }
    }
    return null;
  }

  /** The waiting request an officer acts on, and its task, still as asked. */
  private async waiting(
    chapterId: string,
    taskId: string,
    requestId: string,
    officerId: string,
  ): Promise<{ task: Task; request: TaskExtensionRequest }> {
    const request = await this.requests.findById(chapterId, requestId);
    if (!request || request.task_id !== taskId) {
      throw new NotFoundException('Request not found');
    }
    if (request.requester_id === officerId) {
      throw new ForbiddenException(
        "You can't decide your own request for more time",
      );
    }
    if (request.status !== 'pending') throw this.alreadyDecided();
    const task = await this.taskRepo.findById(taskId, chapterId);
    if (!task) throw new NotFoundException('Task not found');
    if (!stillFits(task, request)) {
      await this.requests.decide(chapterId, request.id, {
        status: 'withdrawn',
        decided_by: null,
        decided_at: new Date().toISOString(),
      });
      throw new ConflictException({
        code: TASK_EXTENSION_ERRORS.stale,
        message:
          'The task changed since they asked (done, handed over or re-dated), so the request is closed',
      });
    }
    return { task, request };
  }

  private alreadyDecided(): ConflictException {
    return new ConflictException('Someone already answered this request');
  }

  /** The officer's edit, so the reminders re-arm (tasks.md § Task Lifecycle). */
  private async moveDue(
    task: Task,
    request: TaskExtensionRequest,
    actorId: string,
  ): Promise<void> {
    await this.taskService.update(task.id, task.chapter_id, actorId, {
      due_date: request.to_due_date,
      due_at: request.to_due_at,
    });
  }

  /**
   * Blocks a member whose extensions reached the limit in the window,
   * counting only those after an officer last restored them. True when
   * this call blocked them.
   */
  private async blockIfOverLimit(
    chapterId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const standing = await this.requests.standing(chapterId, userId);
      if (!standing || standing.blocked_at) return false;
      const windowStart = Date.now() - TASK_EXTENSION_BLOCK_DAYS * DAY_MS;
      const since = Math.max(
        windowStart,
        standing.restored_at ? Date.parse(standing.restored_at) : 0,
      );
      const count = await this.requests.countApprovedSince(
        chapterId,
        userId,
        new Date(since).toISOString(),
      );
      if (count < TASK_EXTENSION_BLOCK_COUNT) return false;
      await this.requests.block(chapterId, userId, new Date().toISOString());
      return true;
    } catch (error) {
      // The extension stands; the cost is a block applied a request late.
      reportCaughtFailure(this.logger, {
        level: 'warning',
        site: 'task-extension-block',
        message: `could not check extension standing for user ${userId}`,
        error,
      });
      return false;
    }
  }

  /**
   * Who hears of a waiting request: the task's creator and the `tasks:manage`
   * holders in the group it is from, never the member who asked. With none of
   * them able to decide (the creator left or lost the permission), every
   * `tasks:manage` holder.
   */
  private async approversOf(task: Task, requesterId: string): Promise<string[]> {
    const followers = await this.taskService.followerRecipients(
      task,
      task.chapter_id,
      [requesterId],
    );
    const named = [task.created_by, ...followers].filter(
      (id) => id !== requesterId,
    );
    const able = await this.audiences.canConfirm(task.chapter_id, named);
    if (able.size > 0) return [...able];
    const managers = await this.rbac.findUserIdsWithPermissions(
      task.chapter_id,
      [SystemPermissions.TASKS_MANAGE],
    );
    return managers.filter((id) => id !== requesterId);
  }

  private async notifyApprovers(
    task: Task,
    request: TaskExtensionRequest,
  ): Promise<void> {
    let approvers: string[];
    try {
      approvers = await this.approversOf(task, request.requester_id);
    } catch (error) {
      reportCaughtFailure(this.logger, {
        level: 'warning',
        site: 'task-extension-approvers',
        message: `could not read who decides the extension on task ${task.id}`,
        error,
      });
      return;
    }
    if (approvers.length === 0) return;
    const name =
      (await displayNameFor(this.userRepo, request.requester_id)) ??
      'A member';
    const copy = (timeZone: string | null) =>
      taskExtensionAskedCopy(
        name,
        task,
        request,
        formatTaskDue(request.to_due_date, request.to_due_at, { timeZone }),
      );
    await Promise.all(
      approvers.map((userId) =>
        notifyQuietly(this.notificationService, this.logger, {
          userId,
          chapterId: task.chapter_id,
          payload: {
            ...copy(null),
            personalize: (recipient) => copy(recipient.timeZone ?? null),
            priority: 'NORMAL',
            category: 'tasks',
            threadId: TASK_EXTENSION_PUSH_THREAD,
            // `view: 'extension'` opens the request in Activity. A build
            // that predates it reads only `screen` and opens the task.
            data: {
              target: { screen: 'tasks', taskId: task.id, view: 'extension' },
            },
          },
          site: 'task-extension-asked',
          about: `task ${task.id} (extension)`,
        }),
      ),
    );
  }

  private async notifyRequester(
    task: Task,
    request: TaskExtensionRequest,
  ): Promise<void> {
    const copy = (timeZone: string | null) =>
      taskExtensionDecidedCopy(
        task,
        request.status === 'approved'
          ? {
              approved: true,
              due: formatTaskDue(request.to_due_date, request.to_due_at, {
                timeZone,
              }),
            }
          : { approved: false, reason: request.decline_reason ?? '' },
      );
    await notifyQuietly(this.notificationService, this.logger, {
      userId: request.requester_id,
      chapterId: task.chapter_id,
      payload: {
        ...copy(null),
        personalize: (recipient) => copy(recipient.timeZone ?? null),
        priority: 'NORMAL',
        category: 'tasks',
        data: { target: { screen: 'tasks', taskId: task.id } },
      },
      site: 'task-extension-decided',
      about: `task ${task.id} (extension ${request.status})`,
    });
  }
}
