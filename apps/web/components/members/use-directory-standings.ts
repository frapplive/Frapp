"use client";

import { useCallback, useMemo } from "react";
import {
  formatServiceHours,
  useLeaderboard,
  useSemesters,
  useServiceLeaderboard,
  type SemesterArchive,
} from "@repo/hooks";
import { formatPoints } from "@repo/formatting";
import { useServiceSemesterStart } from "@/components/service/use-my-service-log";
import { asArray } from "@/lib/utils";

/** What a standings sort ranks the chapter by. */
export type StandingsMetric = "points" | "service";

/** The live periods a standings sort can count over. */
export const STANDINGS_WINDOWS = [
  { value: "semester", label: "This semester" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
] as const;

type LiveWindow = (typeof STANDINGS_WINDOWS)[number]["value"];

/** The period standings open on (`spec/behavior/points.md` § Standings). */
export const DEFAULT_STANDINGS_WINDOW: LiveWindow = "semester";

const isLiveWindow = (value: string): value is LiveWindow =>
  STANDINGS_WINDOWS.some((window) => window.value === value);

/** The first day of this month, `YYYY-MM-DD`, in the viewer's own zone. */
function monthStart(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-01`;
}

/**
 * Each member's place on a board that arrives sorted by total, highest first.
 * Equal totals share a place (1, 1, 3), the way the phone counts it: a new
 * chapter's board is its whole roster at 0, and numbering that 1 to 40 would
 * rank people who haven't started.
 */
export function rankBoard(
  rows: readonly { user_id: string; total: number }[],
): Map<string, { rank: number; total: number }> {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const places = new Map<string, { rank: number; total: number }>();
  let rank = 0;
  sorted.forEach((row, index) => {
    if (index === 0 || row.total !== sorted[index - 1]?.total) rank = index + 1;
    places.set(row.user_id, { rank, total: row.total });
  });
  return places;
}

export type DirectoryStandings = {
  /** The periods the sort offers, archived semesters after the live ones. */
  windowOptions: readonly { value: string; label: string }[];
  /** The period in force: `window`, or the default when it doesn't apply. */
  window: string;
  /** A member's total in the period; 0 for one who isn't on the board. */
  totalOf: (userId: string) => number;
  /**
   * A member's place in the chapter, never renumbered by a search or a
   * filter: rank belongs to the board, not to the rows on screen. One who
   * isn't on the board ranks after everyone who is.
   */
  rankOf: (userId: string) => number;
  /** The total as the row prints it: "45 points", "2.5 hours". */
  figure: (total: number) => string;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

/**
 * Directory's standings (#5950): the chapter ranked by points or by approved
 * service hours over a period, read from the two boards that had pages of
 * their own (`GET /v1/points/leaderboard`, `GET
 * /v1/service-entries/leaderboard`). `metric` is `null` under any other sort,
 * and then nothing is read.
 *
 * Archived semesters are a period for points only: the points board takes an
 * archive id, the service board a date range it has no archive for.
 */
export function useDirectoryStandings(
  metric: StandingsMetric | null,
  requestedWindow: string,
): DirectoryStandings {
  const semestersQuery = useSemesters();
  const archives = useMemo(
    () => asArray<SemesterArchive>(semestersQuery.data),
    [semestersQuery.data],
  );
  const windowOptions = useMemo(
    () =>
      metric === "points"
        ? [
            ...STANDINGS_WINDOWS,
            ...archives.map((archive) => ({
              value: archive.id,
              label: archive.label,
            })),
          ]
        : STANDINGS_WINDOWS,
    [metric, archives],
  );
  const window = windowOptions.some((o) => o.value === requestedWindow)
    ? requestedWindow
    : DEFAULT_STANDINGS_WINDOW;
  const live = isLiveWindow(window);

  const pointsQuery = useLeaderboard(
    live ? window : "all",
    live ? undefined : window,
    { enabled: metric === "points" },
  );

  // This semester waits for its start day; a chapter that never rolled over
  // (`null`) reads the same board as All time, with no bound.
  const semester = useServiceSemesterStart();
  const waitingOnSemester =
    metric === "service" && window === "semester" && semester.start === undefined;
  const range =
    window === "semester"
      ? semester.start
        ? { start_date: semester.start }
        : {}
      : window === "month"
        ? { start_date: monthStart(new Date()) }
        : {};
  const serviceQuery = useServiceLeaderboard(range, {
    enabled: metric === "service" && !waitingOnSemester,
  });

  const places = useMemo(() => {
    if (metric === "points") {
      return rankBoard(
        asArray<{ user_id?: unknown; total?: unknown }>(pointsQuery.data)
          .filter(
            (row): row is { user_id: string; total: number } =>
              typeof row.user_id === "string" && typeof row.total === "number",
          ),
      );
    }
    if (metric === "service") {
      return rankBoard(
        (serviceQuery.data ?? []).map((row) => ({
          user_id: row.user_id,
          total: row.total_minutes,
        })),
      );
    }
    return new Map<string, { rank: number; total: number }>();
  }, [metric, pointsQuery.data, serviceQuery.data]);

  // Everyone with nothing in the period shares the place after the last
  // member who has something.
  const unranked = useMemo(() => {
    let withTotal = 0;
    for (const place of places.values()) if (place.total > 0) withTotal += 1;
    return withTotal + 1;
  }, [places]);

  // Stable while the board is: the list memoises its order on these.
  const totalOf = useCallback(
    (userId: string) => places.get(userId)?.total ?? 0,
    [places],
  );
  const rankOf = useCallback(
    (userId: string) => {
      const place = places.get(userId);
      return place && place.total > 0 ? place.rank : unranked;
    },
    [places, unranked],
  );
  const figure = useCallback(
    (total: number) =>
      metric === "service"
        ? `${formatServiceHours(total)} ${total === 60 ? "hour" : "hours"}`
        : formatPoints(total),
    [metric],
  );

  const query = metric === "service" ? serviceQuery : pointsQuery;
  return {
    windowOptions,
    window,
    totalOf,
    rankOf,
    figure,
    isLoading:
      metric !== null &&
      (query.isLoading || (waitingOnSemester && !semester.isError)),
    isError:
      metric !== null &&
      ((query.isError && query.data === undefined) ||
        (waitingOnSemester && semester.isError)),
    refetch: () => {
      if (waitingOnSemester) semester.refetch();
      void query.refetch();
    },
  };
}
