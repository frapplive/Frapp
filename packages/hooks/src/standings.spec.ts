import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STANDINGS_WINDOWS,
  rankStandings,
  rollingMonthStart,
  useStandings,
} from "./standings";

/*
 * `useStandings` reads two boards and the semester archives; each read is
 * stubbed at its own module, so these assert what the hook asks for and how
 * it reads the answer. `serviceSemesterStartDate` runs for real, so the
 * semester's first day is the one the service board actually gets.
 */
const reads = vi.hoisted(() => ({
  semesters: {
    data: [] as unknown[] | undefined,
    isError: false,
    refetch: vi.fn(),
  },
  points: vi.fn(),
  service: vi.fn(),
  pointsAnswer: {
    data: [] as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  serviceAnswer: {
    data: [] as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("./use-semesters", () => ({
  useSemesters: () => reads.semesters,
}));
vi.mock("./use-points", () => ({
  useLeaderboard: (...args: unknown[]) => {
    reads.points(...args);
    return reads.pointsAnswer;
  },
}));
vi.mock("./use-service-entries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-service-entries")>()),
  useServiceLeaderboard: (...args: unknown[]) => {
    reads.service(...args);
    return reads.serviceAnswer;
  },
}));

describe("rankStandings", () => {
  it("places the highest total first, whatever order the board arrives in", () => {
    const places = rankStandings([
      { user_id: "b", total: 10 },
      { user_id: "a", total: 30 },
    ]);
    expect(places.get("a")).toEqual({ rank: 1, total: 30 });
    expect(places.get("b")).toEqual({ rank: 2, total: 10 });
  });

  it("lets equal totals share a place, and skips the places they take (1, 1, 3)", () => {
    const places = rankStandings([
      { user_id: "a", total: 20 },
      { user_id: "b", total: 20 },
      { user_id: "c", total: 5 },
    ]);
    expect([...places.values()].map((place) => place.rank)).toEqual([1, 1, 3]);
  });

  it("ranks nobody on an empty board", () => {
    expect(rankStandings([]).size).toBe(0);
  });
});

describe("STANDINGS_WINDOWS", () => {
  it("offers this semester first, the period standings open on", () => {
    expect(STANDINGS_WINDOWS.map((window) => window.value)).toEqual([
      "semester",
      "month",
      "all",
    ]);
  });
});

describe("rollingMonthStart", () => {
  it("is the same day one calendar month back, in local time", () => {
    expect(rollingMonthStart(new Date(2026, 10, 24))).toBe("2026-10-24");
    // Late in the evening is still the viewer's day, not UTC's.
    expect(rollingMonthStart(new Date(2026, 10, 24, 23, 30))).toBe(
      "2026-10-24",
    );
  });
});

describe("useStandings", () => {
  const SPRING = {
    id: "arch-1",
    label: "Spring 2026",
    end_date: "2026-05-15",
    created_at: "2026-05-16T00:00:00Z",
  };

  beforeEach(() => {
    reads.semesters.data = [SPRING];
    reads.semesters.isError = false;
    reads.points.mockClear();
    reads.service.mockClear();
    reads.pointsAnswer.data = [];
    reads.pointsAnswer.isError = false;
    reads.serviceAnswer.data = [];
    reads.serviceAnswer.isError = false;
  });

  describe("points", () => {
    it("reads a live window from the points board", () => {
      renderHook(() => useStandings("points", "month"));

      expect(reads.points).toHaveBeenLastCalledWith("month", undefined, {
        enabled: true,
      });
      expect(reads.service.mock.lastCall?.[1]).toEqual({ enabled: false });
    });

    it("reads an archived semester by its id", () => {
      const { result } = renderHook(() => useStandings("points", "arch-1"));

      expect(result.current.window).toBe("arch-1");
      expect(reads.points).toHaveBeenLastCalledWith("all", "arch-1", {
        enabled: true,
      });
    });

    it("offers the archived semesters after the live periods", () => {
      const { result } = renderHook(() => useStandings("points", "semester"));

      expect(result.current.windowOptions.map((o) => o.value)).toEqual([
        "semester",
        "month",
        "all",
        "arch-1",
      ]);
      expect(result.current.windowOptions.at(-1)?.label).toBe("Spring 2026");
    });
  });

  describe("service", () => {
    it("offers no archived semester: the service board has no archive to read", () => {
      const { result } = renderHook(() => useStandings("service", "arch-1"));

      expect(result.current.windowOptions.map((o) => o.value)).toEqual([
        "semester",
        "month",
        "all",
      ]);
      // An archive asked of service falls back to the default period.
      expect(result.current.window).toBe("semester");
    });

    it("counts this semester from the day after the latest archive", () => {
      renderHook(() => useStandings("service", "semester"));

      expect(reads.service).toHaveBeenLastCalledWith(
        { start_date: "2026-05-16" },
        { enabled: true },
      );
      expect(reads.points.mock.lastCall?.[2]).toEqual({ enabled: false });
    });

    it("holds the semester board until the semester's start is known", () => {
      reads.semesters.data = undefined;
      const { result } = renderHook(() => useStandings("service", "semester"));

      expect(reads.service.mock.lastCall?.[1]).toEqual({ enabled: false });
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isError).toBe(false);
    });

    it("says the semester failed rather than waiting on it forever", () => {
      reads.semesters.data = undefined;
      reads.semesters.isError = true;
      const { result } = renderHook(() => useStandings("service", "semester"));

      expect(reads.service.mock.lastCall?.[1]).toEqual({ enabled: false });
      expect(result.current.isError).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    it("reads a chapter that never rolled over with no bound", () => {
      reads.semesters.data = [];
      renderHook(() => useStandings("service", "semester"));

      expect(reads.service).toHaveBeenLastCalledWith({}, { enabled: true });
    });

    describe("this month", () => {
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date(2026, 10, 24, 12));
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it("counts the rolling month, as the points board does", () => {
        renderHook(() => useStandings("service", "month"));

        expect(reads.service).toHaveBeenLastCalledWith(
          { start_date: "2026-10-24" },
          { enabled: true },
        );
      });
    });

    it("reads all time with no bound", () => {
      renderHook(() => useStandings("service", "all"));

      expect(reads.service).toHaveBeenLastCalledWith({}, { enabled: true });
    });

    it("totals and words a member's hours", () => {
      reads.serviceAnswer.data = [
        { user_id: "a", member_name: "A", total_minutes: 150, entry_count: 2 },
      ];
      const { result } = renderHook(() => useStandings("service", "all"));

      expect(result.current.totalOf("a")).toBe(150);
      expect(result.current.rankOf("a")).toBe(1);
      expect(result.current.figure(150)).toBe("2.5 hours");
      expect(result.current.figure(60)).toBe("1 hour");
    });
  });

  it("numbers nobody at 0 or less, and counts a missing member as 0", () => {
    reads.pointsAnswer.data = [
      { user_id: "a", total: 30 },
      { user_id: "b", total: 0 },
      { user_id: "c", total: -5 },
    ];
    const { result } = renderHook(() => useStandings("points", "all"));

    expect(result.current.rankOf("a")).toBe(1);
    expect(result.current.rankOf("b")).toBeNull();
    expect(result.current.rankOf("c")).toBeNull();
    expect(result.current.rankOf("nobody")).toBeNull();
    expect(result.current.totalOf("c")).toBe(-5);
    expect(result.current.totalOf("nobody")).toBe(0);
  });

  it("says the board failed when its read failed with nothing to show", () => {
    reads.pointsAnswer.data = undefined;
    reads.pointsAnswer.isError = true;
    const { result } = renderHook(() => useStandings("points", "all"));

    expect(result.current.isError).toBe(true);
  });

  it("keeps a board it has when a refetch fails over it", () => {
    reads.pointsAnswer.data = [{ user_id: "a", total: 30 }];
    reads.pointsAnswer.isError = true;
    const { result } = renderHook(() => useStandings("points", "all"));

    expect(result.current.isError).toBe(false);
    expect(result.current.rankOf("a")).toBe(1);
  });

  it("reads nothing under any other sort", () => {
    const { result } = renderHook(() => useStandings(null, "semester"));

    expect(reads.points.mock.lastCall?.[2]).toEqual({ enabled: false });
    expect(reads.service.mock.lastCall?.[1]).toEqual({ enabled: false });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});
