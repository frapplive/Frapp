/**
 * The s08 task board: narrow `GET /v1/tasks`, keep the viewer's own rows, and
 * split them into the two drawn sections.
 *
 * `GET /v1/tasks` is declared in `openapi.json` with no response schema, so
 * `openapi-typescript` infers its body as `never`. Narrowed at the boundary
 * with the shared readers in `lib/more/narrow.ts`, exactly as the events and
 * More-hub selectors do — a row that cannot be drawn honestly is dropped here
 * rather than rendering "Invalid Date" downstream.
 */

import { dayDelta } from "@repo/formatting";
import {
  isSentBack,
  isTaskStatus,
  myTasksGroup,
  readLiveTaskPhotos,
  readTaskSeries,
  type LiveTaskPhoto,
  type TaskExtensionSummary,
  type MyTasksGroup,
} from "@repo/hooks";
import {
  readFrappLinks,
  taskNeedsSignOff,
  taskSignedOffAutomatically,
  TASK_EXTENSION_NEEDS_OFFICER,
  TASK_EXTENSION_STATUSES,
  type FrappLink,
  type TaskExtensionNeedsOfficer,
  type TaskProofKind,
  type TaskSeriesLine,
} from "@repo/validation";
import { num, records, str } from "@/lib/more/narrow";
import { daysSinceCompletion, parseTaskDate } from "./format";
import { isOpenTask } from "./transitions";

/**
 * Days after **completion** that a finished task keeps its place on the board.
 *
 * Deliberately measured from `completed_at`, not from the due date. Keying it on
 * the deadline retires a task by how old its *deadline* is, so completing a
 * three-week-late task would drop the row in the same render as the tap that
 * closed it — the checkbox never filling, the row simply vanishing under the
 * member's finger, which reads as a delete rather than a completion.
 */
const COMPLETED_RETENTION_DAYS = 7;

export interface TaskRowModel {
  id: string;
  title: string;
  /** Free text the officer wrote when assigning it. Read on the task screen. */
  description: string | null;
  /** Who assigned it: the member an unconfirmed completion is waiting on. */
  createdBy: string | null;
  /** The persisted status. What `nextTapSequence` keys off. May be `null`. */
  storedStatus: string | null;
  /** What the server wants rendered — may be the synthesized `OVERDUE`. */
  displayStatus: string | null;
  dueDate: string | null;
  /** The stored `due_date`, the creator's calendar day, for an edit (#4296). */
  dueDay: string | null;
  /** The stored `due_at`, when it has a time, for an edit (#4296). */
  dueAt: string | null;
  /** Whom it is assigned to. */
  assigneeId: string | null;
  completedAt: string | null;
  /** Who marked it done (#5732); null while open or from an older read. */
  completedBy: string | null;
  /** When an officer confirmed it; `null` while it waits on one. */
  confirmedAt: string | null;
  pointReward: number | null;
  pointsAwarded: boolean;
  isDone: boolean;
  isOverdue: boolean;
  /** Its checklist, in order (#4003); empty for none. */
  subtasks: TaskRowSubtask[];
  /** What Mark done needs (#4635): nothing, photos or a link. */
  proofKind: TaskProofKind;
  /** The assignee's link proof, while the completion stands. */
  proofLink: string | null;
  /** When and why an officer last sent it back (#4635). */
  sentBackAt: string | null;
  sentBackReason: string | null;
  /** The assignee's reply sent with Mark done. */
  completionNote: string | null;
  /** Reference photos, then proof photos, each in order (#4635). */
  photos: LiveTaskPhoto[];
  /** When it was assigned: the task screen's first History line (#5492). */
  createdAt: string | null;
  /** The group task this is one member's copy of (#4295 step 3), or `null`. */
  groupId: string | null;
  /** The minutes it was suggested from (#5562): read for their name now. */
  meetingId: string | null;
  /**
   * The tier, role or group it is from (#5473, `tasks.md` § Following a
   * task), as `tier:<id>` / `role:<id>` / `group:<id>`, or `null` for a task
   * from its creator alone.
   */
  followedBy: string | null;
  /** That tier's, role's or group's name now; `null` once deleted. */
  followedByName: string | null;
  /** Its Frapp links (`spec/behavior/frapp-links.md`), ids only for a record. */
  attachments: FrappLink[];
  /**
   * The group this copy is one of (#4295 step 3; 2026-11-18): who the task
   * went to and how far along the copies are, or `null` for one person's.
   */
  group: TaskRowGroup | null;
  /**
   * The Up for grabs posting it was claimed from, or `null`: its assignee
   * can give it back until it is done.
   */
  openTaskId: string | null;
  /**
   * The repeating series this task is a copy of (#5119): its rule, next day
   * and whether it ended, or `null` for a task that doesn't repeat.
   */
  series: TaskSeriesLine | null;
  /**
   * A fixed deadline (#6096): never extendable, and drawn urgent (the
   * danger red) to its assignee.
   */
  fixedDeadline: boolean;
  /** Its latest request for more time (#6096), or `null` for none. */
  extension: TaskExtensionSummary | null;
  /**
   * On the assignee's own task (#6096): they used 3 extensions in 30 days and
   * can't ask again until an officer restores it.
   */
  extensionRequestsBlocked: boolean;
}

