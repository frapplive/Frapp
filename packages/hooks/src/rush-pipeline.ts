import {
  can,
  type RushBidState,
  RUSH_CLOSED_REASON_LABELS,
  formatRushRatingAverage,
  type RushClosedReason,
  type RushStageCategory,
} from "@repo/validation";

/**
 * The recruitment pipeline's pure rules (#5924, `spec/behavior/rush.md`
 * § Pipeline), shared by web's Rush page and the phone's Rush screens so the
 * two draw the same columns, gate the same controls and say the same words.
 */

export interface RushStageView {
  id: string;
  key: string;
  label: string;
  category: RushStageCategory;
  position: number;
  hidden: boolean;
}

export interface RushCandidateLike {
  id: string;
  stage: string;
  closed_reason?: RushClosedReason | null;
  /** The bid's full state (#5973), which places a card past its stage. */
  bid_state?: RushBidState;
  created_at: string;
}

/**
 * What the viewer may do in the pipeline, from `useMyPermissions()`. Unlike
 * the chat card, an unread permission list allows nothing: the pipeline is a
 * page the viewer opened on purpose, and it waits for the read.
 */
export interface RushPipelineAccess {
  /** Open the pipeline at all: `members:view` and `rush:view`. */
  view: boolean;
  /** Add a prospect (`rush:add`). */
  add: boolean;
  /** Move a prospect between stages (`rush:add`). */
  move: boolean;
  /** Tag a prospect and write notes (`rush:notes`). */
  writeNotes: boolean;
  /** Read notes (`rush:read_notes`). */
  readNotes: boolean;
  /** Vote and rate (`rush:vote`). */
  vote: boolean;
  /** Extend a bid, record a decline or an acceptance (`rush:bid`). */
  bid: boolean;
  /** See vote counts and rating averages (`rush:view_results`). */
  viewResults: boolean;
  /** Edit stages and tags; delete anyone's note (`rush:manage`). */
  manage: boolean;
}

export function rushPipelineAccess(
  permissions: readonly string[] | null | undefined,
): RushPipelineAccess {
  const view =
    can("members:view", permissions) && can("rush:view", permissions);
  const may = (key: string) => view && can(key, permissions);
  return {
    view,
    add: may("rush:add"),
    move: may("rush:add"),
    writeNotes: may("rush:notes"),
    readNotes: may("rush:read_notes"),
    vote: may("rush:vote"),
    bid: may("rush:bid"),
    viewResults: may("rush:view_results"),
    manage: may("rush:manage"),
  };
}

/** One column of the board. Closed stages fold into one column. */
export interface RushBoardColumn<S extends RushStageView = RushStageView> {
  /**
   * A stage key, `"closed"` for the folded column, or
   * {@link RUSH_BID_COLUMN} for the open bids.
   */
  id: string;
  label: string;
  category: RushStageCategory;
  /**
   * The stages the column holds: one, or every Closed stage. None for the
   * Bid extended column, which nothing is dropped into.
   */
  stages: S[];
  /** The Bid extended column (#5973). */
  bid?: boolean;
}

/** The Bid extended column's id; no stage key can be it (keys are slugs). */
export const RUSH_BID_COLUMN = "bid-extended";

/**
 * A card with an open bid or an accepted one sits in the Bid extended or the
 * Closed column whatever its stage, because only a bid action moves it there
 * (#5973, Winston's UI design v8 § 3b); so it isn't dragged between columns.
 * Its stage still changes from the prospect's panel.
 */
export function rushPlacedByBid(candidate: RushCandidateLike): boolean {
  return (
    candidate.bid_state === "extended" || candidate.bid_state === "accepted"
  );
}

/**
 * The board's columns, in order: each visible working stage, then **Bid
 * extended** while anyone has an open bid (#5973), then one Closed column that
 * holds every Closed stage and every accepted prospect, so the board fits a
 * laptop window however many ways a chapter closes a prospect. A hidden stage
 * that still holds prospects keeps its column, so nobody goes missing; an
 * empty hidden one is left out.
 */
export function rushBoardColumns<S extends RushStageView>(
  stages: readonly S[],
  candidates: readonly RushCandidateLike[],
): RushBoardColumn<S>[] {
  const occupied = new Set(
    candidates.filter((c) => !rushPlacedByBid(c)).map((c) => c.stage),
  );
  const shown = stages.filter(
    (stage) => !stage.hidden || occupied.has(stage.key),
  );
  const working = shown
    .filter((stage) => stage.category !== "closed")
    .map((stage) => ({
      id: stage.key,
      label: stage.label,
      category: stage.category,
      stages: [stage],
    }));
  const bids: RushBoardColumn<S>[] = candidates.some(
    (c) => c.bid_state === "extended",
  )
    ? [
        {
          id: RUSH_BID_COLUMN,
          label: "Bid extended",
          category: "bid_ready",
          stages: [],
          bid: true,
        },
      ]
    : [];
  const closed = shown.filter((stage) => stage.category === "closed");
  const accepted = candidates.some((c) => c.bid_state === "accepted");
  return closed.length === 0 && !accepted
    ? [...working, ...bids]
    : [
        ...working,
        ...bids,
        { id: "closed", label: "Closed", category: "closed", stages: closed },
      ];
}

/** Stages a prospect can be moved into by hand: every visible one. */
export function rushMovableStages<S extends RushStageView>(
  stages: readonly S[],
): S[] {
  return stages.filter((stage) => !stage.hidden);
}

/**
 * The prospects in each column, newest first, keyed by column id. A
 * prospect whose stage the chapter no longer has (it can't happen through
 * the API, which never deletes a stage) lands in the first column rather
 * than vanishing.
 */
