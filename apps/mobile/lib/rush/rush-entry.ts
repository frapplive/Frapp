import {
  rushBoardColumns,
  rushCandidatesByColumn,
  rushPipelineAccess,
  useCurrentChapter,
  useMyPermissions,
  type RushPipelineAccess,
  type RushPipelineCandidate,
  type RushStage,
  rushFollowUpList,
} from "@repo/hooks";
import { memberViewVocabulary, vocab } from "@repo/org-archetypes";
import { isModuleEnabled, sortRushStages } from "@repo/validation";

/**
 * The phone's recruitment pipeline (#5924): who may open it, what the chapter
 * calls it, and the list's chips. The rules are `@repo/hooks`'
 * `rush-pipeline.ts`, which web's page applies too; this only reads them the
 * way the phone's two screens and the You row need them.
 */

export type RushEntry = {
  /** The chapter's own word for recruitment: "Rush", "Recruitment", "Intake". */
  term: string;
  /** What the viewer may do, from `rushPipelineAccess`. */
  access: RushPipelineAccess;
  /**
   * The You row and the screens: Recruitment on for the chapter, and the
   * viewer holds `members:view` and `rush:view`. False until both reads have
   * answered, so the row never flashes in for a viewer who can't open it.
   */
  show: boolean;
  /**
   * Both reads have answered. A screen opened by a link waits for this before
   * it sends a viewer who can't use it back to You.
   */
  settled: boolean;
};

export function useRushEntry(): RushEntry {
  const chapter = useCurrentChapter().data;
  const permissions = useMyPermissions().data?.permissions;
  const term = vocab("recruitment", memberViewVocabulary(chapter ?? undefined));
  const access = rushPipelineAccess(permissions);
  const settled = chapter != null && permissions !== undefined;
  const moduleOn =
    chapter != null && isModuleEnabled(chapter.enabled_modules, "rush");
  return {
    term,
    access,
    show: settled && moduleOn && access.view,
    settled,
  };
}

/** One chip on the list, and the prospects it holds, newest first. */
export type RushStageTab = {
  /**
   * A stage key, `"closed"` for the chip that folds every Closed stage, or
   * {@link RUSH_FOLLOW_UP_TAB}.
   */
  id: string;
  label: string;
  /** True for the folded Closed chip. */
  closed: boolean;
  /** True for the Follow up chip, which holds the viewer's own work. */
  followUp: boolean;
  /** A New-category stage: where an add lands, so its empty line says how. */
  receivesAdds: boolean;
  candidates: RushPipelineCandidate[];
};

/**
 * The list's chips, in the board's order: each visible stage, then one Closed
 * chip for every Closed stage, so a chapter that closes prospects four ways
 * still has one place to look. A hidden stage that still holds prospects
 * keeps its chip, as it keeps its board column, so nobody goes missing.
 */
export function rushStageTabs(
  stages: readonly RushStage[],
  candidates: readonly RushPipelineCandidate[],
): RushStageTab[] {
  const columns = rushBoardColumns(sortRushStages(stages), candidates);
  const byColumn = rushCandidatesByColumn(columns, candidates);
  return columns.map((column) => ({
    id: column.id,
    label: column.label,
    closed: column.category === "closed",
    followUp: false,
    receivesAdds: column.category === "new",
    candidates: byColumn.get(column.id) ?? [],
  }));
}

/** The Follow up chip's id; no stage key can be it (keys are slugs). */
export const RUSH_FOLLOW_UP_TAB = "follow-up";

/**
 * The list's chips for this viewer (#5934): **Follow up** first, for a role
 * that works prospects (`rush:add`), holding the viewer's due follow-ups and
 * the stale prospects they own (`isRushFollowUpForViewer`), then every stage
 * chip as {@link rushStageTabs} draws them. A role that can't own a prospect
 * or take a follow-up would only ever see it empty, so it gets none.
 */
export function rushListTabs(
  stages: readonly RushStage[],
  candidates: readonly RushPipelineCandidate[],
  work: {
    canWork: boolean;
    viewerId: string | null;
    staleDays: number;
    today: string;
  },
): RushStageTab[] {
  const tabs = rushStageTabs(stages, candidates);
  if (!work.canWork) return tabs;
  return [
    {
      id: RUSH_FOLLOW_UP_TAB,
      label: "Follow up",
      closed: false,
      followUp: true,
      receivesAdds: false,
      candidates: rushFollowUpList(
        candidates,
        work.viewerId,
        work.staleDays,
        work.today,
      ),
    },
    ...tabs,
  ];
}
