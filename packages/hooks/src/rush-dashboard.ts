import {
  formatRushRatingAverage,
  isRushCandidateStale,
  isRushFollowUpDue,
  type RushStageCategory,
} from "@repo/validation";
import {
  rushBoardColumns,
  rushCandidatesByColumn,
  type RushStageView,
} from "./rush-pipeline";
import type { RushPipelineCandidate } from "./use-rush-pipeline";

/**
 * The recruitment dashboard (#5973, `spec/behavior/rush.md` § Funnel,
 * `ifc-recruitment.md` § Dashboard), worked out from the same pipeline read
 * the board draws, so every number here is a count of cards the board shows:
 * the funnel is the board's columns, in the chapter's order, with Closed
 * folded as the board folds it.
 *
 * Vote counts and rating averages come only from a pipeline read made with
 * `rush:view_results`, which is the only read that carries them (#4084), so
 * `results` is null for everyone else.
 *
 * Shared by web's Summary and the phone's Summary chip so both say the same.
 * Eligibility, sources and the next council date join when the slices that
 * record them land (`ifc-recruitment.md` § Phasing).
 */
export interface RushDashboard {
  /** One row per board column: its name and how many prospects it holds. */
  funnel: RushFunnelRow[];
  /** Prospects not in a Closed stage, the header's count. */
  open: number;
  /** Open prospects nobody has contacted for the chapter's stale days. */
  needsFollowUp: number;
  /** Follow-ups due today or earlier, whoever they are for. */
  followUpsDue: number;
  /** Open prospects the viewer owns. */
  mine: number;
  /** Bids by state, as `ifc-recruitment.md` § Dashboard lists them. */
  bids: RushDashboardBids;
  /** Null without `rush:view_results`. */
  results: RushDashboardResults | null;
}

export interface RushDashboardBids {
  /** Every bid extended that is still on record: out, answered or expired. */
  extended: number;
  /** Open, waiting for an answer (recorded acceptances included). */
  out: number;
  /** Recorded acceptances waiting to be confirmed. */
  waiting: number;
  accepted: number;
  declined: number;
  expired: number;
}

export interface RushFunnelRow {
  id: string;
  label: string;
  category: RushStageCategory;
  count: number;
}

export interface RushDashboardResults {
  /** Open prospects with at least one rating, highest average first. */
  topRated: RushRankedProspect[];
  /** Open prospects with at least one vote, most votes first. */
  mostVotes: RushRankedProspect[];
}

export interface RushRankedProspect {
  id: string;
  display_name: string;
  /** The average (1 to 5) or the vote count. */
  value: number;
  /** How many rated; equal to `value` for votes. */
  count: number;
}

/** How many prospects each ranked list shows. */
const RUSH_DASHBOARD_TOP = 5;

export function rushDashboard(
  stages: readonly RushStageView[],
  candidates: readonly RushPipelineCandidate[],
  options: {
    viewerId: string | null;
    staleDays: number;
    today: string;
    /** `rush:view_results`: whether to show the results at all. */
    viewResults: boolean;
  },
): RushDashboard {
  const columns = rushBoardColumns(stages, candidates);
  const byColumn = rushCandidatesByColumn(columns, candidates);
  const closedKeys = new Set(
    stages.filter((stage) => stage.category === "closed").map((s) => s.key),
  );
  // An accepted prospect folds into Closed on the board, so isn't open.
  const isOpen = (c: RushPipelineCandidate) =>
    !closedKeys.has(c.stage) &&
    c.closed_reason == null &&
    c.bid_state !== "accepted";
  const inState = (state: RushPipelineCandidate["bid_state"]) =>
    candidates.filter((c) => c.bid_state === state).length;
  const open = candidates.filter(isOpen);

  const funnel = columns.map((column) => ({
    id: column.id,
    label: column.label,
    category: column.category,
    count: byColumn.get(column.id)?.length ?? 0,
  }));

  const hasResults =
    options.viewResults &&
    candidates.some(
      (c) => c.rating_average !== undefined || c.vote_count !== undefined,
    );

  return {
    funnel,
    open: open.length,
    needsFollowUp: open.filter((c) =>
      isRushCandidateStale(c, options.staleDays, options.today),
    ).length,
    followUpsDue: open.filter((c) => isRushFollowUpDue(c, options.today))
      .length,
    mine:
      options.viewerId === null
        ? 0
        : open.filter((c) => c.owner_id === options.viewerId).length,
    bids: {
      extended: candidates.filter((c) => c.bid_state !== "none").length,
      out: inState("extended"),
      waiting: candidates.filter(
        (c) =>
          c.bid_state === "extended" && c.bid_acceptance_recorded_at !== null,
      ).length,
      accepted: inState("accepted"),
      declined: inState("declined"),
      expired: inState("expired"),
    },
    results: hasResults
      ? {
          topRated: rank(
            open,
            (c) => c.rating_average ?? null,
            (c) => c.rating_count ?? 0,
          ),
          mostVotes: rank(
            open,
            (c) => (c.vote_count ? c.vote_count : null),
            (c) => c.vote_count ?? 0,
          ),
        }
      : null,
  };
}

