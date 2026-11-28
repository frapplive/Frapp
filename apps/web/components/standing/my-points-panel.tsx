"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import {
  useActivityStanding,
  useMyPoints,
  usePermissionList,
  useSemesters,
  type SemesterArchive,
} from "@repo/hooks";
import {
  can,
  isLivePointsPeriod,
  POINT_CATEGORIES,
  pointCategoryLabel,
  pointRowText,
  pointsPeriodOptions,
  signedPoints,
} from "@repo/validation";
import { formatDay, formatTimestampFull } from "@repo/formatting";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExportMenu } from "@/components/shared/export-menu";
import {
  ActiveFilterChips,
  FilterMenu,
  type FilterMenuFilter,
} from "@/components/shared/filter-menu";
import { InlineNote, InlineNoteAction } from "@/components/shared/inline-note";
import { NestedError } from "@/components/shared/nested-states";
import { SkeletonRows } from "@/components/shared/page-skeletons";
import {
  dashboardToolbarSearchClassName,
  dashboardToolbarSearchGlyphClassName,
  denseListClassName,
} from "@/components/shared/table-controls";
import { FOCUS_RING } from "@/components/ui/focus";
import { amountToneClassName } from "@/components/points/amount-tone";
import { SearchGlyph } from "@/components/points/points-glyphs";
import { stateMicrocopy } from "@/lib/state-microcopy";
import { asArray, cn } from "@/lib/utils";
import { POINTS_STANDINGS_HREF } from "./standing-doors";
import { StandingPanelFrame, StandingStat } from "./standing-panel-frame";

type PointTransactionRow = {
  id: string;
  amount: number;
  category: string;
  description: string;
  created_at: string;
};

/** A list this long gets a search field (rulebook § 3, real scale). */
const SEARCH_FROM = 15;

/**
 * Your points, opened from the Points figure on your own Profile (#5950): the
 * balance for the period, where you rank this semester, and every transaction
 * behind the number, newest first. It is the member half of the Points page
 * that was a sidebar row: its search, its amount and category filters and its
 * export are all here, and the period that was a row of buttons is a filter.
 *
 * The chapter's side of that page lives elsewhere: standings in Directory,
 * the chapter ledger and Adjust points in Chapter settings
 * (`spec/behavior/points.md` § Where points are read).
 */
