/**
 * A member asking for more time on a task (#6096, `spec/behavior/tasks.md`
 * § Asking for more time). One waiting request per task.
 */
export type TaskExtensionStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  /** Closed without a decision: the task was done, handed over or re-dated first. */
  | 'withdrawn';

/**
 * Why a request waits on an officer rather than being approved
 * automatically: more than a day, a second request on the task, a repeating
 * task extended on its previous copy too, a reason AI judged invalid, or AI
 * off or failing for the chapter.
 */
export type TaskExtensionNeedsOfficer =
  | 'over_a_day'
  | 'second_request'
  | 'back_to_back'
  | 'reason_invalid'
  | 'ai_unavailable';

export type TaskExtensionAiVerdict = 'valid' | 'invalid';

export interface TaskExtensionRequest {
  id: string;
  chapter_id: string;
  task_id: string;
  requester_id: string;
  reason: string;
  /** The due the task had when asked. */
  from_due_date: string;
  from_due_at: string | null;
  /** The due asked for: a time when the task had one, a day otherwise. */
  to_due_date: string;
  to_due_at: string | null;
  status: TaskExtensionStatus;
  /** Null when it was approved automatically. */
  needs_officer: TaskExtensionNeedsOfficer | null;
  /** What AI made of the reason; null when it wasn't asked or couldn't answer. */
  ai_verdict: TaskExtensionAiVerdict | null;
  ai_note: string | null;
  auto_approved: boolean;
  /** The officer who decided; null while pending and when automatic. */
  decided_by: string | null;
  decided_at: string | null;
  decline_reason: string | null;
  created_at: string;
}
