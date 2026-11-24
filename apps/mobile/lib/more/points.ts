import { formatDay } from "@repo/formatting";
import { pointRowText } from "@repo/validation";
import { metaLine, num, records, str } from "./narrow";

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
 * the API sends them (newest first). The title and category come from
 * `pointRowText`, which web's Points panel reads too; the day follows.
 */
export function selectPointRows(data: unknown, now?: Date): PointRow[] {
  return records(data).flatMap((row) => {
    const id = str(row, "id");
    const amount = num(row, "amount");
    if (!id || amount === null) return [];
    const { title, metaCategory } = pointRowText({
      description: str(row, "description"),
      category: str(row, "category"),
    });
    const day = formatDay(str(row, "created_at"), now);
    return [{ id, title, meta: metaLine([metaCategory, day]), amount }];
  });
}
