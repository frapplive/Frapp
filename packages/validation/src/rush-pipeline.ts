/**
 * The chapter recruitment pipeline's shared rules (#5924,
 * `spec/behavior/rush.md` § Pipeline): the six fixed stage categories and
 * their default stages, the reasons a candidate can be closed with, and the
 * limits the API enforces and the clients check before they send.
 *
 * A chapter renames, adds, reorders and hides its own stages, but each one
 * stays in a fixed category, and anything automatic (where a new candidate
 * lands) goes by category, never by a stage's name.
 */

export const RUSH_STAGE_CATEGORIES = [
  "new",
  "contacted",
  "met",
  "engaged",
  "bid_ready",
  "closed",
] as const;

export type RushStageCategory = (typeof RUSH_STAGE_CATEGORIES)[number];

/** Each category's plain name, for a stage editor's category picker. */
export const RUSH_STAGE_CATEGORY_LABELS: Record<RushStageCategory, string> = {
  new: "New",
  contacted: "Contacted",
  met: "Met",
  engaged: "Engaged",
  bid_ready: "Bid ready",
  closed: "Closed",
};

/**
 * The stages every chapter starts with, one per category, in order. A default
 * stage's key is its category's, so a candidate row that predates stages
 * (`stage = 'new'`) already sits in the right one.
 */
export const DEFAULT_RUSH_STAGES: readonly {
  key: string;
  label: string;
  category: RushStageCategory;
}[] = RUSH_STAGE_CATEGORIES.map((category) => ({
  key: category,
  label: RUSH_STAGE_CATEGORY_LABELS[category],
  category,
}));

/** Categories that must always keep at least one visible stage. */
export const RUSH_REQUIRED_VISIBLE_CATEGORIES: readonly RushStageCategory[] = [
  "new",
  "closed",
];

/** Reasons a member picks when closing a candidate by hand. */
export const RUSH_MANUAL_CLOSED_REASONS = [
  "not_interested",
  "not_eligible",
  "chapter_passed",
  "no_response",
] as const;

/** Reasons only the system sets (later slices: bids, the PNM's own view). */
export const RUSH_AUTOMATIC_CLOSED_REASONS = [
  "accepted_elsewhere",
  "withdrew",
  "deleted_info",
] as const;

export type RushManualClosedReason =
  (typeof RUSH_MANUAL_CLOSED_REASONS)[number];
export type RushClosedReason =
  RushManualClosedReason | (typeof RUSH_AUTOMATIC_CLOSED_REASONS)[number];

export const RUSH_CLOSED_REASONS: readonly RushClosedReason[] = [
  ...RUSH_MANUAL_CLOSED_REASONS,
  ...RUSH_AUTOMATIC_CLOSED_REASONS,
];

export const RUSH_CLOSED_REASON_LABELS: Record<RushClosedReason, string> = {
  not_interested: "Not interested",
  not_eligible: "Not eligible",
  chapter_passed: "Chapter passed",
  no_response: "No response",
  accepted_elsewhere: "Accepted elsewhere",
  withdrew: "Withdrew",
  deleted_info: "Deleted their information",
};

export function isRushManualClosedReason(
  value: unknown,
): value is RushManualClosedReason {
  return (
    typeof value === "string" &&
    (RUSH_MANUAL_CLOSED_REASONS as readonly string[]).includes(value)
  );
}

export const RUSH_RATING_MIN = 1;
export const RUSH_RATING_MAX = 5;
export const RUSH_STAGE_LABEL_MAX = 40;
export const RUSH_STAGES_MAX = 30;
export const RUSH_TAG_LABEL_MAX = 40;
export const RUSH_TAGS_MAX = 100;
export const RUSH_NOTE_MAX = 4000;

export function isRushStageCategory(
  value: unknown,
): value is RushStageCategory {
  return (
    typeof value === "string" &&
    (RUSH_STAGE_CATEGORIES as readonly string[]).includes(value)
  );
}

export interface RushStageLike {
  key: string;
  label: string;
  category: RushStageCategory;
  hidden: boolean;
}

/**
 * Stages in the order a board draws them: by category first, then the
 * chapter's own order inside it. A stage never leaves its category, so a
 * chapter's order only matters within one.
 */
export function sortRushStages<
  T extends { category: RushStageCategory; position: number },
>(stages: readonly T[]): T[] {
  return [...stages].sort(
    (a, b) =>
      RUSH_STAGE_CATEGORIES.indexOf(a.category) -
        RUSH_STAGE_CATEGORIES.indexOf(b.category) || a.position - b.position,
  );
}

/**
 * The first visible stage in a category, which is where an automatic move
 * lands; `undefined` when every stage in it is hidden, and the move is
 * skipped.
 */
export function firstVisibleRushStage<
  T extends { category: RushStageCategory; position: number; hidden: boolean },
