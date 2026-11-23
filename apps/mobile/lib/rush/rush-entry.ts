import { getSlashCommand } from "@repo/chat-core/integrations";
import {
  rushBoardColumns,
  rushCandidatesByColumn,
  rushPipelineAccess,
  useCurrentChapter,
  useMyPermissions,
  type RushPipelineAccess,
  type RushPipelineCandidate,
  type RushStage,
  type RushTag,
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
  /** The slash command that adds a prospect in chat: "/rush", "/intake". */
  command: string;
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
  const slash = getSlashCommand("rush", { recruitment: term });
  const access = rushPipelineAccess(permissions);
  const settled = chapter != null && permissions !== undefined;
  const moduleOn =
    chapter != null && isModuleEnabled(chapter.enabled_modules, "rush");
  return {
    term,
    command: `/${slash?.displayName ?? slash?.name ?? "rush"}`,
    access,
    show: settled && moduleOn && access.view,
    settled,
  };
}

/** One chip on the list, and the prospects it holds, newest first. */
export type RushStageTab = {
  /** A stage key, or `"closed"` for the chip that folds every Closed stage. */
  id: string;
  label: string;
  /** True for the folded Closed chip. */
  closed: boolean;
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
    receivesAdds: column.category === "new",
    candidates: byColumn.get(column.id) ?? [],
  }));
}

/** The prospects still in play: everyone not in a Closed stage. */
export function openProspectCount(
  stages: readonly RushStage[],
  candidates: readonly RushPipelineCandidate[],
): number {
  const closed = new Set(
    stages.filter((stage) => stage.category === "closed").map((s) => s.key),
  );
  return candidates.filter((candidate) => !closed.has(candidate.stage)).length;
}

/** A prospect's tags by name, in the chapter's list order. */
export function rushTagLabels(
  tagIds: readonly string[],
  tags: readonly RushTag[],
): string[] {
  const on = new Set(tagIds);
  return tags.filter((tag) => on.has(tag.id)).map((tag) => tag.label);
}

/**
 * The tags a row has room for: two, then "+N" for the rest (P5.3: a chip set
 * has a cap). The prospect's screen shows them all.
 */
export const ROW_TAG_LIMIT = 2;

export function rowTags(labels: readonly string[]): {
  shown: string[];
  more: number;
} {
  if (labels.length <= ROW_TAG_LIMIT) return { shown: [...labels], more: 0 };
  return {
    shown: labels.slice(0, ROW_TAG_LIMIT),
    more: labels.length - ROW_TAG_LIMIT,
  };
}
