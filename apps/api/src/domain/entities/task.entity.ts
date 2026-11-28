import type {
  FrappLink,
  TaskGroupAudience,
  TaskGroupProgress,
  TaskProofKind,
} from '@repo/validation';
import type {
  TaskExtensionNeedsOfficer,
  TaskExtensionStatus,
} from './task-extension-request.entity';

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  OVERDUE = 'OVERDUE',
}

export interface Task {
  id: string;
  chapter_id: string;
  title: string;
  description: string | null;
  assignee_id: string;
  created_by: string;
  /**
   * The calendar day the task is due (`YYYY-MM-DD`), or null for a task with
   * no due date (#5761): never overdue, no due reminders, sorted after every
   * dated task, and never repeating.
   */
  due_date: string | null;
  /**
   * The moment the task is due, when it has a time of day (#4003). Null for a
   * task due on `due_date` with no time. When set, `due_date` is still the
   * calendar day the creator saw, and overdue starts at this instant.
   */
  due_at: string | null;
  status: TaskStatus;
  point_reward: number | null;
  points_awarded: boolean;
  completed_at: string | null;
  /**
   * Who marked it done (#5732): the assignee, or an officer marking it done
   * for them. Set with `completed_at`, cleared with it. Null on a completion
   * from before the column, which reads as the assignee's.
   */
  completed_by: string | null;
  confirmed_at: string | null;
  /**
   * When an officer last sent the completion back to the assignee; `null`
   * if never. The assignee taking back their own completion doesn't set it.
   */
  sent_back_at: string | null;
  /**
   * What Mark done needs (#4635): nothing, one or more proof photos, or a
   * link. `none` by default. Replaced #4565's `photo_required`.
   */
  proof_kind: TaskProofKind;
  /**
   * The assignee's link proof, sent with Mark done (http/https, stored as
   * typed, never fetched). Cleared with the completion, like proof photos.
   */
  proof_link: string | null;
  /**
   * Why an officer last sent the completion back (#4635). Kept through the
   * next Mark done so the officer sees what they asked beside the reply, and
   * cleared when the task is handed to someone else.
   */
  sent_back_reason: string | null;
  /** The assignee's reply sent with Mark done, cleared with the completion. */
  completion_note: string | null;
  /**
   * The repeating series this task is a copy of (#5119), or null for a task
   * that doesn't repeat. Kept when the series ends; cleared only if its row
   * is deleted.
   */
  series_id: string | null;
  /** A copy's day in its series' pattern (`YYYY-MM-DD`); null otherwise. */
  occurrence_date: string | null;
  /**
   * The group task this is one member's copy of (#4295 step 3), or null for a
   * task given to one person. Each copy is an ordinary task with its own
   * progress, proof and points.
   */
  group_id: string | null;
  /**
   * The minutes this task was suggested from (#5562), or null. The screens
   * read the meeting's name from it, so a renamed meeting shows its new
   * name; cleared if the minutes are deleted.
   */
  meeting_id: string | null;
  /**
   * The tier, role or group the task is from (#5473), as `tier:<id>`,
   * `role:<id>` or `group:<id>`, or null. Its active members, read live, can
   * read the task and its progress (not its proof) and hear when it is
   * finished or overdue; it grants nothing else.
   */
  followed_by: string | null;
  /**
   * What is attached (`spec/behavior/frapp-links.md`), in order, at most
   * `FRAPP_LINKS_MAX`. A record link stores ids only, never a name: the
   * screens read each one's name for the member looking. A group's copies
   * hold the same list; a series' copies are made with its template's.
   */
  attachments: FrappLink[];
  /**
   * A fixed deadline (#6096, Paul 2026-11-25): never eligible for an
   * extension, and shown more urgent to its assignee. Set by whoever creates
   * or edits the task (`tasks:manage`).
   */
  fixed_deadline: boolean;
  created_at: string;
}

/**
 * A task given to a group (#4295 step 3): one row naming who it went to, and
 * one ordinary `tasks` row per member (a copy), made together.
 */
