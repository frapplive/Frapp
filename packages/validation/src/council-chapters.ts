import type { CouncilType } from "./council";

/**
 * Affiliations and PNM records (#5974): a chapter's school link, its link to
 * the school's council, and the council's view of PNMs.
 * `spec/architecture/school-layer.md` § 2.4 and § 2.5,
 * `spec/behavior/council-types.md` § Link offers.
 */

/** A chapter's school link (`school_chapters.status`). */
export const SCHOOL_LINK_STATUSES = [
  "proposed",
  "active",
  "declined",
  "ended",
] as const;
export type SchoolLinkStatus = (typeof SCHOOL_LINK_STATUSES)[number];

/** A chapter's council link (`council_chapters.status`). */
export const COUNCIL_LINK_STATUSES = [
  "proposed",
  "accepted",
  "declined",
  "suspended",
  "ended",
] as const;
export type CouncilLinkStatus = (typeof COUNCIL_LINK_STATUSES)[number];

/** The statuses an officer may move a council link to. */
export const COUNCIL_LINK_DECISIONS = [
  "accepted",
  "declined",
  "suspended",
  "ended",
] as const;
export type CouncilLinkDecision = (typeof COUNCIL_LINK_DECISIONS)[number];

/** The statuses a chapter officer may move a school link to. */
export const SCHOOL_LINK_DECISIONS = ["active", "declined", "ended"] as const;
export type SchoolLinkDecision = (typeof SCHOOL_LINK_DECISIONS)[number];

export const COUNCIL_LINK_SIDES = ["council", "chapter"] as const;
export type CouncilLinkSide = (typeof COUNCIL_LINK_SIDES)[number];

/**
 * Which chapter archetypes a council type is offered as members
 * (council-types.md § Link offers): an explicit map, never
 * `Archetype.council`. `null` is "any archetype". A council can still
 * accept any chapter at its school that asks; the map only decides which
 * chapters it's offered and which councils a chapter is offered.
 */
export const COUNCIL_LINK_OFFERS: Readonly<
  Record<CouncilType, readonly string[] | null>
> = {
  ifc: ["ifc", "colony"],
  panhellenic: ["npc", "colony"],
  nphc: ["nphc"],
  mgc: ["mgc", "nphc"],
  other: null,
};

/** Whether a council of this type is offered chapters of this archetype. */
export function councilOffersArchetype(
  type: CouncilType,
  archetype: string | null | undefined,
): boolean {
  const offers = COUNCIL_LINK_OFFERS[type];
  if (offers === null) return true;
  return archetype != null && offers.includes(archetype);
}

// API error codes ------------------------------------------------------------

/** The chapter's school link doesn't name the council's school (or isn't confirmed yet). */
export const AFFILIATION_NO_SHARED_SCHOOL_CODE = "affiliation.no_shared_school";
/** The pair already has a live link, or the chapter already has one to that school. */
export const AFFILIATION_EXISTS_CODE = "affiliation.exists";
/** The link isn't in a state that step applies to, or it isn't this side's step. */
export const AFFILIATION_INVALID_TRANSITION_CODE =
  "affiliation.invalid_transition";
/** No such link for this tenant, or the named tenant isn't one this side can link to. */
export const AFFILIATION_NOT_FOUND_CODE = "affiliation.not_found";

/** A council whose recruitment model is `none` has no PNM records (council-types.md). */
export const COUNCIL_RECRUITMENT_OFF_CODE = "council.recruitment_off";
export const COUNCIL_SEASON_NOT_FOUND_CODE = "council.season_not_found";
export const COUNCIL_SEASON_EXISTS_CODE = "council.season_exists";
export const PNM_NOT_FOUND_CODE = "pnm.not_found";
export const PNM_ALREADY_MERGED_CODE = "pnm.already_merged";
/** Two records with different Frapp accounts are two people. */
export const PNM_TWO_ACCOUNTS_CODE = "pnm.two_accounts";

// Retention (Paul, 2026-11-11, #4218) -------------------------------------------

