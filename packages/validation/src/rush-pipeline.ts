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
