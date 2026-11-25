import { statusOf } from "@repo/api-sdk";
import { rushProspectCount } from "./rush-pipeline";
import type { RushContact, RushPipelineCandidate } from "./use-rush-pipeline";
import {
  RUSH_CONTACT_KIND_PAST,
  formatRushDay,
  isRushCandidateStale,
  isRushWorkOpen,
  isRushFollowUpForViewer,
  rushStaleOn,
} from "@repo/validation";

/**
 * The words and orders for a prospect's work (#5934, `rush.md` § Contacts,
 * owner and follow-ups), shared by web's page and panel and the phone's list
 * and prospect screen so both say the same thing: the header count, the
 * Follow up list's order, a row's follow-up mark, the last-contact, owner and
 * follow-up lines, the contact history's lines, and the plain-word refusals.
 * The rules themselves (what is due, what is stale) are `@repo/validation`'s,
 * which the API reads too; this only words them.
 */

type WorkCandidate = Pick<
  RushPipelineCandidate,
  | "closed_reason"
  | "bid_state"
  | "created_at"
  | "last_contact_on"
  | "last_contact_by_name"
  | "follow_up_on"
  | "follow_up_note"
  | "follow_up_user_id"
  | "follow_up_user_name"
  | "owner_id"
  | "owner_name"
>;

/**
 * `formatRushDay` inside a sentence: "Last contacted today", "Follow-up
 * tomorrow". Weekdays and months keep their capital.
 */
export function rushDayInSentence(day: string, today: string): string {
  const said = formatRushDay(day, today);
  return said === "Today" || said === "Yesterday" || said === "Tomorrow"
    ? said.toLowerCase()
    : said;
}

/** "48 prospects · 3 follow-ups due today"; the second part only above 0. */
export function rushListSubtitle(openCount: number, dueCount: number): string {
  const prospects = rushProspectCount(openCount);
  if (dueCount <= 0) return prospects;
  return `${prospects} · ${dueCount} ${
    dueCount === 1 ? "follow-up" : "follow-ups"
  } due today`;
}

/**
 * Who is under the Follow up chip, in the order to work them: the viewer's
 * due follow-ups, oldest day first, then the stale prospects they own, the
 * longest without a contact first.
 */