export function rushCandidatesByColumn<C extends RushCandidateLike>(
  columns: readonly RushBoardColumn[],
  candidates: readonly C[],
): Map<string, C[]> {
  const columnOf = new Map<string, string>();
  for (const column of columns) {
    for (const stage of column.stages) columnOf.set(stage.key, column.id);
  }
  const fallback = columns[0]?.id;
  const out = new Map<string, C[]>(columns.map((column) => [column.id, []]));
  const sorted = [...candidates].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const byBid = (candidate: C): string | undefined => {
    if (candidate.bid_state === "extended" && out.has(RUSH_BID_COLUMN)) {
      return RUSH_BID_COLUMN;
    }
    if (candidate.bid_state === "accepted" && out.has("closed")) {
      return "closed";
    }
    return undefined;
  };
  for (const candidate of sorted) {
    const id = byBid(candidate) ?? columnOf.get(candidate.stage) ?? fallback;
    if (id) out.get(id)?.push(candidate);
  }
  return out;
}

/** A stage's name for a prospect, with the reason when it is Closed. */
export function rushStageLabel(
  stages: readonly RushStageView[],
  candidate: Pick<RushCandidateLike, "stage" | "closed_reason">,
): string {
  const stage = stages.find((s) => s.key === candidate.stage);
  const label = stage?.label ?? "Unknown stage";
  if (stage?.category === "closed" && candidate.closed_reason) {
    return `${label} · ${RUSH_CLOSED_REASON_LABELS[candidate.closed_reason]}`;
  }
  return label;
}

/**
 * "★ 3.7 · 6 ratings", or "No ratings yet"; `null` when the viewer can't
 * see results (the field is absent), so nothing is drawn rather than a
 * misleading zero.
 */
export function rushRatingSummary(candidate: {
  rating_average?: number | null;
  rating_count?: number;
}): string | null {
  if (candidate.rating_count === undefined) return null;
  if (candidate.rating_count === 0 || candidate.rating_average == null) {
    return "No ratings yet";
  }
  const count = candidate.rating_count;
  return `★ ${formatRushRatingAverage(candidate.rating_average)} · ${count} ${
    count === 1 ? "rating" : "ratings"
  }`;
}

/** The pipeline header's count: "48 prospects". */
export function rushProspectCount(count: number): string {
  return `${count} ${count === 1 ? "prospect" : "prospects"}`;
}

/** Stages a prospect can be counted against: `category` and `key`. */
interface RushStageKeyLike {
  key: string;
  category: RushStageCategory;
}

/**
 * The prospects still in play: everyone not in a Closed stage. The header's
 * count on web and on the phone.
 */
export function rushOpenProspectCount(
  stages: readonly RushStageKeyLike[],
  candidates: readonly Pick<RushCandidateLike, "stage" | "bid_state">[],
): number {
  const closed = new Set(
    stages.filter((stage) => stage.category === "closed").map((s) => s.key),
  );
  // An accepted prospect folds into Closed on the board (#5973), so the
  // count leaves them out too, whatever their stage.
  return candidates.filter(
    (candidate) =>
      !closed.has(candidate.stage) && candidate.bid_state !== "accepted",
  ).length;
}

/**
 * Who may see a prospect's Notes section, and what it offers; `null` hides
 * it. Nobody reads or writes notes about themselves (`rush.md` § Notes), so
 * a prospect linked to the viewer's own account shows none, whatever keys
 * they hold; while the viewer's id is unknown, a linked prospect shows none
 * either. Otherwise it shows to a role that reads (`rush:read_notes`) or
 * writes (`rush:notes`) notes.
 */
export function rushNotesMode(
  access: Pick<RushPipelineAccess, "readNotes" | "writeNotes">,
  candidateUserId: string | null,
  viewerId: string | null,
): { read: boolean; write: boolean } | null {
  if (
    candidateUserId !== null &&
    (viewerId === null || candidateUserId === viewerId)
  ) {
    return null;
  }
  if (!access.readNotes && !access.writeNotes) return null;
  return { read: access.readNotes, write: access.writeNotes };
}

/** A prospect's tags, in the chapter's list order; unknown ids drop out. */
export function rushAppliedTags<T extends { id: string }>(
  tagIds: readonly string[],
  tags: readonly T[],
): T[] {
  const on = new Set(tagIds);
  return tags.filter((tag) => on.has(tag.id));
}

/** How many tags a card or row has room for before "+N". */
export const RUSH_ROW_TAG_LIMIT = 2;

/** The tags a card or row shows, and how many more there are. */
export function rushTagOverflow<T>(
  items: readonly T[],
  limit: number = RUSH_ROW_TAG_LIMIT,
): { shown: T[]; more: number } {
  if (items.length <= limit) return { shown: [...items], more: 0 };
  return { shown: items.slice(0, limit), more: items.length - limit };
}

/** Who added a prospect: a member, or their own interest form (#5977). */
export interface RushCandidateAdder {
  created_by_name: string | null;
  origin?: "manual" | "pnm";
}

/** The adder's name, or "Interest form" for one the PNM's form created. */
export function rushAddedBy(candidate: RushCandidateAdder): string {
  if (candidate.origin === "pnm" || candidate.created_by_name === null) {
    return "Interest form";
  }
  return candidate.created_by_name;
}

/** A row's meta line: "Added by Moiz Steenhuis" or "From the interest form". */
export function rushAddedByLine(candidate: RushCandidateAdder): string {
  return candidate.origin === "pnm" || candidate.created_by_name === null
    ? "From the interest form"
    : `Added by ${candidate.created_by_name}`;
}
