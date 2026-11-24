import {
  can,
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
    viewResults: may("rush:view_results"),
    manage: may("rush:manage"),
  };
}

/** One column of the board. Closed stages fold into one column. */
export interface RushBoardColumn<S extends RushStageView = RushStageView> {
  /** A stage key, or `"closed"` for the folded column. */
  id: string;
  label: string;
  category: RushStageCategory;
  /** The stages the column holds: one, or every Closed stage. */
  stages: S[];
}

/**
 * The board's columns, in order: each visible working stage, then one
 * Closed column that holds every Closed stage, so the board fits a laptop
 * window however many ways a chapter closes a prospect. A hidden stage that
 * still holds prospects keeps its column, so nobody goes missing; an empty
 * hidden one is left out.
 */
export function rushBoardColumns<S extends RushStageView>(
  stages: readonly S[],
  candidates: readonly RushCandidateLike[],
): RushBoardColumn<S>[] {
  const occupied = new Set(candidates.map((c) => c.stage));
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
  const closed = shown.filter((stage) => stage.category === "closed");
  return closed.length === 0
    ? working
    : [
        ...working,
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
  for (const candidate of sorted) {
    const id = columnOf.get(candidate.stage) ?? fallback;
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
  candidates: readonly Pick<RushCandidateLike, "stage">[],
): number {
  const closed = new Set(
    stages.filter((stage) => stage.category === "closed").map((s) => s.key),
  );
  return candidates.filter((candidate) => !closed.has(candidate.stage)).length;
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
