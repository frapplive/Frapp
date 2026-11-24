"use client";

import {
  RUSH_DASHBOARD_TITLES,
  rushDashboardStats,
  rushRankedFact,
  type RushDashboard,
  type RushRankedProspect,
} from "@repo/hooks";
import { SectionLabel } from "@/components/shared/section-label";
import { FOCUS_RING } from "@/components/ui/focus";
import { cn } from "@/lib/utils";

/**
 * The recruitment dashboard (#5973, `spec/behavior/rush.md` § Funnel): the
 * page's Summary layout, beside Board and List, the way Pipedrive's Insights
 * and HubSpot's deal dashboard sit beside their boards. Every number is a
 * count of the board's own cards (`rushDashboard` in `@repo/hooks`), so the
 * two never disagree.
 *
 * Three bordered groups, top to bottom in the order a recruitment chair reads
 * them: the numbers that need doing something (open, yours, follow-ups, bids),
 * the funnel by stage in the chapter's order, then, only with
 * `rush:view_results`, who members rate highest and who has the most votes. A
 * ranked name opens the prospect.
 */
export function RushSummary({
  dashboard,
  canOwn,
  onOpen,
}: {
  dashboard: RushDashboard;
  /** `rush:add`, without which nobody owns prospects and "Yours" is left out. */
  canOwn: boolean;
  onOpen: (candidateId: string) => void;
}) {
  const stats = rushDashboardStats(dashboard, { canOwn });
  const most = Math.max(1, ...dashboard.funnel.map((row) => row.count));

  return (
    <div className="space-y-6">
      {/* Hairlines between the tiles are the border showing through a 1px
          gap, so a row that wraps keeps every edge. */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-border bg-border @[34rem]:grid-cols-3 @[52rem]:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.key} className="bg-card px-4 py-3">
            <dt className="truncate text-caption text-muted-foreground">
              {stat.label}
            </dt>
            <dd className="text-2xl font-semibold tabular-nums text-foreground">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="space-y-2" aria-labelledby="rush-summary-funnel">
        <SectionLabel id="rush-summary-funnel">
          {RUSH_DASHBOARD_TITLES.funnel}
        </SectionLabel>
        <ul className="divide-y divide-border rounded-[14px] border border-border bg-card">
          {dashboard.funnel.map((row) => (
            <li
              key={row.id}
              className="grid min-h-10 grid-cols-[minmax(6rem,12rem)_1fr_3rem] items-center gap-3 px-4 py-2"
            >
              <span className="truncate text-sm text-foreground">
                {row.label}
              </span>
              <span
                aria-hidden="true"
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full rounded-full bg-foreground/40"
                  style={{ width: `${(row.count / most) * 100}%` }}
                />
              </span>
              <span className="text-right text-sm tabular-nums text-foreground">
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {dashboard.results ? (
        <div className="grid gap-6 @[44rem]:grid-cols-2">
          <RankedList
            id="rush-summary-rated"
            title={RUSH_DASHBOARD_TITLES.topRated}
            rows={dashboard.results.topRated}
            kind="rating"
            empty="Nobody has rated an open prospect yet."
            onOpen={onOpen}
          />
          <RankedList
            id="rush-summary-votes"
            title={RUSH_DASHBOARD_TITLES.mostVotes}
            rows={dashboard.results.mostVotes}
            kind="votes"
            empty="Nobody has voted on an open prospect yet."
            onOpen={onOpen}
          />
        </div>
      ) : null}
    </div>
  );
}

function RankedList({
  id,
  title,
  rows,
  kind,
  empty,
  onOpen,
}: {
  id: string;
  title: string;
  rows: readonly RushRankedProspect[];
  kind: "rating" | "votes";
  empty: string;
  onOpen: (candidateId: string) => void;
}) {
  return (
    <section className="space-y-2" aria-labelledby={id}>
      <SectionLabel id={id}>{title}</SectionLabel>
      {rows.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="divide-y divide-border rounded-[14px] border border-border bg-card">
          {rows.map((row) => (
            <li
              key={row.id}
              className="first:[&>button]:rounded-t-[13px] last:[&>button]:rounded-b-[13px]"
            >
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                className={cn(
                  "flex min-h-10 w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent",
                  FOCUS_RING,
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {row.display_name}
                </span>
                <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                  {rushRankedFact(row, kind)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
