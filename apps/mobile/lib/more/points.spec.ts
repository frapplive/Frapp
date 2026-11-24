import { describe, expect, it } from "vitest";
import { selectPointRows } from "./points";

const NOW = new Date(2026, 10, 24, 12, 0, 0);

describe("selectPointRows", () => {
  it("titles a row by its reason, with the category and the day under it", () => {
    const [row] = selectPointRows(
      [
        {
          id: "t-1",
          amount: 10,
          category: "ATTENDANCE",
          description: "Chapter meeting attendance",
          created_at: "2026-11-16T18:00:00Z",
        },
      ],
      NOW,
    );
    expect(row).toMatchObject({
      id: "t-1",
      title: "Chapter meeting attendance",
      amount: 10,
    });
    expect(row!.meta).toMatch(/^Attendance · /);
  });

  it("titles a row with no reason by its category, and doesn't say it twice", () => {
    const [row] = selectPointRows(
      [{ id: "t-2", amount: -5, category: "FINE", description: "" }],
      NOW,
    );
    expect(row!.title).toBe("Fine");
    expect(row!.meta).toBeNull();
  });

  it("treats a blank reason as none, as web does", () => {
    const [row] = selectPointRows(
      [{ id: "t-4", amount: 3, category: "MANUAL", description: "   " }],
      NOW,
    );
    expect(row!.title).toBe("Manual");
  });

  it("skips a row without an id or an amount, and anything that isn't a list", () => {
    expect(selectPointRows([{ id: "t-3" }, { amount: 4 }], NOW)).toEqual([]);
    expect(selectPointRows(undefined, NOW)).toEqual([]);
  });
});
