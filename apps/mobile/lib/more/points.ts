import { formatDay } from "@repo/formatting";
import { pointCategoryLabel } from "@repo/validation";
import { metaLine, num, records, str } from "./narrow";

/**
 * The live periods `GET /v1/points/me` takes, in the order both apps offer
 * them (web's Points panel on Profile lists the same three, then the
 * chapter's archived semesters). Any other value is an archive's id.
 */
export const POINTS_PERIODS = [
  { value: "all", label: "All time" },
  { value: "semester", label: "This semester" },
  { value: "month", label: "This month" },
] as const;

export type LivePointsPeriod = (typeof POINTS_PERIODS)[number]["value"];

export function isLivePointsPeriod(value: string): value is LivePointsPeriod {
  return POINTS_PERIODS.some((period) => period.value === value);
}

export interface PointRow {
  id: string;
  /** The reason; a transaction without one is titled by its category. */
  title: string;
  /** `"Attendance · November 16"`; the category drops out when it is the title. */
  meta: string | null;
  amount: number;
}

/**
 * A member's own transactions as the Points screen lists them, in the order
 * the API sends them (newest first). The row reads as web's does: the reason
 * as the title, then the category and the day.
 */
export function selectPointRows(data: unknown, now?: Date): PointRow[] {
  return records(data).flatMap((row) => {
    const id = str(row, "id");
    const amount = num(row, "amount");
    if (!id || amount === null) return [];
    const reason = (str(row, "description") ?? "").trim();
    const category = pointCategoryLabel(str(row, "category"));
    const day = formatDay(str(row, "created_at"), now);
    return [
      {
        id,
        title: reason || category || "Points",
        meta: metaLine([reason ? category : null, day]),
        amount,
      },
    ];
  });
}

/** `10` → `"+10"`, `-5` → `"-5"`: how a transaction's amount is written. */
export function signedPoints(amount: number): string {
  return amount >= 0 ? `+${amount}` : `${amount}`;
}