>(stages: readonly T[], category: RushStageCategory): T | undefined {
  return sortRushStages(stages).find(
    (stage) => stage.category === category && !stage.hidden,
  );
}

/**
 * Why a chapter's edited stage list can't be saved, in words for the editor,
 * or `null` when it can. The API runs the same check.
 */
export function rushStagesProblem(
  stages: readonly Pick<RushStageLike, "label" | "category" | "hidden">[],
): string | null {
  if (stages.length === 0) return "Add at least one stage.";
  if (stages.length > RUSH_STAGES_MAX) {
    return `A chapter can have up to ${RUSH_STAGES_MAX} stages.`;
  }
  const seen = new Set<string>();
  for (const stage of stages) {
    if (!isRushStageCategory(stage.category)) {
      return "Each stage needs a category.";
    }
    const label = stage.label.trim();
    if (label.length === 0) return "Give every stage a name.";
    if (label.length > RUSH_STAGE_LABEL_MAX) {
      return `Stage names can be up to ${RUSH_STAGE_LABEL_MAX} characters.`;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) return `Two stages are named "${label}".`;
    seen.add(key);
  }
  for (const category of RUSH_REQUIRED_VISIBLE_CATEGORIES) {
    if (!stages.some((s) => s.category === category && !s.hidden)) {
      return `${RUSH_STAGE_CATEGORY_LABELS[category]} needs at least one stage that isn't hidden.`;
    }
  }
  return null;
}