export function rushFollowUpList<C extends RushPipelineCandidate>(
  candidates: readonly C[],
  viewerId: string | null,
  staleDays: number,
  today: string,
): C[] {
  if (viewerId === null) return [];
  const mine = candidates.filter((c) =>
    isRushFollowUpForViewer(c, viewerId, staleDays, today),
  );
  const due = (c: C) =>
    c.follow_up_user_id === viewerId &&
    c.follow_up_on !== null &&
    c.follow_up_on <= today;
  const keyOf = (c: C) =>
    due(c) ? `0${c.follow_up_on}` : `1${rushStaleOn(c, staleDays) ?? ""}`;
  return [...mine].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

/** What a row's mark says, and how loudly. */
export type RushRowMark = {
  label: string;
  /** `due`: a follow-up today or past; `stale`: nobody has reached them. */
  tone: "planned" | "due" | "stale";
};

/**
 * A row's follow-up mark: the follow-up's day when one is set ("Follow-up
 * Thursday"), else "Needs follow-up" when the prospect has gone the chapter's
 * stale days without a contact; nothing on a closed prospect.
 */
export function rushRowMark(
  candidate: Pick<
    WorkCandidate,
    | "closed_reason"
    | "bid_state"
    | "created_at"
    | "last_contact_on"
    | "follow_up_on"
  >,
  staleDays: number,
  today: string,
  /** In a Closed stage, which a board knows by its column. */
  closed = false,
): RushRowMark | null {
  if (closed || !isRushWorkOpen(candidate)) return null;
  if (candidate.follow_up_on) {
    return {
      label: `Follow-up ${rushDayInSentence(candidate.follow_up_on, today)}`,
      tone: candidate.follow_up_on <= today ? "due" : "planned",
    };
  }
  if (isRushCandidateStale(candidate, staleDays, today)) {
    return { label: RUSH_NEEDS_FOLLOW_UP, tone: "stale" };
  }
  return null;
}

export const RUSH_NEEDS_FOLLOW_UP = "Needs follow-up";

/** A row's owner, first on its muted line: "Owned by Chris" or "No owner". */
export function rushOwnerWords(
  candidate: Pick<WorkCandidate, "owner_id" | "owner_name">,
): string {
  return candidate.owner_id
    ? `Owned by ${candidate.owner_name ?? "a former member"}`
    : "No owner";
}

/** "Last contacted November 18 · by Chris", or "No contact logged yet". */
export function rushLastContactLine(
  candidate: Pick<WorkCandidate, "last_contact_on" | "last_contact_by_name">,
  today: string,
): string {
  if (!candidate.last_contact_on) return RUSH_NO_CONTACT_YET;
  const when = rushDayInSentence(candidate.last_contact_on, today);
  return candidate.last_contact_by_name
    ? `Last contacted ${when} · by ${candidate.last_contact_by_name}`
    : `Last contacted ${when}`;
}

export const RUSH_NO_CONTACT_YET = "No contact logged yet";

/** "Follow-up Thursday, invite to house dinner"; `null` with none set. */
export function rushFollowUpLine(
  candidate: Pick<WorkCandidate, "follow_up_on" | "follow_up_note">,
  today: string,
): string | null {
  if (!candidate.follow_up_on) return null;
  const head = `Follow-up ${rushDayInSentence(candidate.follow_up_on, today)}`;
  return candidate.follow_up_note
    ? `${head}, ${candidate.follow_up_note}`
    : head;
}

/**
 * Who a follow-up is for, said only when it isn't the viewer: "For Chris".
 * `null` for the viewer's own, or with none set.
 */
export function rushFollowUpFor(
  candidate: Pick<
    WorkCandidate,
    "follow_up_on" | "follow_up_user_id" | "follow_up_user_name"
  >,
  viewerId: string | null,
): string | null {
  if (!candidate.follow_up_on || !candidate.follow_up_user_id) return null;
  if (candidate.follow_up_user_id === viewerId) return null;
  return `For ${candidate.follow_up_user_name ?? "a former member"}`;
}

/**
 * Who a follow-up set now is for, as the API decides it: the one already
 * set, else the owner, else whoever sets it.
 */
export function rushFollowUpTarget(
  candidate: Pick<
    WorkCandidate,
    "follow_up_user_id" | "follow_up_user_name" | "owner_id" | "owner_name"
  >,
  viewerId: string | null,
): { id: string | null; words: string } {
  const id = candidate.follow_up_user_id ?? candidate.owner_id ?? viewerId;
  if (id === null || id === viewerId) return { id, words: "For you" };
  const name =
    id === candidate.follow_up_user_id
      ? candidate.follow_up_user_name
      : candidate.owner_name;
  return { id, words: `For ${name ?? "a former member"}` };
}

/**
 * Members for an owner or follow-up picker: named ones only, by name, the
 * viewer first, so assigning yourself is the first row. A blank name would
 * draw an empty row.
 */
export function rushMemberOptions<
  M extends { user_id: string; display_name: string },
>(roster: readonly M[] | undefined, viewerId: string | null): M[] {
  const named = (roster ?? []).filter((m) => m.display_name.trim() !== "");
  const sorted = [...named].sort((a, b) =>
    a.display_name.localeCompare(b.display_name),
  );
  const me = sorted.find((m) => m.user_id === viewerId);
  return me ? [me, ...sorted.filter((m) => m !== me)] : sorted;
}

/** One line of the contact history: "Texted · November 18 · by Chris". */
export function rushContactLine(contact: RushContact, today: string): string {
  return [
    RUSH_CONTACT_KIND_PAST[contact.kind],
    formatRushDay(contact.contacted_on, today),
    `by ${contact.logged_by_name}`,
  ].join(" · ");
}

/** `CreateRushCandidateDto.display_name`'s cap, as web's form holds it. */
export const RUSH_PROSPECT_NAME_MAX = 200;

/** The add-prospect sheet's words, as web's New prospect dialog says them. */
export const RUSH_ADD_PROSPECT = {
  title: "New prospect",
  field: "Name",
  commit: "Add prospect",
  missing: "Add a name first",
} as const;

/** What a refused add says: a name the chapter already has is a 409. */
export function rushAddProspectProblem(
  error: unknown,
  name: string,
): string | null {
  if (statusOf(error) === 409) {
    return `${name} is already on the list. Add something to tell them apart, like a last initial.`;
  }
  return null;
}

/**
 * What a refused owner change says, in plain words (`rush.md` § Contacts,
 * owner and follow-ups): someone claimed them first (409), the member picked
 * can't work prospects (400), or someone already owns them (403).
 */
export function rushOwnerProblem(error: unknown): string | null {
  switch (statusOf(error)) {
    case 409:
      return "Someone else claimed them first.";
    case 400:
      return "That member's role can't work prospects. Their role needs “Add and work prospects” first.";
    case 403:
      return "Someone already owns this prospect. Someone who manages recruitment can reassign them.";
    default:
      return null;
  }
}