export interface TaskGroup {
  id: string;
  chapter_id: string;
  created_by: string;
  /**
   * Who it went to (Paul, 2026-11-18): the chapter, several people picked one
   * by one, a role's holders, a chapter group's members, or a tier's role
   * holders (#5473).
   */
  audience: TaskGroupAudience;
  /** The role, chapter group or tier it went to; null for everyone and people. */
  target_id: string | null;
  /**
   * That role's or group's name when the task was made, shown once the role
   * or group is deleted.
   */
  target_name: string | null;
  created_at: string;
}

/**
 * What a group's progress and its Activity row need of each copy (#5492):
 * whose it is and where it stands, without its text, proof or notes, so
 * counting a group of 150 reads a few columns of each copy, not every one.
 */
export type TaskGroupCopyState = Pick<
  Task,
  | 'id'
  | 'group_id'
  | 'assignee_id'
  | 'status'
  | 'points_awarded'
  | 'due_date'
  | 'due_at'
>;

/**
 * Every task list Activity draws, from one read (`activity_task_reads`,
 * #6061): each filtered, ordered and capped in SQL as its own read was. The
 * lists only a `tasks:manage` holder sees are empty for anyone else.
 */
export interface ActivityTaskReads {
  /**
   * The caller's tasks not yet confirmed, and those they marked done since
   * the week began, confirmed or not; newest first, uncapped.
   */
  own: Task[];
  /**
   * Finished, unconfirmed tasks assigned to someone else, the `limit` waiting
   * longest, oldest completion first.
   */
  waiting: Task[];
  /** How many such tasks wait in all, past `limit`. */
  waiting_total: number;
  /** The `limit` newest tasks the caller made. */
  made: Task[];
  /** The `limit` newest one-person tasks the caller made, not confirmed. */
  singles: Task[];
  /** The `limit` newest groups the caller made with a copy not confirmed. */
  made_groups: TaskGroup[];
  /** The groups of every task in `own`, `waiting` and `made`. */
  row_groups: TaskGroup[];
  /** Every copy of `row_groups` and `made_groups`, by id. */
  copy_states: TaskGroupCopyState[];
  /** For each of `made_groups`, its unconfirmed copy with the lowest id, whole. */
  shared: Task[];
}

/** What a task read says about its group (#4295 step 3). */
export interface TaskGroupSummary extends TaskGroupProgress {
  id: string;
  audience: TaskGroupAudience;
  /** The role, chapter group or tier it went to; null for everyone and people. */
  target_id: string | null;
  /**
   * That role's or group's name: its name now while it exists, otherwise the
   * one it had when the task was made. Null for everyone and people.
   */
  target_name: string | null;
}

/**
 * A repeating task's series (#5119): the template each copy is made from and
 * the rule it repeats on. Only the next upcoming copy exists; the 5-minute
 * sweep makes the following one once the latest copy is due.
 */
export interface TaskSeries {
  id: string;
  chapter_id: string;
  created_by: string;
  title: string;
  description: string | null;
  assignee_id: string;
  point_reward: number | null;
  proof_kind: TaskProofKind;
  /** The checklist each copy starts with, in order. */
  subtask_titles: string[];
  /** What each copy is made with (Frapp links). */
  attachments: FrappLink[];
  /** Whether each copy has a fixed deadline (#6096). */
  fixed_deadline: boolean;
  /** Copies' time of day on the rule's wall clock (`HH:MM:SS`), or null. */
  due_time: string | null;
  /** The rule, in the event rule format with an open end allowed. */
  recurrence_rule: string;
  /** The day the rule counts from: its first copy, or where it last changed. */
  first_due_date: string;
  /** The day of the next copy still to be made. */
  next_due_date: string;
  /** When the latest copy is due: the sweep makes the next one after it. */
  latest_due_at: string;
  made_count: number;
  /** When the series stopped making copies; null while it is live. */
  ended_at: string | null;
  created_at: string;
}

/** What a task read says about its series (#5119). */
export interface TaskSeriesSummary {
  recurrence_rule: string;
  /** The next copy's day; meaningless once `ended`. */
  next_due_date: string;
  ended: boolean;
}