/** A group task's summary, as the task reads carry it (`group`). */
export interface TaskRowGroup {
  audience: string;
  /** The role or chapter group it went to (`role`, `group`), else `null`. */
  targetId: string | null;
  targetName: string | null;
  total: number;
  /** Copies marked done, confirmed or still waiting on an officer. */
  done: number;
  confirmed: number;
}

function toGroup(value: unknown): TaskRowGroup | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const audience = str(record, "audience");
  if (!audience) return null;
  return {
    audience,
    targetId: str(record, "target_id"),
    targetName: str(record, "target_name"),
    total: num(record, "total") ?? 0,
    done: num(record, "done") ?? 0,
    confirmed: num(record, "confirmed") ?? 0,
  };
}

/**
 * Whether an officer sent the task back and it waits on its assignee
 * (Needs changes, #4635), by the shared rule (`isSentBack`).
 */
export function rowIsSentBack(row: TaskRowModel): boolean {
  const stored = isTaskStatus(row.storedStatus) ? row.storedStatus : undefined;
  const status = isTaskStatus(row.displayStatus)
    ? row.displayStatus
    : (stored ?? "TODO");
  return isSentBack({
    status,
    stored_status: stored,
    sent_back_at: row.sentBackAt,
  });
}

/** Whether a completion of this task waits on an officer (#4635, decision C). */
export function rowNeedsSignOff(row: TaskRowModel): boolean {
  return taskNeedsSignOff({
    point_reward: row.pointReward,
    proof_kind: row.proofKind,
  });
}

/**
 * Whether the completion was signed off as it was marked done, needing no
 * sign-off (#4635), rather than confirmed by an officer: it can still be
 * taken back.
 */
export function rowSignedOffAutomatically(row: TaskRowModel): boolean {
  return taskSignedOffAutomatically({
    points_awarded: row.pointsAwarded,
    completed_at: row.completedAt,
    confirmed_at: row.confirmedAt,
    point_reward: row.pointReward,
    proof_kind: row.proofKind,
  });
}

export interface TaskRowSubtask {
  id: string;
  title: string;
  done: boolean;
}

function toSubtasks(value: unknown): TaskRowSubtask[] {
  if (!Array.isArray(value)) return [];
  const rows: TaskRowSubtask[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const id = str(record, "id");
    const title = str(record, "title");
    if (!id || !title) continue;
    rows.push({ id, title, done: typeof record.done_at === "string" });
  }
  return rows;
}

/**
 * The board by My tasks' groups (#4295 step 5): Overdue (#5906), Today, This
 * week, Later, then No due date (#5761), by the rule web's My tasks uses
 * (`myTasksGroup`).
 */
