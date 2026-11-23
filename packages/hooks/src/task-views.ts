import {
  dayDelta,
  isDueOverdue,
  parseInstantOrBareLocalNoon,
} from "@repo/formatting";
import type { TaskStatus } from "./use-tasks";
import { TASK_NO_DUE_DATE_LABEL } from "@repo/validation";

/**
 * Where a task's due date falls from today (#4295 step 5, "Views"): the
 * rule My tasks groups by on both apps (web's board, the phone's
 * `lib/tasks/board.ts`) and web's Due filter reads, so a task is "This week"
 * in the same place everywhere.
 *
 * - `overdue`: the server derived `OVERDUE` (its own clock decides, as the
 *   board's lanes always have), or an open task past due by `isDueOverdue`,
 *   the rule its due line turns red by: a timed task from that minute, a
 *   day-only task once its day has passed.
 * - `today`: due today.
 * - `week`: due in the six days after today. A rolling seven days, not the
 *   calendar week, so a Saturday's "This week" isn't one day long; Activity's
 *   To do gives the same seven days a heading each (`activity-agenda.ts`).
 * - `later`: further out, or a date this can't read (a task the member owes
 *   is kept and listed last rather than dropped).
 * - `earlier`: a finished task whose day has passed. It isn't overdue, and
 *   no filter but "Any time" asks for it.
 *
 * - `none`: a task with no due date (#5761). It is never overdue, so it
 *   stays here whatever the day; it comes after Later, as Todoist and Things
 *   list undated work after everything with a date.
 *
 * A task due at a time (`due_at`) is placed by that moment's local day.
 */
export type TaskDueBucket =
  "overdue" | "today" | "week" | "later" | "none" | "earlier";

/**
 * Days from today that still count as This week: today plus the next six.
 * The same seven days as Activity's `AGENDA_DAY_HORIZON`.
 */
const THIS_WEEK_DAYS = 7;

export const TASK_DUE_BUCKET_LABELS: Record<TaskDueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  none: TASK_NO_DUE_DATE_LABEL,
  earlier: "Earlier",
};

/** The Due filter's choices, in order; `earlier` is never one. */
export const TASK_DUE_FILTERS: readonly Exclude<TaskDueBucket, "earlier">[] = [
  "overdue",
  "today",
  "week",
  "later",
  "none",
];

export function taskDueBucket(
  task: {
    due_date: string | null | undefined;
    due_at?: string | null;
    status: TaskStatus | null | undefined;
  },
  now: Date = new Date(),
): TaskDueBucket {
  if (task.status === "OVERDUE") return "overdue";
  if (!task.due_date && !task.due_at) return "none";
  // An unreadable time falls back to the day rather than hiding it.
  const timed = task.due_at ? parseInstantOrBareLocalNoon(task.due_at) : null;
  const raw = timed ? task.due_at : task.due_date;
  const due = timed ?? (raw ? parseInstantOrBareLocalNoon(raw) : null);
  if (!due) return "later";
  const done = task.status === "COMPLETED";
  if (!done && isDueOverdue(raw, now)) return "overdue";
  const days = dayDelta(now, due);
  if (days < 0) return done ? "earlier" : "overdue";
  if (days === 0) return "today";
  return days < THIS_WEEK_DAYS ? "week" : "later";
}

/**
 * My tasks' groups, in order. #4295 step 5 grouped them as Today, This week
 * and Later, with overdue leading Today. Since #5906 (Shawn, 2026-11-23: "the
 * stuff that's overdue should go into an overdue section not the today
 * section") Overdue is its own group above Today, as Todoist's and TickTick's
 * Today views head the list with an Overdue section, so Today holds only what
 * is due today. Like No due date (#5761), a surface draws Overdue only when
 * it holds a task.
 */
export type MyTasksGroup = "overdue" | "today" | "week" | "later" | "none";

export const MY_TASKS_GROUPS: readonly MyTasksGroup[] = [
  "overdue",
  "today",
  "week",
  "later",
  "none",
];

export const MY_TASKS_GROUP_LABELS: Record<MyTasksGroup, string> = {
  overdue: TASK_DUE_BUCKET_LABELS.overdue,
  today: "Today",
  week: "This week",
  later: "Later",
  none: TASK_NO_DUE_DATE_LABEL,
};

/**
 * The quiet line under a My tasks group with nothing in it. Overdue and No
 * due date have none: each is drawn only when it holds a task, so a member
 * who is on top of everything never sees an empty Overdue.
 */
export const MY_TASKS_GROUP_EMPTY: Record<MyTasksGroup, string | null> = {
  overdue: null,
  today: "Nothing due today",
  week: "Nothing else this week",
  later: "Nothing later",
  none: null,
};

/**
 * The group a task sits in. A finished task stays where it was when it was
 * finished, so marking a row done never moves it under the member's thumb:
 * one finished late (`completed_at` past its due, by `isDueOverdue`) stays in
 * Overdue, and one finished on time whose day has since passed stays in
 * Today. Web's My tasks lists only open tasks here; the phone keeps finished
 * rows on the board for a while.
 */
export function myTasksGroup(
  task: Parameters<typeof taskDueBucket>[0] & {
    completed_at?: string | null;
  },
  now: Date = new Date(),
): MyTasksGroup {
  if (task.status === "COMPLETED" && finishedLate(task)) return "overdue";
  const bucket = taskDueBucket(task, now);
  return bucket === "earlier" ? "today" : bucket;
}

/** Whether a finished task was finished after its due moment. */
function finishedLate(task: {
  due_date: string | null | undefined;
  due_at?: string | null;
  completed_at?: string | null;
}): boolean {
  const done = task.completed_at ? new Date(task.completed_at) : null;
  if (!done || Number.isNaN(done.getTime())) return false;
  const timed = task.due_at ? parseInstantOrBareLocalNoon(task.due_at) : null;
  const raw = timed ? task.due_at : task.due_date;
  return raw ? isDueOverdue(raw, done) : false;
}

/**
 * Order inside a group: overdue first, then by due day, then by time within
 * the day with a task that has no time last (it is due by the end of the
 * day), then a task with no due date (#5761), then by title so the order
 * holds between renders.
 */
export function compareTasksByDue(
  a: {
    due_date: string | null;
    due_at?: string | null;
    title: string;
    status: TaskStatus;
  },
  b: {
    due_date: string | null;
    due_at?: string | null;
    title: string;
    status: TaskStatus;
  },
): number {
  const aLate = a.status === "OVERDUE" ? 0 : 1;
  const bLate = b.status === "OVERDUE" ? 0 : 1;
  if (aLate !== bLate) return aLate - bLate;
  if (!a.due_date !== !b.due_date) return a.due_date ? -1 : 1;
  const byDay = (a.due_date ?? "").localeCompare(b.due_date ?? "");
  if (byDay !== 0) return byDay;
  const aMs = timeOf(a.due_at);
  const bMs = timeOf(b.due_at);
  if (aMs !== bMs) return aMs < bMs ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/** A due time in ms; none, or one that can't be read, sorts last. */
function timeOf(dueAt: string | null | undefined): number {
  const ms = dueAt ? Date.parse(dueAt) : Number.NaN;
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}
