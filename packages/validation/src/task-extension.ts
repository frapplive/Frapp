/**
 * Asking for more time on a task (#6096; Paul's design on the issue,
 * 2026-11-25; Winston's defaults, 2026-11-26). The rules both apps and the
 * API share, and the words both apps say. `spec/behavior/tasks.md`
 * § Asking for more time owns the behaviour.
 */

/** The longest extension approved without an officer: one day. */
export const TASK_EXTENSION_AUTO_MAX_HOURS = 24;

/** A reason is one short line. */
export const TASK_EXTENSION_REASON_MAX_LENGTH = 300;

/** An officer's reason for declining, as long as a send-back's. */
export const TASK_EXTENSION_DECLINE_MAX_LENGTH = 200;

/**
 * A member granted this many extensions in {@link TASK_EXTENSION_BLOCK_DAYS}
 * days can't ask again until an officer restores it (Winston's default,
 * 2026-11-26, to Paul's "they get their task extending privileges lost").
 */
export const TASK_EXTENSION_BLOCK_COUNT = 3;
export const TASK_EXTENSION_BLOCK_DAYS = 30;

export const TASK_EXTENSION_STATUSES = [
  "pending",
  "approved",
  "declined",
  "withdrawn",
] as const;
export type TaskExtensionStatus = (typeof TASK_EXTENSION_STATUSES)[number];

/** Why a request waits on an officer instead of being approved at once. */
export const TASK_EXTENSION_NEEDS_OFFICER = [
  "over_a_day",
  "second_request",
  "back_to_back",
  "reason_invalid",
  "ai_unavailable",
] as const;
export type TaskExtensionNeedsOfficer =
  (typeof TASK_EXTENSION_NEEDS_OFFICER)[number];

/** A due as a task holds it. */
export interface TaskDue {
  due_date: string | null;
  due_at?: string | null;
}

/** Days between two `YYYY-MM-DD` days (b − a), read as calendar days. */
function dayGap(a: string, b: string): number {
  const at = (day: string) => {
    const [y, m, d] = day.slice(0, 10).split("-").map(Number);
    return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((at(b) - at(a)) / 86_400_000);
}

/**
 * How many hours later `to` is than `from`: by the clock for a task due at a
 * time, by whole days for one due by a day. Null when either has no day.
 */
export function extensionHours(from: TaskDue, to: TaskDue): number | null {
  if (!from.due_date || !to.due_date) return null;
  if (from.due_at && to.due_at) {
    return (Date.parse(to.due_at) - Date.parse(from.due_at)) / 3_600_000;
  }
  return dayGap(from.due_date, to.due_date) * 24;
}

/** Whether an extension is short enough to be approved without an officer. */
export function extensionFitsADay(from: TaskDue, to: TaskDue): boolean {
  const hours = extensionHours(from, to);
  return hours !== null && hours > 0 && hours <= TASK_EXTENSION_AUTO_MAX_HOURS;
}

/** What a task read carries about its latest request (the API's `extension`). */
export interface TaskExtensionSummaryLike {
  status: TaskExtensionStatus | string;
}

/** The parts of a task read the Ask for more time rule reads. */
export interface ExtendableTask extends TaskDue {
  assignee_id: string;
  status?: string;
  stored_status?: string;
  points_awarded?: boolean;
  fixed_deadline?: boolean;
  extension?: TaskExtensionSummaryLike | null;
  extension_requests_blocked?: boolean;
}

/**
 * Why the viewer can't ask for more time on a task, or null when they can.
 * `not_mine`, `done` and `no_due` hide the action; `fixed`, `waiting` and
 * `blocked` show the reason in its place.
 */
export type CantAskForMoreTime =
  | "not_mine"
  | "done"
  | "no_due"
  | "fixed"
  | "waiting"
  | "blocked";

export function cantAskForMoreTime(
  task: ExtendableTask,
  viewerId: string | null | undefined,
): CantAskForMoreTime | null {
  if (!viewerId || task.assignee_id !== viewerId) return "not_mine";
  const stored = task.stored_status ?? task.status;
  if (task.points_awarded || stored === "COMPLETED") return "done";
  if (!task.due_date) return "no_due";
  if (task.fixed_deadline) return "fixed";
  if (task.extension?.status === "pending") return "waiting";
  if (task.extension_requests_blocked) return "blocked";
  return null;
}

/** The words both apps use, so web and the phone say the same thing. */
export const TASK_EXTENSION_COPY = {
  /** The assignee's action. */
  ask: "Ask for more time",
  /** The sheet or dialog's title. */
  title: "Ask for more time",
  newDue: "New due",
  reasonLabel: "Why do you need more time?",
  reasonPlaceholder: "A shift ran late, waiting on keys…",
  send: "Send",
  /** Under the fields, before sending. */
  hint: "Up to a day with a good reason is approved right away. Anything more goes to an officer.",
  /** The switch on a task's form. */
  fixedDeadline: "Fixed deadline",
  fixedDeadlineHint: "No extensions. It shows as urgent to whoever has it.",
  /** In the action's place on a task with a fixed deadline. */
  fixedNoExtensions: "Fixed deadline · no extensions",
  /** What the assignee sees while their request waits. */
  waiting: "Asked for more time · waiting on an officer",
  /** After an automatic approval. */
  approvedNow: "More time granted",
  declined: "Not extended",
  blocked: `You've had ${TASK_EXTENSION_BLOCK_COUNT} extensions in ${TASK_EXTENSION_BLOCK_DAYS} days, so an officer needs to restore extension requests before you ask again.`,
  /** The officer's actions. */
  approve: "Approve",
  decline: "Decline",
  declineTitle: "Decline more time",
  declineReasonLabel: "Why not?",
  declineReasonPlaceholder: "The event is Friday, so it can't move",
  /** Where the officer finds a blocked member. */
  restore: "Restore extension requests",
  restored: "Extension requests restored",
  blockedBadge: `Can't ask for more time (${TASK_EXTENSION_BLOCK_COUNT} extensions in ${TASK_EXTENSION_BLOCK_DAYS} days)`,
  /** The row in an officer's Needs you. */
  asks: (name: string) => `${name} asks for more time`,
} as const;

/** Why a request waits on an officer, as the officer's row says it. */
export const TASK_EXTENSION_NEEDS_OFFICER_LABELS: Record<
  TaskExtensionNeedsOfficer,
  string
> = {
  over_a_day: "More than a day",
  second_request: "Second request on this task",
  back_to_back: "Extended last time too",
  reason_invalid: "Reason may not hold up",
  ai_unavailable: "Needs your call",
};