export interface TaskBoard {
  groups: Record<MyTasksGroup, TaskRowModel[]>;
  /** Rows kept after filtering — what distinguishes an empty board from a full one. */
  total: number;
}

const EMPTY_BOARD: TaskBoard = {
  groups: { overdue: [], today: [], week: [], later: [], none: [] },
  total: 0,
};

/** One `GET /v1/tasks` row as the board draws it, or `null` if it can't be. */
export function toTaskRow(row: Record<string, unknown>): TaskRowModel | null {
  const id = str(row, "id");
  const title = str(row, "title");
  if (!id || !title) return null;

  const storedStatus = str(row, "stored_status");
  const displayStatus = str(row, "status");

  return {
    id,
    title,
    description: str(row, "description"),
    createdBy: str(row, "created_by"),
    storedStatus,
    displayStatus,
    // A task due at a time carries its instant here, so the subtitle, the
    // urgency and the order all read the time (#4003).
    dueDate: str(row, "due_at") ?? str(row, "due_date"),
    dueDay: str(row, "due_date"),
    dueAt: str(row, "due_at"),
    assigneeId: str(row, "assignee_id"),
    completedAt: str(row, "completed_at"),
    completedBy: str(row, "completed_by"),
    confirmedAt: str(row, "confirmed_at"),
    pointReward: num(row, "point_reward"),
    pointsAwarded: row.points_awarded === true,
    // Read off the row, never recomputed. `toDisplayStatus` derives it in UTC
    // against the *server's* today; a local recomputation would disagree with it
    // every evening west of Greenwich — which is exactly when someone finishes
    // a task due today.
    isDone: !isOpenTask(storedStatus ?? displayStatus),
    isOverdue: displayStatus === "OVERDUE",
    subtasks: toSubtasks(row.subtasks),
    proofKind:
      row.proof_kind === "photo" || row.proof_kind === "link"
        ? row.proof_kind
        : "none",
    proofLink: str(row, "proof_link"),
    sentBackAt: str(row, "sent_back_at"),
    sentBackReason: str(row, "sent_back_reason"),
    completionNote: str(row, "completion_note"),
    photos: readLiveTaskPhotos(row.photos),
    createdAt: str(row, "created_at"),
    groupId: str(row, "group_id"),
    meetingId: str(row, "meeting_id"),
    followedBy: str(row, "followed_by"),
    followedByName: str(row, "followed_by_name"),
    attachments: readFrappLinks(row.attachments),
    group: toGroup(row.group),
    openTaskId: str(row, "open_task_id"),
    series: readTaskSeries(row.series),
    fixedDeadline: row.fixed_deadline === true,
    extension: readExtension(row.extension),
    extensionRequestsBlocked: row.extension_requests_blocked === true,
  };
}

const EXTENSION_STATUSES: readonly string[] = TASK_EXTENSION_STATUSES;
const NEEDS_OFFICER: readonly string[] = TASK_EXTENSION_NEEDS_OFFICER;

function readNeedsOfficer(
  value: string | null,
): TaskExtensionSummary["needs_officer"] {
  return value && NEEDS_OFFICER.includes(value)
    ? (value as TaskExtensionNeedsOfficer)
    : null;
}

/**
 * A task read's `extension` (#6096), or `null` for none or one this build
 * can't read: a status it doesn't know, or no day asked for.
 */
function readExtension(value: unknown): TaskExtensionSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = str(record, "id");
  const status = str(record, "status");
  const toDueDate = str(record, "to_due_date");
  if (!id || !status || !EXTENSION_STATUSES.includes(status) || !toDueDate) {
    return null;
  }
  return {
    id,
    status: status as TaskExtensionSummary["status"],
    reason: str(record, "reason") ?? "",
    from_due_date: str(record, "from_due_date") ?? "",
    from_due_at: str(record, "from_due_at"),
    to_due_date: toDueDate,
    to_due_at: str(record, "to_due_at"),
    needs_officer: readNeedsOfficer(str(record, "needs_officer")),
    auto_approved: record.auto_approved === true,
    decline_reason: str(record, "decline_reason"),
    decided_at: str(record, "decided_at"),
    created_at: str(record, "created_at") ?? "",
  };
}

