import type { CouncilChapterRow, InviteCandidate } from "@repo/hooks";
import { ARCHETYPES } from "@repo/org-archetypes";
import {
  can,
  COUNCIL_CHAPTERS_COPY,
  type CouncilLinkDecision,
} from "@repo/validation";

/**
 * The council's Chapters section on its home (#5974,
 * `components/council/council-chapters.tsx`): how its links group, what a
 * viewer may do to each, and how a chapter's second line reads. Pure, for
 * the spec.
 */

/** The phone's own words for the section; the shared ones are `COUNCIL_CHAPTERS_COPY`. */
export const COUNCIL_CHAPTERS_PHONE_COPY = {
  loading: "Loading your council's chapters",
  rowHint: "Opens what you can do with this chapter.",
  inviteHint: "Opens the chapters at your school you can invite.",
  removeConfirm: "Remove",
} as const;

/** The live links, in the three lists the section draws. */
export interface CouncilChapterGroups {
  /** A chapter asked to join and the council hasn't answered. */
  requests: CouncilChapterRow[];
  /** Accepted and suspended, by name. */
  members: CouncilChapterRow[];
  /** The council invited and the chapter hasn't answered. */
  invited: CouncilChapterRow[];
}

const byName = (a: CouncilChapterRow, b: CouncilChapterRow) =>
  a.chapter.name.localeCompare(b.chapter.name);

/**
 * Splits the council's links into the section's lists. Declined and ended
 * links are history, not chapters, and are left out. Requests and invites
 * keep the API's order (newest first); members read by name, a suspended one
 * in its place among them, so the list doesn't reshuffle when one is
 * suspended.
 */
export function groupCouncilChapters(
  rows: readonly CouncilChapterRow[],
): CouncilChapterGroups {
  const groups: CouncilChapterGroups = {
    requests: [],
    members: [],
    invited: [],
  };
  for (const row of rows) {
    const { status, proposed_by_side: side } = row.link;
    if (status === "proposed" && side === "chapter") groups.requests.push(row);
    else if (status === "proposed") groups.invited.push(row);
    else if (status === "accepted" || status === "suspended")
      groups.members.push(row);
  }
  groups.members.sort(byName);
  return groups;
}

/** Whether the viewer can read the list (`GET /v1/council/chapters`). */
export function canViewCouncilChapters(permissions: readonly string[]) {
  return can("members:view", permissions);
}

/** Whether the viewer can invite and decide (`council:chapters_manage`). */
export function canManageCouncilChapters(permissions: readonly string[]) {
  return can("council:chapters_manage", permissions);
}

export type CouncilChapterActionKey =
  "accept" | "decline" | "suspend" | "reinstate" | "remove" | "cancelInvite";

export interface CouncilChapterAction {
  key: CouncilChapterActionKey;
  label: string;
  /** What `PATCH /v1/council/chapters/:linkId` is sent. */
  status: CouncilLinkDecision;
  /** Red and last in the menu. */
  destructive: boolean;
  /** Asks first, through `confirmAlert`. */
  confirm: boolean;
}

const ACTIONS: Record<CouncilChapterActionKey, CouncilChapterAction> = {
  accept: {
    key: "accept",
    label: COUNCIL_CHAPTERS_COPY.accept,
    status: "accepted",
    destructive: false,
    confirm: false,
  },
  decline: {
    key: "decline",
    label: COUNCIL_CHAPTERS_COPY.decline,
    status: "declined",
    destructive: false,
    confirm: false,
  },
  suspend: {
    key: "suspend",
    label: COUNCIL_CHAPTERS_COPY.suspend,
    status: "suspended",
    destructive: false,
    confirm: true,
  },
  // `accepted` also lifts the council's own suspension (DecideCouncilLinkDto).
  reinstate: {
    key: "reinstate",
    label: COUNCIL_CHAPTERS_COPY.reinstate,
    status: "accepted",
    destructive: false,
    confirm: false,
  },
  remove: {
    key: "remove",
    label: COUNCIL_CHAPTERS_COPY.remove,
    status: "ended",
    destructive: true,
    confirm: true,
  },
  // A withdrawn invite is gone and can be sent again, so it doesn't ask.
  cancelInvite: {
    key: "cancelInvite",
    label: COUNCIL_CHAPTERS_COPY.cancelInvite,
    status: "ended",
    destructive: true,
    confirm: false,
  },
};

/**
 * What the viewer may do to one link, in menu order: none without
 * `council:chapters_manage`, so a delegate's rows are plain rows. A request
 * is answered (Accept, Decline); a member is suspended or reinstated, or
 * removed; an invite is cancelled.
 */
export function councilChapterActions(
  row: CouncilChapterRow,
  permissions: readonly string[],
): CouncilChapterAction[] {
  if (!canManageCouncilChapters(permissions)) return [];
  const { status, proposed_by_side: side } = row.link;
  const keys: CouncilChapterActionKey[] =
    status === "proposed" && side === "chapter"
      ? ["accept", "decline"]
      : status === "proposed"
        ? ["cancelInvite"]
        : status === "accepted"
          ? ["suspend", "remove"]
          : status === "suspended"
            ? ["reinstate", "remove"]
            : [];
  return keys.map((key) => ACTIONS[key]);
}

/**
 * A chapter's second line: what kind of chapter it is and its school
 * ("IFC Fraternity · Rensselaer Polytechnic Institute"). Only the public
 * listing, never anything of its members. An archetype this app doesn't
 * know is left out rather than guessed.
 */
export function chapterListingLine(
  chapter: Pick<CouncilChapterRow["chapter"], "org_archetype" | "university">,
): string {
  const key = chapter.org_archetype;
  const kind =
    key && Object.hasOwn(ARCHETYPES, key)
      ? ARCHETYPES[key as keyof typeof ARCHETYPES].label
      : null;
  return [kind, chapter.university.trim() || null].filter(Boolean).join(" · ");
}

/**
 * The invite sheet's rows: the chapters the council's type is offered
 * first (council-types.md § Link offers), each group by name.
 */
export function orderedInviteCandidates(
  candidates: readonly InviteCandidate[],
): InviteCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      Number(b.offered) - Number(a.offered) ||
      a.chapter.name.localeCompare(b.chapter.name),
  );
}
