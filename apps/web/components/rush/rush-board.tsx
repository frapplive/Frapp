"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
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
  rushOwnerWords,
  rushPlacedByBid,
  rushRowMark,
} from "@repo/hooks";
import { RowMenu, type RowMenuEntry } from "@/components/shared/row-menu";
import { SectionLabel } from "@/components/shared/section-label";
import { FOCUS_RING } from "@/components/ui/focus";
import { cn } from "@/lib/utils";
import {
  RUSH_BOARD_CLASS,
  RUSH_COLUMN_CLASS,
  RUSH_EMPTY_COLUMN_CLASS,
} from "./rush-board-layout";
import { RushBidBadge, RushFollowUpFact, RushTagChips } from "./rush-facts";

export interface RushBoardProps {
  stages: readonly RushStage[];
  tags: readonly RushTag[];
  candidates: readonly RushPipelineCandidate[];
  access: RushPipelineAccess;
  /** Writes are allowed now (the subscription gate, offline). */
  writable: boolean;
  selectedId: string | null;
  /** The chapter's stale days, from the pipeline read. */
  staleDays: number;
  /** `YYYY-MM-DD` on this device (`localIsoDate` in `@repo/formatting`). */
  today: string;
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
 *
 * A card says who owns the prospect and their follow-up (#5934): "Owned by
 * Chris Lee · Follow-up Thursday", and, once it is due or nobody has logged a
 * contact for the chapter's stale days, a warning badge. Closed prospects
 * show neither.
 */
export function RushBoard({
  stages,
  tags,
  candidates,
  access,
  writable,
  selectedId,
  staleDays,
  today,
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

  const [edges, boardRef] = useScrollEdges();

  function endDrag() {
    held.current = null;
    setHeldId(null);
    setOverColumn(null);
  }

  return (
    <div
      ref={boardRef}
      className={cn(
        RUSH_BOARD_CLASS,
        // A column cut by the pane's edge fades out rather than stops dead,
        // so it reads as more board to scroll to, not a broken card.
        edges.start && edges.end && RUSH_FADE_BOTH,
        edges.start && !edges.end && RUSH_FADE_START,
        !edges.start && edges.end && RUSH_FADE_END,
      )}
    >
      {columns.map((column) => {
        const inColumn = byColumn.get(column.id) ?? [];
        // Closed folds in the accepted prospects (#5973), listed first under
        // their own label, as the design's Closed column counts them apart.
        const accepted =
          column.category === "closed"
            ? inColumn.filter((c) => c.bid_state === "accepted")
            : [];
        const cards =
          accepted.length > 0
            ? [
                ...accepted,
                ...inColumn.filter((c) => c.bid_state !== "accepted"),
              ]
            : inColumn;
        const groupAt = (index: number): string | null => {
          if (accepted.length === 0) return null;
          if (index === 0) return `Accepted · ${accepted.length}`;
          if (index === accepted.length && index < cards.length) {
            return `Closed · ${cards.length - accepted.length}`;
          }
          return null;
        };
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
              // An empty stage folds to its label, so the stages holding
              // prospects get the width (`rush-board-layout.ts`).
              cards.length > 0 ? RUSH_COLUMN_CLASS : RUSH_EMPTY_COLUMN_CLASS,
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
              {cards.map((candidate, index) => (
                <RushCardInGroup key={candidate.id} group={groupAt(index)}>
                  <RushCard
                    candidate={candidate}
                    stages={stages}
                    tags={tags}
                    closed={column.category === "closed"}
                    staleDays={staleDays}
                    today={today}
                    movable={movable}
                    canMove={canMove}
                    // Only a bid action moves a card into Bid extended or out
                    // of it, and into Closed as Accepted (#5973); its stage
                    // still changes from Move to and the panel.
                    canDrag={canMove && !rushPlacedByBid(candidate)}
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
                </RushCardInGroup>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const RUSH_FADE_END =
  "[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]";
const RUSH_FADE_START =
  "[mask-image:linear-gradient(to_right,transparent,black_2rem)]";
const RUSH_FADE_BOTH =
  "[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%-2rem),transparent)]";

/**
 * Whether a sideways scroller has more to show before its start and past its
 * end, kept live on scroll and resize. Both false until measured, and in
 * jsdom, whose boxes measure 0.
 */
function useScrollEdges(): [
  { start: boolean; end: boolean },
  (node: HTMLDivElement | null) => (() => void) | undefined,
] {
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = useRef<() => void>(() => {});
  // Cards moving between columns change the row's width without resizing
  // the scroller, so every render measures again too.
  useEffect(() => measure.current());
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return undefined;
    const update = () => {
      const max = node.scrollWidth - node.clientWidth;
      const start = node.scrollLeft > 1;
      const end = max - node.scrollLeft > 1;
      setEdges((current) =>
        current.start === start && current.end === end
          ? current
          : { start, end },
      );
    };
    measure.current = update;
    update();
    node.addEventListener("scroll", update, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node);
    return () => {
      measure.current = () => {};
      node.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);
  return [edges, ref];
}

/** A card, after its group's label when it starts one (Accepted, Closed). */
function RushCardInGroup({
  group,
  children,
}: {
  group: string | null;
  children: ReactNode;
}) {
  if (!group) return <>{children}</>;
  return (
    <>
      <li className="px-2 pt-1 text-caption font-semibold text-muted-foreground">
        {group}
      </li>
      {children}
    </>
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
  staleDays,
  today,
  movable,
  canMove,
  canDrag,
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
  staleDays: number;
  today: string;
  movable: readonly RushStage[];
  canMove: boolean;
  canDrag: boolean;
  selected: boolean;
  held: boolean;
  onOpen: () => void;
  onMove: (to: readonly RushStage[]) => void;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
}) {
  const rating = rushRatingSummary(candidate);
  const work = rushRowMark(candidate, staleDays, today, closed);
  // A follow-up not yet due is a fact on the owner's line; one that is due,
  // and Needs follow-up, are badges at the foot with the bid's.
  const quietFollowUp = work?.tone === "planned";
  const entries: RowMenuEntry[] = [
    { type: "item", key: "open", label: "Open", onSelect: onOpen },
    ...(canMove ? rushMoveEntries(candidate, movable, onMove) : []),
  ];
  return (
    <RowMenu entries={entries} label={`More for ${candidate.display_name}`}>
      {(menuButton) => (
        <li
          draggable={canDrag}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          data-rush-card={candidate.id}
          className={cn(
            "group relative rounded-[14px] border border-border bg-background transition-[opacity,box-shadow]",
            canDrag && "cursor-grab active:cursor-grabbing",
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
              {rushOwnerWords(candidate)}
              {quietFollowUp ? ` · ${work.label}` : ""}
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
            {candidate.bid_state !== "none" || (work && !quietFollowUp) ? (
              <span className="flex flex-wrap gap-1 pt-0.5">
                <RushBidBadge candidate={candidate} />
                {quietFollowUp ? null : <RushFollowUpFact state={work} />}
              </span>
            ) : null}
          </button>
          <div className="absolute right-1.5 top-1.5">{menuButton}</div>
        </li>
      )}
    </RowMenu>
  );
}
