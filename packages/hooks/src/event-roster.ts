import {
  EVENT_PAGE_COPY,
  statusLabel,
  type EventPagePhase,
} from "@repo/validation";
import { memberFallbackLabel, memberLabel } from "./display-names";

/** People the event page lists before "Show all", both apps. */
export const EVENT_PEOPLE_SHOWN = 8;

/** The four states the server stores, plus "no row yet". */
export type EventRosterStatus =
  "PRESENT" | "LATE" | "EXCUSED" | "ABSENT" | "UNRECORDED";

/** One person on an event's roster, both apps. */
export interface EventRosterRow {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  status: EventRosterStatus;
  checkInTime: string | null;
  excuseReason: string | null;
  attendanceId: string | null;
}

export interface RosterMember {
  user_id?: string | null;
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

export interface RosterAttendance {
  id?: string | null;
  user_id?: string | null;
  status?: string | null;
  check_in_time?: string | null;
  excuse_reason?: string | null;
}

const STATUSES = new Set(["PRESENT", "LATE", "EXCUSED", "ABSENT"]);

/**
 * The roster an officer reads on an event's page, web and phone alike: every
 * member the event invites (pass `eventInvitees`' list), each with their
 * attendance row, plus anyone with a row who isn't on that list (a member
 * whose roles changed, or who left: the same `Member <6>` label the
 * leaderboard gives them). `marked` lays answers just picked over the read,
 * so a run of taps down the list doesn't flicker. Sorted by name.
 */
export function eventRosterRows(
  members: readonly RosterMember[],
  attendance: readonly RosterAttendance[],
  marked: Readonly<Record<string, EventRosterStatus>> = {},
): EventRosterRow[] {
  const result = new Map<string, EventRosterRow>();
  for (const member of members) {
    if (!member.user_id) continue;
    const userId = String(member.user_id);
    result.set(userId, {
      userId,
      displayName: memberLabel(member.display_name, member.user_id),
      email: member.email ?? "",
      avatarUrl: member.avatar_url ?? null,
      status: "UNRECORDED",
      checkInTime: null,
      excuseReason: null,
      attendanceId: null,
    });
  }
  for (const entry of attendance) {
    const userId = entry.user_id ? String(entry.user_id) : "";
    if (!userId) continue;
    const base: EventRosterRow = result.get(userId) ?? {
      userId,
      displayName: memberFallbackLabel(userId),
      email: "",
      avatarUrl: null,
      status: "UNRECORDED",
      checkInTime: null,
      excuseReason: null,
      attendanceId: null,
    };
    result.set(userId, {
      ...base,
      status:
        entry.status && STATUSES.has(entry.status)
          ? (entry.status as EventRosterStatus)
          : "UNRECORDED",
      checkInTime: entry.check_in_time ?? null,
      excuseReason: entry.excuse_reason ?? null,
      attendanceId: entry.id ? String(entry.id) : null,
    });
  }
  for (const [userId, status] of Object.entries(marked)) {
    const row = result.get(userId);
    if (row) result.set(userId, { ...row, status });
  }
  return Array.from(result.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

/** Whether a roster row came (checked in, on time or late). */
export function rosterRowCame(row: { status: EventRosterStatus }): boolean {
  return row.status === "PRESENT" || row.status === "LATE";
}

/**
 * The roster as the page lists it: during check-in in name order, so rows
 * don't jump as people arrive; after it, who didn't come first, since that
 * is what an exec checks the day after.
 */
export function orderEventRoster<T extends { status: EventRosterStatus }>(
  rows: readonly T[],
  phase: "live" | "past",
): T[] {
  if (phase === "live") return [...rows];
  return [...rows].sort(
    (a, b) => Number(rosterRowCame(a)) - Number(rosterRowCame(b)),
  );
}

/** Each state's count, for the roster's tally line. */
export function eventRosterCounts(
  rows: readonly { status: EventRosterStatus }[],
): Record<EventRosterStatus, number> {
  const counts: Record<EventRosterStatus, number> = {
    PRESENT: 0,
    LATE: 0,
    EXCUSED: 0,
    ABSENT: 0,
    UNRECORDED: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/**
 * The tally line's parts, the states with someone in them, in roll-call
 * order: "8 present · 1 late · 1 excused · 5 not here yet".
 */
export function eventRosterTally(
  counts: Record<EventRosterStatus, number>,
  phase: "live" | "past",
): { count: number; label: string }[] {
  return [
    { count: counts.PRESENT, label: "present" },
    { count: counts.LATE, label: "late" },
    { count: counts.EXCUSED, label: "excused" },
    { count: counts.ABSENT, label: "absent" },
    {
      count: counts.UNRECORDED,
      label: phase === "past" ? "not marked" : "not here yet",
    },
  ].filter((entry) => entry.count > 0);
}

/**
 * The answers an officer can mark a row with, in roll-call order. Absent
 * needs a row to change: a member with none is marked through the by-hand
 * route, which records who was there and refuses Absent (that is what the
 * no-shows sweep after the event is for).
 */
export function eventRosterMarks(row: {
  attendanceId: string | null;
}): Exclude<EventRosterStatus, "UNRECORDED">[] {
  return row.attendanceId
    ? ["PRESENT", "LATE", "EXCUSED", "ABSENT"]
    : ["PRESENT", "LATE", "EXCUSED"];
}

/** A row's status in words, as both apps' chips say it. */
export function eventRosterStatusText(
  status: EventRosterStatus,
  phase: Exclude<EventPagePhase, "upcoming">,
): string {
  if (status === "UNRECORDED" && phase === "live") {
    return EVENT_PAGE_COPY.notHere;
  }
  return statusLabel("attendance", status);
}
