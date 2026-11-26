/**
 * Asking for more time on a task, on the phone (#6096, `spec/behavior/tasks.md`
 * § Asking for more time): what the task screen says about it and what the
 * Ask sheet sends, kept here where they are unit-tested. The words and the
 * rule of who may ask are `@repo/validation`'s (`TASK_EXTENSION_COPY`,
 * `cantAskForMoreTime`), shared with web's `task-extension.tsx`, whose lines
 * these follow in the same order.
 */

import {
  dueEntryFields,
  localClock,
  localIsoDate,
  parseBareDateLocalNoon,
} from "@repo/formatting";
import {
  extensionDueWords,
  type RequestTaskExtensionResult,
  type TaskExtensionSummary,
} from "@repo/hooks";
import {
  cantAskForMoreTime,
  TASK_EXTENSION_COPY,
  type CantAskForMoreTime,
} from "@repo/validation";
import type { TaskRowModel } from "./board";

/** Said under the reason when it is sent empty, as web's dialog says it. */
export const EXTENSION_REASON_MISSING = TASK_EXTENSION_COPY.reasonMissing;
/** Said when the new due isn't later than the task's, or has gone by. */
export const EXTENSION_DUE_NOT_LATER = TASK_EXTENSION_COPY.dueNotLater;
/** A failed ask with no sentence of the server's, as web says it. */
export const EXTENSION_ASK_FAILED = TASK_EXTENSION_COPY.askFailed;
/** A Decline sent with no reason. */
export const EXTENSION_DECLINE_REASON_MISSING =
  TASK_EXTENSION_COPY.declineReasonMissing;

/** Why the viewer can't ask, read off a task screen row. */
export function rowCantAskForMoreTime(
  row: TaskRowModel,
  viewerId: string | null,
): CantAskForMoreTime | null {
  return cantAskForMoreTime(
    {
      assignee_id: row.assigneeId ?? "",
      status: row.displayStatus ?? undefined,
      stored_status: row.storedStatus ?? undefined,
      points_awarded: row.pointsAwarded,
      due_date: row.dueDay,
      due_at: row.dueAt,
      fixed_deadline: row.fixedDeadline,
      extension: row.extension,
      extension_requests_blocked: row.extensionRequestsBlocked,
    },
    viewerId,
  );
}

/**
 * Whether the task's due reads in the danger red to this viewer: a fixed
 * deadline on their own open task (tasks.md § Task Lifecycle).
 */
export function rowDueUrgentForViewer(
  row: TaskRowModel,
  viewerId: string | null,
): boolean {
  return rowCantAskForMoreTime(row, viewerId) === "fixed";
}

/** "Extended to Saturday · approved automatically", or "Not extended: …". */
export function extensionDecidedLine(
  extension: TaskExtensionSummary,
  now: Date = new Date(),
): string | null {
  if (extension.status === "approved") {
    const to = `Extended to ${extensionDueWords(extension, now)}`;
    return extension.auto_approved ? `${to} · approved automatically` : to;
  }
  if (extension.status === "declined") {
    return extension.decline_reason
      ? `${TASK_EXTENSION_COPY.declined}: ${extension.decline_reason}`
      : TASK_EXTENSION_COPY.declined;
  }
  return null;
}

/** One line under the task's facts; `danger` draws in the red. */
export interface ExtensionLine {
  text: string;
  tone: "muted" | "danger";
}

/**
 * What the task screen says about more time, in web's order: the latest
 * request's answer (to the assignee and officers), then why the assignee
 * can't ask where the action would be (fixed, waiting, blocked).
 */
export function extensionLines(
  row: TaskRowModel,
  {
    viewerId,
    canManage,
    now = new Date(),
  }: {
    viewerId: string | null;
    canManage: boolean;
    now?: Date;
  },
): ExtensionLine[] {
  const cant = rowCantAskForMoreTime(row, viewerId);
  const lines: ExtensionLine[] = [];
  if (row.extension && (cant !== "not_mine" || canManage)) {
    const decided = extensionDecidedLine(row.extension, now);
    if (decided) lines.push({ text: decided, tone: "muted" });
  }
  if (cant === "fixed") {
    lines.push({ text: TASK_EXTENSION_COPY.fixedNoExtensions, tone: "danger" });
  } else if (cant === "waiting") {
    lines.push({ text: TASK_EXTENSION_COPY.waiting, tone: "muted" });
  } else if (cant === "blocked") {
    lines.push({ text: TASK_EXTENSION_COPY.blocked, tone: "muted" });
  }
  return lines;
}

