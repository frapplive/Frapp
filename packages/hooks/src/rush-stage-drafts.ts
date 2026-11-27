import {
  RUSH_STAGE_CATEGORIES,
  sortRushStages,
  type RushStageCategory,
} from "@repo/validation";
import type { RushStage, RushStageInput } from "./use-rush-pipeline";

/**
 * The recruitment stages as an officer edits them (`spec/behavior/rush.md`
 * § Stages), on web's Recruitment page and the phone's alike: the editor's
 * rows, the list `PUT /v1/rush/stages` takes, and the ids a save gave the
 * stages it added. Pure, so both editors send the same list.
 */

/** One stage as the editor holds it: a saved one keeps its id. */
export type StageDraft = {
  /** A saved stage's id; absent for one added here and not yet saved. */
  id?: string;
  /** The row's React key: the id, or a client one for a new stage. */
  rowKey: string;
  label: string;
  category: RushStageCategory;
  hidden: boolean;
};

export function draftsOf(stages: readonly RushStage[]): StageDraft[] {
  return sortRushStages(stages).map((stage) => ({
    id: stage.id,
    rowKey: stage.id,
    label: stage.label,
    category: stage.category,
    hidden: stage.hidden,
  }));
}

/** The body `PUT /v1/rush/stages` takes: every stage, in board order. */
export function stagesBody(drafts: readonly StageDraft[]): RushStageInput[] {
  return RUSH_STAGE_CATEGORIES.flatMap((category) =>
    drafts
      .filter((draft) => draft.category === category)
      .map((draft) => ({
        ...(draft.id ? { id: draft.id } : {}),
        label: draft.label.trim(),
        category: draft.category,
        hidden: draft.hidden,
      })),
  );
}

/**
 * A waiting edit, with the ids the server just gave the stages it added. A
 * stage added before that save went out has no id in the edit; it is found
 * by its row in the list that was sent (its name then may since have
 * changed) and that name among the saved stages of its category.
 */
export function withSavedIds(
  waiting: readonly StageDraft[],
  sent: readonly StageDraft[],
  saved: readonly RushStage[],
): StageDraft[] {
  const known = new Set(sent.flatMap((draft) => (draft.id ? [draft.id] : [])));
  const fresh = saved.filter((stage) => !known.has(stage.id));
  return waiting.map((draft) => {
    if (draft.id) return draft;
    const asSent = sent.find((row) => row.rowKey === draft.rowKey);
    if (!asSent) return draft;
    const match = fresh.find(
      (stage) =>
        stage.category === asSent.category &&
        stage.label === asSent.label.trim(),
    );
    return match ? { ...draft, id: match.id } : draft;
  });
}
