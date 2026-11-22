import { checkInWindowBounds } from "./check-in-window";
import {
  eventAttendanceFor,
  type EventAttendanceFields,
} from "./event-attendance";

/**
 * Where an event stands for its page, both apps (Paul, 2026-11-22: "why is
 * the attendance fully out to see right off the bat for an event a month in
 * the future?"). The page follows the event's clock:
 *
 * - `upcoming` until check-in opens: when, where and who's coming. No roster,
 *   nothing to mark, because nothing can be marked yet.
 * - `live` while check-in is open (its opening through the end's grace):
 *   the check-in card on top, and the roster fills as people check in.
 * - `past` once check-in has closed: the record and the minutes first.
 *
 * The boundaries are the server's own window (`checkInWindowBounds`), so the
 * roster appears at the instant a check-in can first be accepted. Times that
 * don't parse read as `upcoming`, the phase that shows the least.
 */
export type EventPagePhase = "upcoming" | "live" | "past";

export function eventPagePhase(
  start: unknown,
  end: unknown,
  opensMinutes: unknown,
  now: number,
): EventPagePhase {
  const from = typeof start === "string" ? new Date(start) : null;
  const to = typeof end === "string" ? new Date(end) : null;
  if (!from || !to) return "upcoming";
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return "upcoming";
  }
  const { opensAt, closesAt } = checkInWindowBounds(from, to, opensMinutes);
  if (now < opensAt.getTime()) return "upcoming";
  if (now <= closesAt.getTime()) return "live";
  return "past";
}

/** A member as the invite list reads one: who, and which roles they hold. */
export interface EventInviteCandidate {
  user_id: string;
  role_ids?: readonly string[] | null;
}

/**
 * The members an event invites (required or optional by the role rule,
 * `eventAttendanceFor`), in the order given. The page's Who's coming list and
 * headcount, and the roster's rows, read this one list, so "15 people" on the
 * page and the roster under it never disagree.
 */
export function eventInvitees<T extends EventInviteCandidate>(
  event: EventAttendanceFields,
  members: readonly T[],
): T[] {
  return members.filter(
    (member) =>
      eventAttendanceFor(event, member.role_ids ?? []).status !== "not_invited",
  );
}

/**
 * The words the event page says the same way on both apps
 * (`spec/behavior/events.md` § Event page).
 */
export const EVENT_PAGE_COPY = {
  /** The viewer's chip in the state line when the event requires them. */
  required: "Required",
  /** Before "Can't make it?", in the Who's coming row. */
  youreRequired: "You're required",
  cantMakeIt: "Can't make it?",
  people: (count: number) => (count === 1 ? "1 person" : `${count} people`),
  /** The roster's heading count, live and after. */
  checkedIn: (here: number, of: number) => `${here} of ${of} checked in`,
  came: (here: number, of: number) => `${here} of ${of} came`,
  /** The roster's view switch, live and after. */
  filterAll: "All",
  filterHere: (phase: EventPagePhase) =>
    phase === "past" ? "Came" : "Checked in",
  filterNotHere: (phase: EventPagePhase) =>
    phase === "past" ? "Didn't come" : "Not here",
  notHere: "Not here",
  showAll: (count: number) => `Show all ${count}`,
} as const;
