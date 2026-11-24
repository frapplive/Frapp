import { pointCategoryLabel } from "./point-category";

/**
 * How a member's own point history reads on both apps (#5950): the periods it
 * is counted over, a transaction's title, and its signed amount. Web's Points
 * panel on Profile and the phone's Points screen both read this module, so
 * the same transaction is never titled two ways.
 */

/** The labels of the live periods `GET /v1/points/me` and the boards take. */
export const POINTS_PERIOD_LABELS = {
  all: "All time",
  semester: "This semester",
  // The server's rolling month (now back one calendar month), which every
  // "This month" in the app means (`apps/api/src/domain/utils/points-window.ts`).
  month: "This month",
} as const;

export type LivePointsPeriod = keyof typeof POINTS_PERIOD_LABELS;

/**
 * A member's own points periods, in the order both apps offer them; the
 * chapter's archived semesters follow (`pointsPeriodOptions`). Any other
 * value is an archive's id.
 */
export const POINTS_PERIODS: readonly { value: LivePointsPeriod; label: string }[] =
  (["all", "semester", "month"] as const).map((value) => ({
    value,
    label: POINTS_PERIOD_LABELS[value],
  }));

export function isLivePointsPeriod(value: string): value is LivePointsPeriod {
  return POINTS_PERIODS.some((period) => period.value === value);
}

/** The live periods, then each archived semester by its label. */
export function pointsPeriodOptions(
  archives: readonly { id: string; label: string }[],
): { value: string; label: string }[] {
  return [
    ...POINTS_PERIODS,
    ...archives.map((archive) => ({ value: archive.id, label: archive.label })),
  ];
}

/**
 * A transaction's title and the category its meta line carries: the reason
 * is the title; one without a reason is titled by its category, and its meta
 * line then drops the category rather than saying it twice. A blank reason
 * counts as none.
 */
export function pointRowText(transaction: {
  description?: string | null;
  category?: string | null;
}): { title: string; metaCategory: string | null } {
  const reason = (transaction.description ?? "").trim();
  const category = pointCategoryLabel(transaction.category);
  return {
    title: reason || category || "Points",
    metaCategory: reason ? category : null,
  };
}

/** `10` → `"+10"`, `-5` → `"-5"`: how a transaction's amount is written. */
export function signedPoints(amount: number): string {
  return amount >= 0 ? `+${amount}` : `${amount}`;
}
