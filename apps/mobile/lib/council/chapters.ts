import type { CouncilChapterRow, InviteCandidate } from "@repo/hooks";
import {
  can,
  COUNCIL_CHAPTERS_COPY,
  type CouncilLinkDecision,
} from "@repo/validation";

/**
 * The council's Chapters section on its home (#5974,
 * `components/council/council-chapters.tsx`): what a viewer may do to each
 * link. How the links group and a chapter's second line read are
 * `groupCouncilChapters` and `chapterListingLine` in `@repo/hooks`, shared
 * with web. Pure, for the spec.
 */

/** The phone's own words for the section; the shared ones are `COUNCIL_CHAPTERS_COPY`. */
export const COUNCIL_CHAPTERS_PHONE_COPY = {
  loading: "Loading your council's chapters",
  rowHint: "Opens what you can do with this chapter.",
  inviteHint: "Opens the chapters at your school you can invite.",
  removeConfirm: "Remove",
} as const;

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