/** A new due as the Ask sheet's fields hold it, device-local. */
export interface ExtensionDueDraft {
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM`, on a task due at a time; `null` on one due by the day. */
  time: string | null;
}

/** The task's due as the fields hold it, or `null` for an undated task. */
function storedDue(row: TaskRowModel): {
  date: string;
  time: string | null;
  at: Date | null;
} | null {
  if (row.dueAt) {
    const at = new Date(row.dueAt);
    if (!Number.isNaN(at.getTime())) {
      return { date: localIsoDate(at), time: localClock(at), at };
    }
  }
  if (!row.dueDay) return null;
  return { date: row.dueDay.slice(0, 10), time: null, at: null };
}

function plusDays(date: string, days: number): string {
  const at = parseBareDateLocalNoon(date) ?? new Date();
  at.setDate(at.getDate() + days);
  return localIsoDate(at);
}

/**
 * Where the Ask sheet opens: a day after the task's due, the longest an
 * extension is approved without an officer, so the common ask is one
 * reason and Send. A due a day on that has already gone by (an overdue
 * task) moves on a day at a time until it is still to come.
 */
export function extensionDraftOf(
  row: TaskRowModel,
  now: Date = new Date(),
): ExtensionDueDraft | null {
  const due = storedDue(row);
  if (!due) return null;
  let draft: ExtensionDueDraft = {
    date: plusDays(due.date, 1),
    time: due.time,
  };
  for (let i = 0; i < 400 && extensionDueGone(draft, now); i += 1) {
    draft = { ...draft, date: plusDays(draft.date, 1) };
  }
  return draft;
}

function draftInstant(draft: ExtensionDueDraft): Date | null {
  if (!draft.time) return null;
  const fields = dueEntryFields(`${draft.date}T${draft.time}`);
  return fields.due_at ? new Date(fields.due_at) : null;
}

/** A due that has gone by: a time before now, a day before today. */
function extensionDueGone(draft: ExtensionDueDraft, now: Date): boolean {
  const at = draftInstant(draft);
  if (at) return at.getTime() <= now.getTime();
  return draft.date < localIsoDate(now);
}

/** What the Ask sheet sends, or why it can't yet. */
export type ExtensionAsk =
  | {
      ok: true;
      body: { due_date: string; due_at?: string; reason: string };
    }
  | { ok: false; problem: string };

/**
 * The request body (`POST /v1/tasks/:id/extension-requests`): `due_at` as an
 * ISO instant and `due_date` the local day for a task due at a time, the day
 * alone for one due by the day. The due must be later than the task's and
 * still to come, and the reason given (the API's rules, checked here first so
 * the sheet says which).
 */
export function extensionAsk(
  row: TaskRowModel,
  draft: ExtensionDueDraft,
  reason: string,
  now: Date = new Date(),
): ExtensionAsk {
  const due = storedDue(row);
  const why = reason.trim();
  if (!due) return { ok: false, problem: EXTENSION_DUE_NOT_LATER };
  if (due.at) {
    const time = draft.time ?? due.time ?? "00:00";
    const at = draftInstant({ date: draft.date, time });
    if (!at || at.getTime() <= due.at.getTime() || at <= now) {
      return { ok: false, problem: EXTENSION_DUE_NOT_LATER };
    }
    if (!why) return { ok: false, problem: EXTENSION_REASON_MISSING };
    return {
      ok: true,
      body: { due_date: draft.date, due_at: at.toISOString(), reason: why },
    };
  }
  if (draft.date <= due.date || draft.date < localIsoDate(now)) {
    return { ok: false, problem: EXTENSION_DUE_NOT_LATER };
  }
  if (!why) return { ok: false, problem: EXTENSION_REASON_MISSING };
  return { ok: true, body: { due_date: draft.date, reason: why } };
}

/**
 * What the screen says once an ask lands: "More time granted · now due
 * Saturday" when it was approved at once, else that it waits on an officer;
 * and when this was the third in 30 days, that they can't ask again yet.
 */
export function extensionAskedLine(
  result: RequestTaskExtensionResult,
  now: Date = new Date(),
): string {
  const head =
    result.extension.status === "approved"
      ? `${TASK_EXTENSION_COPY.approvedNow} · now due ${extensionDueWords(result.extension, now)}`
      : TASK_EXTENSION_COPY.waiting;
  return result.now_blocked ? `${head}. ${TASK_EXTENSION_COPY.blocked}` : head;
}

/** A decline's reason before it sends, or `null` when it can go. */
export function declineProblem(reason: string): string | null {
  return reason.trim() ? null : EXTENSION_DECLINE_REASON_MISSING;
}

/** Shared with web (`@repo/hooks`), so both apps redden the same rows. */
export { activityRowFixedDeadline as activityRowFixedDue } from "@repo/hooks";
