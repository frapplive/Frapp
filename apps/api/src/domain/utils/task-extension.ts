import {
  TaskStatus,
  type Task,
  type TaskExtensionSummary,
} from '../entities/task.entity';
import type { TaskExtensionRequest } from '../entities/task-extension-request.entity';

/**
 * What a task read says about a request for more time (#6096): the request
 * without the AI's verdict and note, and without who decided, which are for
 * the officer's row in Activity, not the task.
 */
export function extensionSummary(
  request: TaskExtensionRequest | undefined | null,
): TaskExtensionSummary | null {
  if (!request) return null;
  return {
    id: request.id,
    status: request.status,
    reason: request.reason,
    from_due_date: request.from_due_date,
    from_due_at: request.from_due_at,
    to_due_date: request.to_due_date,
    to_due_at: request.to_due_at,
    needs_officer: request.needs_officer,
    auto_approved: request.auto_approved,
    decline_reason: request.decline_reason,
    decided_at: request.decided_at,
    created_at: request.created_at,
  };
}

/**
 * Whether a waiting request still fits its task: still open, still the
 * asker's, without a fixed deadline, and still due when it was when they
 * asked. One that doesn't is closed when an officer acts on it, and left
 * out of Activity until then.
 */
export function extensionStillFits(
  task: Task,
  request: TaskExtensionRequest,
): boolean {
  if (task.points_awarded || task.status === TaskStatus.COMPLETED) return false;
  if (task.assignee_id !== request.requester_id) return false;
  if (task.fixed_deadline) return false;
  if ((task.due_date?.slice(0, 10) ?? null) !== request.from_due_date) {
    return false;
  }
  const at = (value: string | null) =>
    value ? new Date(value).toISOString() : null;
  return at(task.due_at) === at(request.from_due_at);
}
