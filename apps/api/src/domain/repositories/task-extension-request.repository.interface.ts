import type {
  TaskExtensionRequest,
  TaskExtensionStatus,
} from '../entities/task-extension-request.entity';

export const TASK_EXTENSION_REQUEST_REPOSITORY =
  'TASK_EXTENSION_REQUEST_REPOSITORY';

/** A new request, as the service writes it. */
export type NewTaskExtensionRequest = Omit<
  TaskExtensionRequest,
  'id' | 'created_at'
>;

/** A decision written onto a waiting request. */
export interface TaskExtensionDecision {
  status: Exclude<TaskExtensionStatus, 'pending'>;
  decided_by: string | null;
  decided_at: string;
  decline_reason?: string | null;
  auto_approved?: boolean;
}

/** A member's standing to ask (#6096). */
export interface ExtensionStanding {
  blocked_at: string | null;
  restored_at: string | null;
}

/**
 * Requests for more time on a task (#6096), and the member-level block a
 * member reaches at 3 extensions in 30 days.
 */
export interface ITaskExtensionRequestRepository {
  /**
   * Writes a request. A second waiting one on the same task breaks the
   * one-pending index: returns null then, so the caller answers 409.
   */
  create(row: NewTaskExtensionRequest): Promise<TaskExtensionRequest | null>;
  findById(chapterId: string, id: string): Promise<TaskExtensionRequest | null>;
  /** Every request on the task, newest first. */
  listForTask(
    chapterId: string,
    taskId: string,
  ): Promise<TaskExtensionRequest[]>;
  /** The newest request on each of the tasks given. */
  latestForTasks(
    chapterId: string,
    taskIds: string[],
  ): Promise<Map<string, TaskExtensionRequest>>;
  /** The chapter's waiting requests, oldest first. */
  listPending(
    chapterId: string,
    limit: number,
    exceptRequester: string,
  ): Promise<TaskExtensionRequest[]>;
  /**
   * Moves a waiting request to its decision, as a compare-and-set on
   * `status = 'pending'`: null when it was decided first.
   */
  decide(
    chapterId: string,
    id: string,
    decision: TaskExtensionDecision,
  ): Promise<TaskExtensionRequest | null>;
  /**
   * Closes the task's waiting request, if any, as withdrawn: the task was
   * re-dated, fixed or handed over before anyone decided.
   */
  withdrawPending(chapterId: string, taskId: string): Promise<void>;
  /** Puts an approval that couldn't be applied back to waiting. */
  reopen(chapterId: string, id: string): Promise<void>;
  /** How many extensions the member was granted since `since`. */
  countApprovedSince(
    chapterId: string,
    requesterId: string,
    since: string,
  ): Promise<number>;
  /**
   * The copy of a repeating series just before `occurrenceDate`, or null
   * when this is its first.
   */
  previousSeriesCopyId(
    chapterId: string,
    seriesId: string,
    occurrenceDate: string,
  ): Promise<string | null>;
  standing(
    chapterId: string,
    userId: string,
  ): Promise<ExtensionStanding | null>;
  /** Blocks the member from asking; a block already set keeps its time. */
  block(chapterId: string, userId: string, at: string): Promise<void>;
  /** Clears a block; false when the member had none. */
  restore(chapterId: string, userId: string, at: string): Promise<boolean>;
  /** The members who can't ask, newest block first. */
  listBlocked(
    chapterId: string,
  ): Promise<{ user_id: string; blocked_at: string }[]>;
}