/**
 * Days until this row is due, or `null` when it has no due date (#5761) or an
 * unreadable one. The row is still kept and sorted last rather than dropped,
 * because hiding a task the member owes is the worse failure.
 */
function dueInDays(row: TaskRowModel, now: Date): number | null {
  if (!row.dueDate) return null;
  const due = parseTaskDate(row.dueDate);
  return due ? dayDelta(now, due) : null;
}

/** A row paired with its due-day offset, computed once rather than per comparison. */
interface RankedRow {
  row: TaskRowModel;
  days: number | null;
}

/**
 * Rank inside a section: overdue first (most overdue leading), then open rows by
 * due date, then finished rows, then anything undateable.
 */
function compareRows(a: RankedRow, b: RankedRow): number {
  if (a.row.isDone !== b.row.isDone) return a.row.isDone ? 1 : -1;

  if (a.days === null || b.days === null) {
    if (a.days !== b.days) return a.days === null ? 1 : -1;
  } else if (a.days !== b.days) {
    return a.days - b.days;
  }

  // Ties break on title so the board does not reshuffle between renders of the
  // same data — two tasks due the same day is the ordinary case, not an edge.
  return a.row.title.localeCompare(b.row.title);
}

/**
 * The viewer's board.
 *
 * ## Why this filters by assignee
 *
 * `TaskService.list` returns the chapter's *whole* task set to a `tasks:manage`
 * holder and only the caller's own rows to everyone else, and `useTasks()`
 * deliberately takes no assignee argument (`GET /v1/tasks` accepts no query
 * parameters). s08 is drawn as a personal board, so an officer would otherwise
 * see every brother's tasks under "Semester points" and a checkbox they cannot
 * legally tap. The hook's own doc comment names this as the caller's job.
 *
 * ## `viewerUserId === null` is not "no tasks"
 *
 * It means `/v1/users/me` has not resolved yet. Returning an empty board is
 * correct here — there is no identity to filter against — but the *screen* must
 * treat it as still-loading, or every cold start flashes "No tasks assigned"
 * before the real rows arrive.
 */
export function selectTaskRows(
  data: unknown,
  viewerUserId: string | null,
  now: Date,
): TaskBoard {
  if (!viewerUserId) return EMPTY_BOARD;

  const groups: Record<MyTasksGroup, RankedRow[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    none: [],
  };

  for (const raw of records(data)) {
    if (str(raw, "assignee_id") !== viewerUserId) continue;
    const row = toTaskRow(raw);
    if (!row) continue;

    const days = dueInDays(row, now);

    // A finished task stops being news. Without a retention rule the board
    // accumulates every task the member has ever closed, and no other surface
    // holds that history — the ledger in `spec/behavior/points.md` records the
    // award, not the task. Canvas draws one done row and specifies no policy;
    // this window is the PR's proposal.
    //
    // Only a confirmed row retires. One still waiting on an officer is still
    // the member's business: it says so, and its box can take the completion
    // back until it is confirmed, so it stays however old it is. A confirmed
    // row's age runs from its confirmation (its completion where that is
    // missing), and a row with neither timestamp readable is **kept**: the
    // alternative is retiring a task on a timestamp this module never saw.
    if (row.isDone && row.pointsAwarded) {
      const sinceDone = daysSinceCompletion(
        row.confirmedAt ?? row.completedAt,
        now,
      );
      if (sinceDone !== null && sinceDone > COMPLETED_RETENTION_DAYS) continue;
    }

    // Overdue, Today, This week or Later by the shared rule. Overdue has its
    // own section above Today since #5906 (Shawn: "the stuff that's overdue
    // should go into an overdue section not the today section"). A finished
    // row stays where it was finished until it retires above: one finished
    // late in Overdue, one whose day has since passed in Today.
    const stored = isTaskStatus(row.storedStatus) ? row.storedStatus : null;
    const shown = isTaskStatus(row.displayStatus) ? row.displayStatus : stored;
    const group = myTasksGroup(
      {
        due_date: row.dueDay ?? row.dueDate,
        due_at: row.dueAt,
        status: shown,
        stored_status: stored ?? undefined,
        completed_at: row.completedAt,
      },
      now,
    );
    groups[group].push({ row, days });
  }

  const sorted = (rows: RankedRow[]) =>
    rows.sort(compareRows).map((entry) => entry.row);
  return {
    groups: {
      overdue: sorted(groups.overdue),
      today: sorted(groups.today),
      week: sorted(groups.week),
      later: sorted(groups.later),
      none: sorted(groups.none),
    },
    total:
      groups.overdue.length +
      groups.today.length +
      groups.week.length +
      groups.later.length +
      groups.none.length,
  };
}

