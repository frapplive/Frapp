"use client";

import { describeLoadFailure } from "@repo/hooks/error-copy";
import { useMemo, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { AdjustGlyph, FlaggedGlyph } from "@/components/points/points-glyphs";
import {
  memberFallbackLabel,
  ORG_POINTS_DEFAULTS,
  useMemberDisplayNames,
  useOrgConfig,
  usePermissionList,
  usePointsTransactions,
} from "@repo/hooks";
import { formatDayTime, formatTimestampFull } from "@repo/formatting";
import { can } from "@repo/validation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { amountToneClassName } from "@/components/points/amount-tone";
import {
  ADJUST_POINTS_LABEL,
  POINT_CATEGORIES,
  pointCategoryLabel,
  type PointCategory,
} from "@repo/validation";
import { PointsAdjustmentDialog } from "@/components/points/points-adjustment-dialog";
import { ExportMenu } from "@/components/shared/export-menu";
import {
  ActiveFilterChips,
  FilterMenu,
  type FilterMenuFilter,
} from "@/components/shared/filter-menu";
import { NestedError, NestedLoading } from "@/components/shared/nested-states";
import { SectionLabel } from "@/components/shared/section-label";
import {
  SubscriptionNotice,
  useGatedDialog,
  useSubscriptionGate,
} from "@/components/shared/subscription-gate";
import {
  dashboardToolbarHeightClassName,
  denseListClassName,
} from "@/components/shared/table-controls";
import { asArray, cn } from "@/lib/utils";
import { InlineNote, InlineNoteAction } from "@/components/shared/inline-note";

type Category = PointCategory;

/** The square refresh control at the toolbar height: 36, or 44 to a finger. */
const TOOLBAR_ICON = `${dashboardToolbarHeightClassName} w-9 pointer-coarse:w-11`;

type TransactionRow = {
  id?: string;
  user_id?: string;
  amount?: number;
  category?: Category;
  description?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

type AuditPaging = {
  before: string | undefined;
  history: Array<string | undefined>;
};

export const AUDIT_PAGE_SIZE = 100;

/**
 * Cursor for the next (older) page: the oldest `created_at` on a full page,
 * returned **verbatim**. The API compares with `created_at < before`, and
 * Postgres `timestamptz` is microsecond; running this through `Date` drops
 * the last three digits and can skip a same-millisecond sibling (#1832 / #1480).
 *
 * A short page, or a full page whose oldest row has no `created_at`, means
 * there is nothing further to request.
 */
export function olderAuditCursor(
  rows: readonly Pick<TransactionRow, "created_at">[],
  pageSize: number = AUDIT_PAGE_SIZE,
): string | undefined {
  if (rows.length < pageSize) return undefined;
  const oldest = rows[rows.length - 1]?.created_at;
  return typeof oldest === "string" && oldest.length > 0 ? oldest : undefined;
}

const INITIAL_PAGING: AuditPaging = { before: undefined, history: [] };

/**
 * The chapter's points ledger, on Chapter settings' Points page (#5950; the
 * Audit section at the foot of the Points page until then): every transaction
 * in the chapter, newest first, a page at a time, with the two limits the
 * chapter enforces stated over it.
 *
 * Filter by category, by member, or to the flagged ones; export what is
 * shown; and, for a role that may, adjust a member's points from here, where
 * the new row lands. It is drawn only for a `points:view_all` holder (the
 * `points-ledger` tool in `settings-access.ts`), so a treasurer reaches it
 * without the chapter's config.
 *
 * `initialMember` opens it on one member's transactions: the Ledger link on
 * the Points row of a member's card.
 */
export function PointsLedger({
  initialMember,
}: {
  initialMember?: string | null;
}) {
  const [show, setShow] = useState<"ALL" | "FLAGGED">("ALL");
  const flaggedOnly = show === "FLAGGED";
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | Category>("ALL");
  const [userFilter, setUserFilter] = useState<string>(initialMember || "ALL");
  const [paging, setPaging] = useState<AuditPaging>(INITIAL_PAGING);

  // The display roster, not `useMembers`: this list needs a name per row and
  // a name per filter option, and `GET /v1/members` would put every member's
  // email, bio, graduation year, city and company on the wire for a role that
  // only reads the ledger (#1000, #986).
  //
  // `nameFor` also replaces a local map with a hand-written `??` default:
  // `display_name` is `NOT NULL DEFAULT ''`, and `??` passes the empty string
  // straight through, so a member who never set a name rendered a blank label.
  const { byId, nameFor } = useMemberDisplayNames();
  // One subscription, not two: `useMemberDisplayNames` already reads the roster,
  // and its map's keys are the same member ids the filter needs.
  const memberIds = useMemo(() => Object.keys(byId), [byId]);

  // #394 — the two anti-fraud limits are chapter-configurable, so the
  // section's state line states what the chapter actually enforces rather than the
  // "±100 points" it used to hardcode. Falls back to the documented defaults
  // while the config query is in flight, or if it fails: those are exactly
  // what an unconfigured chapter enforces, so the fallback is never a guess.
  //
  // Merged field-by-field rather than `?? DEFAULTS`: `applyOptimistic` can
  // write a partial `points` into the cache after a single-dial PATCH, and an
  // object-level fallback would then render a blank where a number belongs.
  //
  // `isSuccess` gates the line because this section renders for roles that
  // cannot read the config at all — the seeded Treasurer holds points:view_all
  // but not chapter-config:view, so GET /config 403s and `data` is undefined.
  // Stating the defaults as this chapter's policy would be a guess, and a
  // confident wrong number about a fraud limit is worse than no number.
  const orgConfig = useOrgConfig();
  const pointsPolicy = { ...ORG_POINTS_DEFAULTS, ...orgConfig.data?.points };
  const policyKnown = orgConfig.isSuccess;

  // `POST /v1/points/adjust` is paid-ops. The dialog gates its own fields, but
  // `open` is owned here, so refusing to open onto a doomed form has to be
  // enforced at this trigger (#841).
  const canAdjust = can("points:adjust", usePermissionList());
  const adjustGate = useSubscriptionGate();
  const adjustDialog = useGatedDialog(adjustGate);

  const transactionsQuery = usePointsTransactions({
    userId: userFilter === "ALL" ? undefined : userFilter,
    category: categoryFilter === "ALL" ? undefined : categoryFilter,
    flagged: flaggedOnly ? true : undefined,
    before: paging.before,
    limit: AUDIT_PAGE_SIZE,
  });

  const rows = asArray<TransactionRow>(transactionsQuery.data);
  const olderCursor = olderAuditCursor(rows);
  const canGoNewer = paging.history.length > 0;
  const canGoOlder = olderCursor !== undefined;

  function resetPaging() {
    setPaging(INITIAL_PAGING);
  }

  function goOlder(createdAt: string) {
    setPaging((current) => ({
      before: createdAt,
      history: [...current.history, current.before],
    }));
  }

  function goNewer() {
    setPaging((current) => {
      if (current.history.length === 0) return current;
      return {
        before: current.history[current.history.length - 1],
        history: current.history.slice(0, -1),
      };
    });
  }

  // The full id, not `memberFallbackLabel`, for a member the roster no longer
  // holds: this is the audit record, where a uuid is the operator's handle
  // for a support ticket or a direct lookup.
  const memberNameOf = (row: TransactionRow) =>
    row.user_id
      ? (nameFor(String(row.user_id)) ?? String(row.user_id))
      : "Unknown member";

  const filters: FilterMenuFilter[] = [
    {
      key: "category",
      label: "Category",
      options: [
        { value: "ALL", label: "Any category" },
        ...POINT_CATEGORIES.map((category) => ({
          value: category,
          label: pointCategoryLabel(category) ?? category,
        })),
      ],
      value: categoryFilter,
      anyValue: "ALL",
      onChange: (value) => {
        setCategoryFilter(value as "ALL" | Category);
        resetPaging();
      },
    },
    {
      key: "member",
      label: "Member",
      options: [
        { value: "ALL", label: "Any member" },
        ...memberIds
          .map((userId) => ({
            value: userId,
            label: nameFor(userId) ?? memberFallbackLabel(userId),
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        // A member opened from their card who has since left the roster
        // still names the filter that is on.
        ...(userFilter !== "ALL" && !memberIds.includes(userFilter)
          ? [{ value: userFilter, label: memberFallbackLabel(userFilter) }]
          : []),
      ],
      value: userFilter,
      anyValue: "ALL",
      onChange: (value) => {
        setUserFilter(value);
        resetPaging();
      },
    },
    {
      key: "show",
      label: "Show",
      options: [
        { value: "ALL", label: "Every transaction" },
        { value: "FLAGGED", label: "Flagged only" },
      ],
      value: show,
      anyValue: "ALL",
      onChange: (value) => {
        setShow(value as "ALL" | "FLAGGED");
        resetPaging();
      },
    },
  ];

  function exportShownRows() {
    return rows.map((row) => ({
      Member: memberNameOf(row),
      Amount: String(row.amount ?? 0),
      Category: pointCategoryLabel(row.category) ?? row.category ?? "",
      Reason: row.description ?? "",
      Flagged: row.metadata?.flagged === true ? "Yes" : "",
      // ISO, not a display shape: a spreadsheet sorts and parses this column.
      Time: row.created_at ?? "",
    }));
  }

  return (
    <section
      aria-labelledby="points-ledger-label"
      className="@container space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-0.5">
          <SectionLabel id="points-ledger-label">Ledger</SectionLabel>
          {/*
            State, not policy narration: the two limits this chapter
            enforces right now, then the one fact a moved threshold makes
            visible. A flag is written when the adjustment lands and never
            re-checked (`spec/behavior/points.md` § Anti-Fraud), so after a
            chapter moves the dial the list holds rows the current line
            wouldn't flag. Omitted rather than guessed when the config is
            unreadable (see `policyKnown` above).
          */}
          {policyKnown ? (
            <p className="text-caption text-muted-foreground">
              {`Flags at ±${pointsPolicy.anomaly_threshold} points · ${pointsPolicy.adjustment_rate_limit_per_hour} adjustments per admin per hour`}
              <span className="block">
                Each flag keeps the threshold it was raised under.
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterMenu filters={filters} thing="the ledger" />
          <ExportMenu
            label="Export"
            filenamePrefix="points-ledger"
            getRows={exportShownRows}
            size="toolbar"
            disabled={rows.length === 0}
          />
          <Button
            variant="ghost"
            size="icon"
            className={TOOLBAR_ICON}
            onClick={() => void transactionsQuery.refetch()}
            disabled={transactionsQuery.isFetching}
            aria-label="Refresh the ledger"
          >
            <RefreshCw
              className={
                transactionsQuery.isFetching
                  ? "h-4 w-4 animate-spin"
                  : "h-4 w-4"
              }
            />
          </Button>
          {canAdjust ? (
            <Button
              size="toolbar"
              variant="action"
              className="gap-2"
              {...adjustGate.controlProps()}
              onClick={() => adjustDialog.setOpen(true)}
            >
              <AdjustGlyph className="h-4 w-4" />
              {ADJUST_POINTS_LABEL}
            </Button>
          ) : null}
        </div>
      </div>
      {canAdjust ? (
        <SubscriptionNotice gate={adjustGate} feature="point adjustments" />
      ) : null}
      <ActiveFilterChips filters={filters} />

      {transactionsQuery.isPending ? (
        <NestedLoading message="Loading the ledger..." />
      ) : (
        <>
          {transactionsQuery.isError ? (
            <NestedError
              title="Ledger unavailable"
              description={`Couldn't load chapter transactions. ${describeLoadFailure(transactionsQuery.error)}`}
              onRetry={() => void transactionsQuery.refetch()}
            />
          ) : rows.length === 0 ? (
            canGoNewer ? (
              // An older page past the last full one: the chapter has
              // points, just none further back.
              <InlineNote>No older transactions.</InlineNote>
            ) : flaggedOnly ? (
              <InlineNote>
                {policyKnown
                  ? `Nothing flagged in this window. Single adjustments of |amount| ≥ ${pointsPolicy.anomaly_threshold} land here.`
                  : "Nothing flagged in this window."}
              </InlineNote>
            ) : categoryFilter === "ALL" && userFilter === "ALL" ? (
              <InlineNote>No points have been recorded yet.</InlineNote>
            ) : (
              <InlineNote>
                No transactions match these filters.{" "}
                <InlineNoteAction
                  onClick={() => {
                    setCategoryFilter("ALL");
                    setUserFilter("ALL");
                    resetPaging();
                  }}
                >
                  Clear filters
                </InlineNoteAction>
              </InlineNote>
            )
          ) : (
            // `role="list"` restated: a flex `<li>` loses its `list-item`
            // box, and WebKit then stops exposing the list semantics.
            <ul role="list" className={denseListClassName}>
              {rows.map((row) => {
                const flagged = row.metadata?.flagged === true;
                const name = memberNameOf(row);
                const amount = row.amount ?? 0;
                const sign = amount >= 0 ? "+" : "";
                const categoryLabel = pointCategoryLabel(row.category);
                const when = formatDayTime(row.created_at);
                // One `·`-joined meta line, bounded facts first and the
                // free-text reason last, so truncation eats the reason. An
                // absent fact drops out of the line.
                const meta: Array<{ key: string; node: ReactNode }> = [];
                if (categoryLabel) {
                  meta.push({ key: "category", node: categoryLabel });
                }
                if (when) {
                  meta.push({
                    key: "when",
                    node: (
                      <time
                        dateTime={row.created_at}
                        title={formatTimestampFull(row.created_at) ?? undefined}
                      >
                        {when}
                      </time>
                    ),
                  });
                }
                if (row.description) {
                  meta.push({ key: "reason", node: row.description });
                }
                return (
                  <li
                    key={row.id}
                    className="flex min-h-11 flex-col gap-0.5 py-2 @xl:flex-row @xl:items-center @xl:gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                          {name}
                        </span>
                        {flagged ? (
                          <Badge variant="destructive" className="gap-1">
                            <FlaggedGlyph className="h-3 w-3" />
                            Flagged
                          </Badge>
                        ) : null}
                      </div>
                      {meta.length > 0 ? (
                        <p className="truncate text-caption text-muted-foreground">
                          {meta.map((part, index) => (
                            <span key={part.key}>
                              {index > 0 ? " · " : null}
                              {part.node}
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        amountToneClassName(amount, "sm"),
                        "shrink-0 @xl:text-right",
                      )}
                    >
                      {`${sign}${amount} points`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {canGoNewer || canGoOlder ? (
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="secondary"
                size="toolbar"
                disabled={!canGoNewer || transactionsQuery.isFetching}
                onClick={goNewer}
              >
                Newer transactions
              </Button>
              <Button
                variant="secondary"
                size="toolbar"
                disabled={!canGoOlder || transactionsQuery.isFetching}
                onClick={() => {
                  if (olderCursor !== undefined) goOlder(olderCursor);
                }}
              >
                Older transactions
              </Button>
            </div>
          ) : null}
        </>
      )}
      {canAdjust ? (
        <PointsAdjustmentDialog
          open={adjustDialog.open}
          onOpenChange={adjustDialog.setOpen}
          onCloseAutoFocus={adjustDialog.contentProps.onCloseAutoFocus}
        />
      ) : null}
    </section>
  );
}