/** "3.7" for an average rating, one decimal, no trailing ".0" for whole numbers. */
export function formatRushRatingAverage(average: number): string {
  const rounded = Math.round(average * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// ── Contacts, owner, follow-ups and the stale alert (#5934) ─────────────────

/** How a member reached a prospect, for a logged contact. */
export const RUSH_CONTACT_KINDS = [
  "text",
  "call",
  "in_person",
  "social_dm",
  "email",
  "event",
] as const;

export type RushContactKind = (typeof RUSH_CONTACT_KINDS)[number];

/** Each kind as a button reads: what the member did. */
export const RUSH_CONTACT_KIND_LABELS: Record<RushContactKind, string> = {
  text: "Text",
  call: "Call",
  in_person: "In person",
  social_dm: "Social DM",
  email: "Email",
  event: "At an event",
};

/** Each kind as a history line reads: "Texted · November 18 · by Chris". */
export const RUSH_CONTACT_KIND_PAST: Record<RushContactKind, string> = {
  text: "Texted",
  call: "Called",
  in_person: "Met in person",
  social_dm: "Messaged on social",
  email: "Emailed",
  event: "Saw at an event",
};

export function isRushContactKind(value: unknown): value is RushContactKind {
  return (
    typeof value === "string" &&
    (RUSH_CONTACT_KINDS as readonly string[]).includes(value)
  );
}

export const RUSH_CONTACT_NOTE_MAX = 500;
export const RUSH_FOLLOW_UP_NOTE_MAX = 120;
/** How far back a contact may be dated. A season is shorter than this. */
export const RUSH_CONTACT_LOOKBACK_DAYS = 120;
/** How far ahead a follow-up may be set. */
export const RUSH_FOLLOW_UP_AHEAD_DAYS = 180;
export const RUSH_STALE_DAYS_DEFAULT = 7;
export const RUSH_STALE_DAYS_MIN = 1;
export const RUSH_STALE_DAYS_MAX = 60;

/** A `YYYY-MM-DD` day moved by whole days. */
export function shiftRushDayKey(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const at = new Date(Date.UTC(y!, m! - 1, d! + days));
  return at.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
export function rushDaysBetween(from: string, to: string): number {
  const ms = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

interface RushWorkLike {
  closed_reason: string | null;
  created_at: string;
  last_contact_on: string | null;
  follow_up_on: string | null;
}

/**
 * The day an open prospect goes stale: `staleDays` after their last logged
 * contact, or after they were added when nobody has logged one. `null` for a
 * closed prospect, which never goes stale. The API's morning sweep and both
 * clients read this one rule.
 */
export function rushStaleOn(
  candidate: Omit<RushWorkLike, "follow_up_on">,
  staleDays: number,
): string | null {
  if (candidate.closed_reason != null) return null;
  const base = candidate.last_contact_on ?? candidate.created_at.slice(0, 10);
  return shiftRushDayKey(base, staleDays);
}

/** "Needs follow-up": open, and nobody has logged a contact for too long. */
export function isRushCandidateStale(
  candidate: Omit<RushWorkLike, "follow_up_on">,
  staleDays: number,
  today: string,
): boolean {
  const on = rushStaleOn(candidate, staleDays);
  return on !== null && on <= today;
}

/** A follow-up due today or already past, on an open prospect. */
export function isRushFollowUpDue(
  candidate: Pick<RushWorkLike, "closed_reason" | "follow_up_on">,
  today: string,
): boolean {
  return (
    candidate.closed_reason == null &&
    candidate.follow_up_on != null &&
    candidate.follow_up_on <= today
  );
}

/**
 * Whether a prospect belongs under the phone list's **Follow up** chip for
 * `viewerId`: a follow-up of theirs is due, or a prospect they own needs one.
 */
export function isRushFollowUpForViewer(
  candidate: RushWorkLike & {
    owner_id: string | null;
    follow_up_user_id: string | null;
  },
  viewerId: string,
  staleDays: number,
  today: string,
): boolean {
  if (
    candidate.follow_up_user_id === viewerId &&
    isRushFollowUpDue(candidate, today)
  ) {
    return true;
  }
  return (
    candidate.owner_id === viewerId &&
    isRushCandidateStale(candidate, staleDays, today)
  );
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * A recruitment day as the screens say it, relative to `today`, written out
 * as the rulebook's § Words and dates asks (no "Thu", no "Nov 3"): "Today",
 * "Yesterday", "Tomorrow", the weekday within the coming week ("Thursday"),
 * else "November 3", with the year only when it differs. A past day is never
 * a weekday, so an overdue follow-up can't read like next week's, as
 * `@repo/formatting`'s `formatDayHeading` does.
 */
export function formatRushDay(day: string, today: string): string {
  const diff = rushDaysBetween(today, day);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  const [y, m, d] = day.split("-").map(Number);
  const at = new Date(Date.UTC(y!, m! - 1, d!));
  // A weekday only ahead: a past one would read the same as next week's.
  if (diff > 1 && diff < 7) return WEEKDAYS[at.getUTCDay()]!;
  const monthDay = `${MONTHS[at.getUTCMonth()]} ${at.getUTCDate()}`;
  return day.slice(0, 4) === today.slice(0, 4) ? monthDay : `${monthDay}, ${y}`;
}

/**
 * How many follow-ups are due for `viewerId` today or earlier, on open
 * prospects: the "N follow-ups due today" both headers say.
 */
export function rushFollowUpsDueCount(
  candidates: readonly Pick<
    RushWorkLike & { follow_up_user_id: string | null },
    "closed_reason" | "follow_up_on" | "follow_up_user_id"
  >[],
  viewerId: string,
  today: string,
): number {
  return candidates.filter(
    (c) => c.follow_up_user_id === viewerId && isRushFollowUpDue(c, today),
  ).length;
}

/**
 * The starting tier an accepted PNM joins under (#4068 decision 10): the one
 * named "New members", whatever its case or spacing. A chapter that renamed it
 * away has none, and its Recruitment settings ask it to pick a role instead
 * (`spec/behavior/ifc-recruitment.md` § Bids).
 */
export const RUSH_NEW_MEMBERS_TIER_NAME = "New members";

export function rushNewMembersTier<T extends { name: string }>(
  tiers: readonly T[],
): T | null {
  const key = RUSH_NEW_MEMBERS_TIER_NAME.toLowerCase();
  return (
    tiers.find(
      (tier) => tier.name.trim().replace(/\s+/g, " ").toLowerCase() === key,
    ) ?? null
  );
}

// ── Bids (#5973) ─────────────────────────────────────────────────────────────

/**
 * A bid's full state (`spec/behavior/ifc-recruitment.md` § Bids). Only bid
 * actions move it, never a stage move. A recorded acceptance stays
 * `extended` until it is confirmed.
 */
export const RUSH_BID_STATES = [
  "none",
  "extended",
  "accepted",
  "declined",
  "expired",
  "rescinded",
] as const;
export type RushBidState = (typeof RUSH_BID_STATES)[number];

/**
 * The two values shipped clients read in `bid_status` (§ Compatibility with
 * shipped clients): an acceptance still reads as a bid out, and every other
 * state as none.
 */
export function rushLegacyBidStatus(state: RushBidState): "none" | "extended" {
  return state === "extended" || state === "accepted" ? "extended" : "none";
}

/** Extend is allowed only from these; anything else is answered 409. */
export function canExtendRushBid(state: RushBidState): boolean {
  return state === "none" || state === "expired";
}

/** How long a bid stays open, a chapter setting until councils land. */
export const RUSH_BID_EXPIRY_DAYS_DEFAULT = 7;
export const RUSH_BID_EXPIRY_DAYS_MIN = 1;
export const RUSH_BID_EXPIRY_DAYS_MAX = 30;
export const RUSH_BID_RESCIND_REASON_MAX = 200;

/** A recorded acceptance's state's words: "Waiting to confirm". */
export const RUSH_BID_WAITING_TO_CONFIRM = "Waiting to confirm";