export function MyPointsPanel({ onClose }: { onClose: () => void }) {
  const [period, setPeriod] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [amount, setAmount] = useState("all");

  const live = isLivePointsPeriod(period);
  const summaryQuery = useMyPoints(
    live ? period : "all",
    live ? undefined : period,
  );
  const semestersQuery = useSemesters();
  const archives = useMemo(
    () => asArray<SemesterArchive>(semestersQuery.data),
    [semestersQuery.data],
  );
  // This semester's rank, the number the Profile's gauge shows; the link
  // beside it is the standings it is a place in.
  const standing = useActivityStanding();
  const canSeeDirectory = can("members:view", usePermissionList());
  const place = standing.data?.points ?? null;

  const summary = summaryQuery.data as
    { balance?: number; transactions?: PointTransactionRow[] } | undefined;
  const transactions = useMemo(
    () => (Array.isArray(summary?.transactions) ? summary.transactions : []),
    [summary],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter((transaction) => {
      if (amount === "earned" && transaction.amount < 0) return false;
      if (amount === "taken" && transaction.amount >= 0) return false;
      if (
        category !== "all" &&
        transaction.category.toUpperCase() !== category
      ) {
        return false;
      }
      // The label, not the token: the search matches what the row shows.
      const label = pointCategoryLabel(transaction.category) ?? "";
      return (
        !query ||
        transaction.description.toLowerCase().includes(query) ||
        label.toLowerCase().includes(query)
      );
    });
  }, [transactions, search, category, amount]);

  const periodOptions = pointsPeriodOptions(archives);
  const filters: FilterMenuFilter[] = [
    {
      key: "period",
      label: "Period",
      options: periodOptions,
      value: period,
      anyValue: "all",
      onChange: setPeriod,
    },
    {
      key: "category",
      label: "Category",
      options: [
        { value: "all", label: "Any category" },
        ...POINT_CATEGORIES.map((value) => ({
          value,
          label: pointCategoryLabel(value) ?? value,
        })),
      ],
      value: category,
      anyValue: "all",
      onChange: setCategory,
    },
    {
      key: "amount",
      label: "Amount",
      options: [
        { value: "all", label: "Earned and taken away" },
        { value: "earned", label: "Earned" },
        { value: "taken", label: "Taken away" },
      ],
      value: amount,
      anyValue: "all",
      onChange: setAmount,
    },
  ];

  const periodLabel =
    periodOptions.find((option) => option.value === period)?.label ??
    "All time";
  const balance = typeof summary?.balance === "number" ? summary.balance : null;
  const failed = summaryQuery.isError && summaryQuery.data === undefined;
  const loading = summaryQuery.isPending;
  const searching =
    search.trim() !== "" || category !== "all" || amount !== "all";
  const showSearch = transactions.length >= SEARCH_FROM || search !== "";

  // A render function, not a component: a component declared here would be
  // a new type each render, remounting the field and dropping its focus.
  function searchField(id: string, className: string) {
    return (
      <div className={cn("relative", className)}>
        <Label htmlFor={id} className="sr-only">
          Search your points
        </Label>
        <SearchGlyph className={dashboardToolbarSearchGlyphClassName} />
        <Input
          id={id}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search"
          className={dashboardToolbarSearchClassName}
        />
      </div>
    );
  }

  function exportRowsNow() {
    return filtered.map((transaction) => ({
      Amount: String(transaction.amount),
      Category:
        pointCategoryLabel(transaction.category) ?? transaction.category,
      Description: transaction.description,
      // ISO, not a display shape: a spreadsheet sorts and parses this column,
      // and a locale string with no year or zone would lose both.
      Time: transaction.created_at,
    }));
  }

  return (
    <StandingPanelFrame
      title="Points"
      onClose={onClose}
      actions={
        <div className="flex items-center gap-2">
          {showSearch
            ? searchField("my-points-search", "hidden w-44 sm:block")
            : null}
          <FilterMenu filters={filters} thing="your points" />
          {transactions.length > 0 ? (
            <ExportMenu
              label="Export"
              filenamePrefix="my-points"
              getRows={exportRowsNow}
              size="toolbar"
            />
          ) : null}
        </div>
      }
    >
      {/* Below `sm` the header has no room for it, so it leads the list. */}
      {showSearch ? searchField("my-points-search-narrow", "sm:hidden") : null}
      <ActiveFilterChips filters={filters} />
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-4">
        <StandingStat
          label={periodLabel}
          value={balance === null ? "–" : balance.toLocaleString()}
          detail={balance === null ? null : balance === 1 ? "point" : "points"}
        />
        {/* A place only once there is something to place: "#24 of 24" for a
            new member at zero says nothing they can act on. */}
        {place && place.rank !== null && place.total > 0 ? (
          <StandingStat
            label="This semester"
            value={`#${place.rank}`}
            detail={
              <>
                of {place.ranked}
                {canSeeDirectory ? (
                  <>
                    {" · "}
                    <Link
                      href={POINTS_STANDINGS_HREF}
                      className={cn(
                        "rounded-sm text-foreground underline underline-offset-2",
                        FOCUS_RING,
                      )}
                    >
                      Standings
                    </Link>
                  </>
                ) : null}
              </>
            }
          />
        ) : null}
      </dl>

      <section aria-label="Your point history" className="space-y-2">
        {loading ? (
          <div role="status" aria-label="Loading your points">
            <SkeletonRows rows={5} lines={2} trailing={["w-10"]} />
          </div>
        ) : failed ? (
          <NestedError
            title="Couldn't load your points"
            description={describeLoadFailure(summaryQuery.error)}
            onRetry={() => void summaryQuery.refetch()}
          />
        ) : filtered.length === 0 ? (
          transactions.length > 0 && searching ? (
            <InlineNote>
              {stateMicrocopy.points.noTransactionMatches}{" "}
              <InlineNoteAction
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                  setAmount("all");
                }}
              >
                Clear filters
              </InlineNoteAction>
            </InlineNote>
          ) : (
            <InlineNote>{stateMicrocopy.points.emptyTransactions}</InlineNote>
          )
        ) : (
          // `role="list"` restated: a flex `<li>` loses its `list-item` box,
          // and WebKit then stops exposing the list and its item count.
          <ul role="list" className={denseListClassName}>
            {filtered.map((transaction) => {
              const day = formatDay(transaction.created_at);
              // The phone's Points screen titles a row the same way.
              const { title, metaCategory } = pointRowText(transaction);
              return (
                <li
                  key={transaction.id}
                  className="flex min-h-11 items-center gap-3 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{title}</p>
                    {metaCategory || day ? (
                      <p className="truncate text-caption text-muted-foreground">
                        {metaCategory}
                        {metaCategory && day ? " · " : null}
                        {day ? (
                          <time
                            dateTime={transaction.created_at}
                            title={
                              formatTimestampFull(transaction.created_at) ??
                              undefined
                            }
                          >
                            {day}
                          </time>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      amountToneClassName(transaction.amount, "sm"),
                      "shrink-0 text-right",
                    )}
                  >
                    {signedPoints(transaction.amount)}
                    <span className="sr-only"> points</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </StandingPanelFrame>
  );
}