/**
 * Everyone's lanes on the phone (#5948 slice 3), in the order web's List
 * draws its status groups (`tasks-board.tsx` `LIST_STATUS_ORDER`): late
 * first, then To do, In progress, what waits on an officer's sign-off, and
 * what was confirmed in the last week.
 */
export const EVERYONES_TASK_LANES = [
  "overdue",
  "todo",
  "in_progress",
  "completed",
  "confirmed",
] as const;
export type EveryonesTaskLane = (typeof EVERYONES_TASK_LANES)[number];

export interface EveryonesTasks {
  lanes: Record<EveryonesTaskLane, TaskRowModel[]>;
  total: number;
}

/**
 * The chapter's tasks by status, for Activity's Everyone's view (#5948).
 *
 * Every row the viewer's read holds: a `tasks:manage` holder's read is the
 * chapter's whole board, and a member who follows tasks (#5473) reads their
 * own and the followed ones (`everyoneOffered`). A lane is the shown status
 * (the server's synthesized `OVERDUE` included); a finished task waits under
 * Completed until an officer confirms it (or it needed no sign-off), then
 * sits under Confirmed for `COMPLETED_RETENTION_DAYS`, as on My tasks.
 */
export function selectEveryonesTasks(
  data: unknown,
  now: Date,
): EveryonesTasks {
  const lanes: Record<EveryonesTaskLane, RankedRow[]> = {
    overdue: [],
    todo: [],
    in_progress: [],
    completed: [],
    confirmed: [],
  };
  for (const raw of records(data)) {
    const row = toTaskRow(raw);
    if (!row) continue;
    let lane: EveryonesTaskLane;
    if (row.isDone) {
      const confirmed = row.pointsAwarded || rowSignedOffAutomatically(row);
      if (confirmed) {
        const sinceDone = daysSinceCompletion(
          row.confirmedAt ?? row.completedAt,
          now,
        );
        if (sinceDone !== null && sinceDone > COMPLETED_RETENTION_DAYS) {
          continue;
        }
        lane = "confirmed";
      } else {
        lane = "completed";
      }
    } else if (row.isOverdue || row.displayStatus === "OVERDUE") {
      lane = "overdue";
    } else if (
      row.displayStatus === "IN_PROGRESS" ||
      row.storedStatus === "IN_PROGRESS"
    ) {
      lane = "in_progress";
    } else {
      lane = "todo";
    }
    lanes[lane].push({ row, days: dueInDays(row, now) });
  }
  const sorted = (rows: RankedRow[]) =>
    rows.sort(compareRows).map((entry) => entry.row);
  const out = {
    overdue: sorted(lanes.overdue),
    todo: sorted(lanes.todo),
    in_progress: sorted(lanes.in_progress),
    completed: sorted(lanes.completed),
    confirmed: sorted(lanes.confirmed),
  };
  return {
    lanes: out,
    total: EVERYONES_TASK_LANES.reduce((n, lane) => n + out[lane].length, 0),
  };
}