function rank(
  candidates: readonly RushPipelineCandidate[],
  valueOf: (c: RushPipelineCandidate) => number | null,
  countOf: (c: RushPipelineCandidate) => number,
): RushRankedProspect[] {
  return candidates
    .flatMap((c) => {
      const value = valueOf(c);
      return value === null
        ? []
        : [
            {
              id: c.id,
              display_name: c.display_name,
              value,
              count: countOf(c),
            },
          ];
    })
    .sort(
      (a, b) =>
        b.value - a.value ||
        b.count - a.count ||
        a.display_name.localeCompare(b.display_name),
    )
    .slice(0, RUSH_DASHBOARD_TOP);
}

/** One number on the dashboard's top row. */
export interface RushDashboardStat {
  key: "open" | "needsFollowUp" | "followUpsDue" | "mine" | "bidsOut";
  label: string;
  value: number;
}

/**
 * The top row's numbers, in the order and words both apps show. "Yours" only
 * for a viewer who can own prospects (`rush:add`), who otherwise owns none.
 */
export function rushDashboardStats(
  dashboard: RushDashboard,
  options: { canOwn: boolean },
): RushDashboardStat[] {
  const stats: RushDashboardStat[] = [
    { key: "open", label: "Open prospects", value: dashboard.open },
    {
      key: "needsFollowUp",
      label: "Need follow-up",
      value: dashboard.needsFollowUp,
    },
    {
      key: "followUpsDue",
      label: "Follow-ups due",
      value: dashboard.followUpsDue,
    },
    { key: "bidsOut", label: "Bids out", value: dashboard.bids.out },
  ];
  if (options.canOwn) {
    stats.splice(1, 0, { key: "mine", label: "Yours", value: dashboard.mine });
  }
  return stats;
}

/**
 * The Bids section's rows, in order: extended, then where they stand. Rows at
 * zero stay, so a chair reads "Accepted 0" rather than wondering.
 */
export function rushDashboardBidRows(
  bids: RushDashboardBids,
): { key: keyof RushDashboardBids; label: string; value: number }[] {
  return [
    { key: "extended", label: "Extended", value: bids.extended },
    { key: "out", label: "Out", value: bids.out },
    { key: "waiting", label: "Waiting to confirm", value: bids.waiting },
    { key: "accepted", label: "Accepted", value: bids.accepted },
    { key: "declined", label: "Declined", value: bids.declined },
    { key: "expired", label: "Expired", value: bids.expired },
  ];
}

/** The dashboard's section titles, shared by both apps. */
export const RUSH_DASHBOARD_TITLES = {
  funnel: "By stage",
  bids: "Bids",
  topRated: "Top rated",
  mostVotes: "Most votes",
} as const;

/** "4.5 from 2 ratings", "3 votes": a ranked row's fact. */
export function rushRankedFact(
  row: RushRankedProspect,
  kind: "rating" | "votes",
): string {
  if (kind === "votes") {
    return `${row.value} ${row.value === 1 ? "vote" : "votes"}`;
  }
  return `${formatRushRatingAverage(row.value)} from ${row.count} ${
    row.count === 1 ? "rating" : "ratings"
  }`;
}