/**
 * A task as the read paths return it.
 *
 * `status` is the **display** status: `toDisplayStatus` rewrites it to
 * `OVERDUE` for a `TODO` or `IN_PROGRESS` task past its due date. `OVERDUE` is
 * never persisted, so that rewrite is lossy — `TODO`+past-due and
 * `IN_PROGRESS`+past-due render identically, with `completed_at: null` on both.
 *
 * `stored_status` carries the value actually persisted, which is what
 * `VALID_ASSIGNEE_TRANSITIONS` is checked against. Without it no client can
 * compute an overdue task's next legal transition, so no client can offer an
 * action on one — which is why an overdue task could not be advanced from any
 * surface (#1051).
 *
 * Additive by design: `status` keeps its existing derived value, so a consumer
 * grouping by it (the web board's OVERDUE column) is untouched.
 */
export interface TaskView extends Task {
  stored_status: TaskStatus;
  /**
   * The task's subtasks, in order (#4003). Present on the list and detail
   * reads; a status write returns the task without them, and a client keeps
   * the ones it holds.
   */
  subtasks?: TaskSubtask[];
  /**
   * The task's photos (#4635): reference photos, then proof photos, each in
   * order. Present on the list and detail reads and on status writes.
   */
  photos?: TaskPhoto[];
  /**
   * How the task repeats, on a copy of a series (#5119); null on a task that
   * doesn't repeat. Present on the list and detail reads.
   */
  series?: TaskSeriesSummary | null;
  /**
   * The group task this is a copy of, with how far the group is (#4295 step
   * 3); null on a task given to one person. Present on the list and detail
   * reads.
   */
  group?: TaskGroupSummary | null;
  /**
   * The task up for grabs this was claimed from (2026-11-18), or null. Its
   * assignee can give it back while it isn't done. Present on the list and
   * detail reads.
   */
  open_task_id?: string | null;
  /**
   * The name of the tier, role or group in `followed_by` as it reads now
   * (#5473), or null when there is none or it was deleted. Present on the
   * list and detail reads.
   */
  followed_by_name?: string | null;
  /**
   * The latest request for more time on the task (#6096), for its assignee
   * and `tasks:manage` holders; null when there is none, and never sent to
   * a follower. Present on the list and detail reads.
   */
  extension?: TaskExtensionSummary | null;
  /**
   * For the assignee's own read only: true while they can't ask for more
   * time (3 extensions in 30 days, until an officer restores it, #6096).
   */
  extension_requests_blocked?: boolean;
}

/** What a task read says about its latest request for more time (#6096). */
export interface TaskExtensionSummary {
  id: string;
  status: TaskExtensionStatus;
  reason: string;
  from_due_date: string;
  from_due_at: string | null;
  to_due_date: string;
  to_due_at: string | null;
  needs_officer: TaskExtensionNeedsOfficer | null;
  auto_approved: boolean;
  decline_reason: string | null;
  decided_at: string | null;
  created_at: string;
}

/** Which of a task's photos: the officer's reference or the assignee's proof. */
export type TaskPhotoKind = 'reference' | 'proof';

/**
 * One task photo (#4635), a storage key in the private `tasks` bucket under
 * `chapters/{chapter_id}/tasks/`. Up to 6 per task and kind. A proof photo
 * goes with its completion: taking it back, sending it back or handing the
 * task over deletes it. Read through `GET /v1/tasks/:id/photos/:photoId/url`.
 */
export interface TaskPhoto {
  id: string;
  task_id: string;
  chapter_id: string;
  kind: TaskPhotoKind;
  storage_path: string;
  /** Order within its kind, 0 first. */
  position: number;
  created_by: string | null;
  created_at: string;
}

/**
 * One line of a task's checklist (#4003): a step the assignee ticks off.
 * It has no assignee, due date or points of its own; the task's carry it.
 */
export interface TaskSubtask {
  id: string;
  task_id: string;
  chapter_id: string;
  title: string;
  /** Order under the task, 0 first. */
  position: number;
  /** When it was ticked; null while it is still to do. */
  done_at: string | null;
  created_at: string;
}
