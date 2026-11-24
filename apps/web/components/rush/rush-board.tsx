"use client";

import { useRef, useState, type DragEvent } from "react";
import {
  rushBoardColumns,
  rushCandidatesByColumn,
  rushMovableStages,
  rushRatingSummary,
  rushStageLabel,
  type RushPipelineAccess,
  type RushPipelineCandidate,
  type RushStage,
  type RushTag,
  rushAddedByLine,
} from "@repo/hooks";
import { RowMenu, type RowMenuEntry } from "@/components/shared/row-menu";
import { SectionLabel } from "@/components/shared/section-label";
import { FOCUS_RING } from "@/components/ui/focus";
import { cn } from "@/lib/utils";
import { RUSH_BOARD_CLASS, RUSH_COLUMN_CLASS } from "./rush-board-layout";
import { RushBidBadge, RushTagChips } from "./rush-facts";

export interface RushBoardProps {
  stages: readonly RushStage[];
  tags: readonly RushTag[];
  candidates: readonly RushPipelineCandidate[];
  access: RushPipelineAccess;
  /** Writes are allowed now (the subscription gate, offline). */
  writable: boolean;
  selectedId: string | null;
  onOpen: (candidate: RushPipelineCandidate) => void;
  /** Move into one of `stages` (`useRushMove().request`). */
  onMove: (
    candidate: RushPipelineCandidate,
    stages: readonly RushStage[],
  ) => void;
}

/**
 * The board (#5924): a column per visible working stage, then one folded
 * Closed column, from `rushBoardColumns`. A card drags to another column to
 * move its stage, as a Pipedrive or HubSpot deal does; the column it would
 * land in lights while it is held over it. Dragging is a pointer's way in
 * only, so every card also carries Move to in its menu (the ⋯, right-click,
 * long-press), which is how a keyboard or a screen reader moves a prospect.
 * Bid status is not a stage, so nothing here changes it.
 */
