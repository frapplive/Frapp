"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  rushMovableStages,
  rushRatingSummary,
  rushStageLabel,
  type RushPipelineAccess,
  type RushPipelineCandidate,
  type RushStage,
  type RushTag,
} from "@repo/hooks";
import { formatDay } from "@repo/formatting";
import { sortRushStages } from "@repo/validation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RowMenu, type RowMenuEntry } from "@/components/shared/row-menu";
import { FOCUS_RING } from "@/components/ui/focus";
import { cn } from "@/lib/utils";
import { rushMoveEntries } from "./rush-board";
import { RushBidBadge, RushTagChips } from "./rush-facts";

type SortKey = "name" | "stage" | "rating" | "added_by" | "added";
type Sort = { key: SortKey; dir: "asc" | "desc" };

/**
 * The list (#5924): the board's prospects as one table, the way Linear's
 * List shows the same issues as its Board. Each column header sorts; the
 * newest first until one is picked. A row opens the prospect's panel, and
 * its menu (⋯, right-click) has the same Move to as a card. The rating
 * column shows only to a role that sees results.
 */
export function RushList({
  stages,
  tags,
  candidates,
  access,
  writable,
  selectedId,
  onOpen,
  onMove,
}: {
  stages: readonly RushStage[];
  tags: readonly RushTag[];
  candidates: readonly RushPipelineCandidate[];
  access: RushPipelineAccess;
  writable: boolean;
  selectedId: string | null;
  onOpen: (candidate: RushPipelineCandidate) => void;
  onMove: (
    candidate: RushPipelineCandidate,
    stages: readonly RushStage[],
  ) => void;
}) {
  const [sort, setSort] = useState<Sort>({ key: "added", dir: "desc" });
  const movable = rushMovableStages(stages);
  const canMove = access.move && writable;
  const showRating = access.viewResults;

  const rows = useMemo(() => {
    const order = new Map(
      sortRushStages(stages).map((stage, index) => [stage.key, index]),
    );
    const compare = (a: RushPipelineCandidate, b: RushPipelineCandidate) => {
      switch (sort.key) {
        case "name":
          return a.display_name.localeCompare(b.display_name);
        case "stage":
          return (order.get(a.stage) ?? 0) - (order.get(b.stage) ?? 0);
        case "rating":
          return (a.rating_average ?? 0) - (b.rating_average ?? 0);
        case "added_by":
          return a.created_by_name.localeCompare(b.created_by_name);
        case "added":
          return a.created_at.localeCompare(b.created_at);
      }
    };
    const sorted = [...candidates].sort(compare);
    return sort.dir === "desc" ? sorted.reverse() : sorted;
  }, [candidates, stages, sort]);

  const header = (key: SortKey, label: string) => (
    <SortHeader
      label={label}
      sort={sort.key === key ? sort.dir : null}
      onSort={() =>
        setSort((current) =>
          current.key === key
            ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
            : {
                key,
                dir: key === "added" || key === "rating" ? "desc" : "asc",
              },
        )
      }
    />
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {header("name", "Name")}
          {header("stage", "Stage")}
          <TableHead>Tags</TableHead>
          {showRating ? header("rating", "Rating") : null}
          {header("added_by", "Added by")}
          {header("added", "Added")}
          <TableHead className="w-10">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((candidate) => {
          const entries: RowMenuEntry[] = [
            {
              type: "item",
              key: "open",
              label: "Open",
              onSelect: () => onOpen(candidate),
            },
            ...(canMove
              ? rushMoveEntries(candidate, movable, (to) =>
                  onMove(candidate, to),
                )
              : []),
          ];
          const selected = candidate.id === selectedId;
          return (
            <RowMenu
              key={candidate.id}
              entries={entries}
              label={`More for ${candidate.display_name}`}
            >
              {(menuButton) => (
                <TableRow
                  className="group"
                  data-state={selected ? "selected" : undefined}
                >
                  <TableCell className="max-w-56">
                    <button
                      type="button"
                      onClick={() => onOpen(candidate)}
                      aria-current={selected ? "true" : undefined}
                      className={cn(
                        "block max-w-full truncate rounded-sm text-left text-sm font-semibold text-foreground hover:underline",
                        FOCUS_RING,
                      )}
                    >
                      {candidate.display_name}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {rushStageLabel(stages, candidate)}
                      <RushBidBadge candidate={candidate} />
                    </span>
                  </TableCell>
                  <TableCell>
                    <RushTagChips
                      tagIds={candidate.tag_ids}
                      tags={tags}
                      max={2}
                    />
                  </TableCell>
                  {showRating ? (
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {rushRatingSummary(candidate)}
                    </TableCell>
                  ) : null}
                  <TableCell className="max-w-40 truncate text-sm text-muted-foreground">
                    {candidate.created_by_name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDay(candidate.created_at)}
                  </TableCell>
                  <TableCell className="w-10">{menuButton}</TableCell>
                </TableRow>
              )}
            </RowMenu>
          );
        })}
      </TableBody>
    </Table>
  );
}

function SortHeader({
  label,
  sort,
  onSort,
}: {
  label: string;
  sort: "asc" | "desc" | null;
  onSort: () => void;
}) {
  const Arrow = sort === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={
        sort === "asc" ? "ascending" : sort === "desc" ? "descending" : "none"
      }
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm hover:text-foreground",
          FOCUS_RING,
        )}
      >
        {label}
        {sort ? <Arrow className="h-3 w-3" aria-hidden="true" /> : null}
      </button>
    </TableHead>
  );
}