/**
 * Days after season close a PNM record is kept by default: N in "season
 * close plus N days" (ifc-recruitment.md § Retention and deletion), and its
 * ceiling. A council may set less, never more.
 */
export const PNM_RETENTION_DEFAULT_DAYS = 180;

export const RECRUITMENT_TERM_MAX = 40;

// Copy, shared by web and the phone ---------------------------------------------

/**
 * How a council link reads, from the side looking at it. "Asked to join" is
 * the chapter's request waiting on the council; "Invited" is the council's
 * invitation waiting on the chapter.
 */
export function councilLinkLabel(
  status: CouncilLinkStatus,
  proposedBy: CouncilLinkSide,
): string {
  switch (status) {
    case "accepted":
      return "Member";
    case "suspended":
      return "Suspended";
    case "proposed":
      return proposedBy === "chapter" ? "Asked to join" : "Invited";
    case "declined":
      return "Declined";
    case "ended":
      return "Left";
  }
}

/** The council's Chapters page and section. */
export const COUNCIL_CHAPTERS_COPY = {
  title: "Chapters",
  requests: "Waiting on you",
  members: "Member chapters",
  invited: "Invited",
  invite: "Invite a chapter",
  inviteHint:
    "Chapters that confirmed your school. A chapter joins once its officers accept.",
  noCandidates:
    "No other chapter at your school has confirmed its school on Frapp yet.",
  empty: "No chapters yet",
  emptyBody:
    "Invite your school's chapters, or ask them to request to join from their own Frapp.",
  accept: "Accept",
  decline: "Decline",
  suspend: "Suspend",
  reinstate: "Reinstate",
  remove: "Remove from council",
  cancelInvite: "Cancel invite",
  unverified:
    "Your council isn't verified yet. Chapters can still join; PNM records wait for verification.",
  loadFailedTitle: "Couldn't load your chapters",
  actionFailed: "Couldn't update that chapter. Try again in a moment.",
  inviteFailed: "Couldn't invite that chapter. Try again in a moment.",
  candidatesFailed: "Couldn't load your school's chapters.",
  candidatesLoading: "Loading chapters",
  findChapter: "Find a chapter",
  offered: "Suggested",
  others: "Other chapters at your school",
  rowActions: (name: string) => `Actions for ${name}`,
  suspendTitle: (name: string) => `Suspend ${name}?`,
  suspendBody:
    "It stays listed as suspended until you reinstate it or remove it.",
  removeTitle: (name: string) => `Remove ${name} from the council?`,
  removeBody: "It stops being a member chapter, and can ask to join again.",
} as const;

/** The chapter's School and council page. */
export const CHAPTER_AFFILIATIONS_COPY = {
  title: "School and council",
  school: "School",
  noSchool: "Your chapter isn't linked to a school yet.",
  pickSchool: "Pick your school",
  proposedSchool:
    "Confirm this is your school. Your chapter's data stays your chapter's; councils at the school can invite you once it's confirmed.",
  confirm: "Confirm",
  notOurSchool: "Not our school",
  leaveSchool: "Unlink school",
  councils: "Councils",
  councilsHint:
    "A council sees nothing of your chapter until you're a member, and never reads your chapter's data.",
  noCouncils: "No council at your school is on Frapp yet.",
  confirmSchoolFirst: "Confirm your school to see its councils.",
  askToJoin: "Ask to join",
  cancelRequest: "Cancel request",
  leave: "Leave council",
  loadFailedTitle: "Couldn't load your school and councils",
  actionFailed: "Couldn't save that. Try again in a moment.",
  findSchool: "Find your school",
  typeMore: "Type your school's name",
  searching: "Searching",
  searchFailed: "Couldn't search schools. Try again in a moment.",
  rowActions: (name: string) => `Actions for ${name}`,
  unlinkTitle: (school: string) => `Unlink ${school}?`,
  unlinkBody: (school: string) =>
    `This also ends your chapter's council memberships at ${school}.`,
  leaveTitle: (council: string) => `Leave ${council}?`,
  leaveBody: "Your chapter stops being a member. You can ask to join again.",
} as const;