export function RushBoard({
  stages,
  tags,
  candidates,
  access,
  writable,
  selectedId,
  onOpen,
  onMove,
}: RushBoardProps) {
  const columns = rushBoardColumns(stages, candidates);
  const byColumn = rushCandidatesByColumn(columns, candidates);
  const movable = rushMovableStages(stages);
  const canMove = access.move && writable;
  // Held in a ref as well as state: a drop reads it in the same tick.
  const held = useRef<RushPipelineCandidate | null>(null);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  const columnOf = (candidate: RushPipelineCandidate) =>
    columns.find((column) =>
      column.stages.some((stage) => stage.key === candidate.stage),
    )?.id;

  /** Where a drop on `columnId` may land: the visible stages it holds. */
  const landingsOf = (columnId: string) =>
    (columns.find((column) => column.id === columnId)?.stages ?? []).filter(
      (stage) => !stage.hidden,
    );

  function endDrag() {
    held.current = null;
    setHeldId(null);
    setOverColumn(null);
  }

  return (
    <div className={RUSH_BOARD_CLASS}>
      {columns.map((column) => {
        const cards = byColumn.get(column.id) ?? [];
        const labelId = `rush-column-${column.id}`;
        const accepts = (candidate: RushPipelineCandidate | null) =>
          !!candidate &&
          columnOf(candidate) !== column.id &&
          landingsOf(column.id).length > 0;
        return (
          <section
            key={column.id}
            aria-labelledby={labelId}
            data-rush-column={column.id}
            className={cn(
              RUSH_COLUMN_CLASS,
              "transition-colors",
              // Where the held card would land.
              overColumn === column.id && "border-input bg-card",
            )}
            onDragOver={(event: DragEvent) => {
              if (!canMove || !accepts(held.current)) return;
              event.preventDefault();
              if (overColumn !== column.id) setOverColumn(column.id);
            }}
            onDragLeave={(event: DragEvent) => {
              const next = event.relatedTarget;
              if (next instanceof Node && event.currentTarget.contains(next)) {
                return;
              }
              setOverColumn((current) =>
                current === column.id ? null : current,
              );
            }}
            onDrop={(event: DragEvent) => {
              const candidate = held.current;
              endDrag();
              if (!canMove || !candidate || !accepts(candidate)) return;
              event.preventDefault();
              onMove(candidate, landingsOf(column.id));
            }}
          >
            <div className="px-2 pt-1">
              <SectionLabel id={labelId} count={cards.length}>
                {column.label}
              </SectionLabel>
            </div>
            <ul className="flex min-h-16 flex-col gap-2">
              {cards.map((candidate) => (
                <RushCard
                  key={candidate.id}
                  candidate={candidate}
                  stages={stages}
                  tags={tags}
                  closed={column.category === "closed"}
                  movable={movable}
                  canMove={canMove}
                  selected={candidate.id === selectedId}
                  held={candidate.id === heldId}
                  onOpen={() => onOpen(candidate)}
                  onMove={(to) => onMove(candidate, to)}
                  onDragStart={(event) => {
                    held.current = candidate;
                    setHeldId(candidate.id);
                    event.dataTransfer?.setData("text/plain", candidate.id);
                    if (event.dataTransfer) {
                      event.dataTransfer.effectAllowed = "move";
                    }
                  }}
                  onDragEnd={endDrag}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The Move to entries for a prospect: every visible stage but their own, in
 * board order. A Closed stage asks for a reason when picked
 * (`useRushMove`).
 */
export function rushMoveEntries(
  candidate: RushPipelineCandidate,
  movable: readonly RushStage[],
  onMove: (to: readonly RushStage[]) => void,
): RowMenuEntry[] {
  const targets = movable.filter((stage) => stage.key !== candidate.stage);
  if (targets.length === 0) return [];
  return [
    { type: "label", key: "move-label", label: "Move to" },
    ...targets.map((stage): RowMenuEntry => ({
      type: "item",
      key: `move-${stage.key}`,
      label: stage.label,
      onSelect: () => onMove([stage]),
    })),
  ];
}

function RushCard({
  candidate,
  stages,
  tags,
  closed,
  movable,
  canMove,
  selected,
  held,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  candidate: RushPipelineCandidate;
  stages: readonly RushStage[];
  tags: readonly RushTag[];
  closed: boolean;
  movable: readonly RushStage[];
  canMove: boolean;
  selected: boolean;
  held: boolean;
  onOpen: () => void;
  onMove: (to: readonly RushStage[]) => void;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
}) {
  const rating = rushRatingSummary(candidate);
  const entries: RowMenuEntry[] = [
    { type: "item", key: "open", label: "Open", onSelect: onOpen },
    ...(canMove ? rushMoveEntries(candidate, movable, onMove) : []),
  ];
  return (
    <RowMenu entries={entries} label={`More for ${candidate.display_name}`}>
      {(menuButton) => (
        <li
          draggable={canMove}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          data-rush-card={candidate.id}
          className={cn(
            "group relative rounded-[14px] border border-border bg-background transition-[opacity,box-shadow]",
            canMove && "cursor-grab active:cursor-grabbing",
            selected && "border-input bg-card",
            held && "opacity-60 shadow-lg ring-1 ring-border",
          )}
        >
          <button
            type="button"
            onClick={onOpen}
            aria-current={selected ? "true" : undefined}
            className={cn(
              "flex w-full flex-col items-start gap-1 rounded-[14px] p-3 pr-10 text-left hover:bg-card-hover",
              FOCUS_RING,
            )}
          >
            <span className="w-full truncate text-sm font-semibold text-foreground">
              {candidate.display_name}
            </span>
            <span className="w-full truncate text-caption text-muted-foreground">
              {rushAddedByLine(candidate)}
            </span>
            {closed ? (
              // Which Closed stage, and why, since the column folds them.
              <span className="w-full truncate text-caption text-muted-foreground">
                {rushStageLabel(stages, candidate)}
              </span>
            ) : null}
            {rating ? (
              <span className="text-caption text-muted-foreground">
                {rating}
              </span>
            ) : null}
            <RushTagChips
              tagIds={candidate.tag_ids}
              tags={tags}
              max={2}
              className="pt-1"
            />
            <RushBidBadge candidate={candidate} />
          </button>
          <div className="absolute right-1.5 top-1.5">{menuButton}</div>
        </li>
      )}
    </RowMenu>
  );
}
