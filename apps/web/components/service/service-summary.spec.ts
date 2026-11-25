import { describe, expect, it } from "vitest";
import { hoursLabel, ownServiceTotals } from "./service-summary";

const entry = (status: string, date: string, duration_minutes: number) => ({
  status,
  date,
  duration_minutes,
});

describe("ownServiceTotals", () => {
  const entries = [
    entry("APPROVED", "2026-08-20", 90),
    entry("APPROVED", "2026-08-01", 60),
    entry("PENDING", "2026-09-01", 45),
    entry("REJECTED", "2026-09-02", 600),
  ];

  it("counts approved time only, with pending beside it", () => {
    expect(ownServiceTotals(entries, null)).toEqual({
      semesterMinutes: 150,
      allTimeMinutes: 150,
      pendingMinutes: 45,
      pendingCount: 1,
    });
  });

  it("counts this semester from its first day, inclusive", () => {
    expect(ownServiceTotals(entries, "2026-08-20").semesterMinutes).toBe(90);
    expect(ownServiceTotals(entries, "2026-08-21").semesterMinutes).toBe(0);
  });

  it("leaves this semester unknown rather than guessing", () => {
    expect(ownServiceTotals(entries, undefined).semesterMinutes).toBeNull();
  });
});

describe("hoursLabel", () => {
  it("drops a whole hour's decimal and keeps a half", () => {
    expect(hoursLabel(120)).toBe("2 h");
    expect(hoursLabel(90)).toBe("1.5 h");
    expect(hoursLabel(0)).toBe("0 h");
  });
});
