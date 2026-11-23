"use client";

import { useId, useState } from "react";
import { GripVertical, Plus } from "lucide-react";
import {
  useSaveRushStages,
  type RushStage,
  type RushStageInput,
} from "@repo/hooks";
import {
  RUSH_STAGE_CATEGORIES,
  RUSH_STAGE_CATEGORY_LABELS,
  RUSH_STAGE_LABEL_MAX,
  rushStagesProblem,
  sortRushStages,
  type RushStageCategory,
} from "@repo/validation";
import { ProfileSection } from "@/components/profile/profile-section";
import { useSortableList } from "@/components/shared/use-sortable-list";
import { InlineNameField } from "@/components/settings/inline-name-field";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FOCUS_RING_OFFSET } from "@/components/ui/focus";
import { EYEBROW } from "@/components/ui/typography";
import { toastFailure } from "@/lib/failure-toast";
import { cn } from "@/lib/utils";

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

function draftsOf(stages: readonly RushStage[]): StageDraft[] {
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

let newRow = 0;

/**
 * The chapter's recruitment stages, on the Recruitment module page
 * (`spec/behavior/ifc-recruitment.md` § Stages, § Where the chapter's settings
 * live): grouped by the six fixed categories, each stage renamed in place,
 * shown or hidden on the board, and dragged into order within its category
 * (the grip; its arrow keys move it too). A stage never leaves its category,
 * because automatic moves go by category, not by name.
 *
 * Settings save on their own (rulebook § 9): every change sends the whole
 * list, as `PUT /v1/rush/stages` takes it, once `rushStagesProblem` (the
 * check the API runs) passes. A change it refuses stays on screen with the
 * reason under the list, and nothing is sent until it is fixed. Editing needs
 * `rush:manage`; everyone else who can open the page reads it.
 */
export function RushStageEditor({
  stages,
  canEdit,
}: {
  stages: readonly RushStage[];
  canEdit: boolean;
}) {
  const save = useSaveRushStages();
  const problemId = useId();
  // The edit in hand and the server list it was made against: once the
  // server's list moves on (the save landed and refreshed), it is the truth.
  const [edit, setEdit] = useState<{
    basis: readonly RushStage[];
    drafts: StageDraft[];
  } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const drafts = edit && edit.basis === stages ? edit.drafts : draftsOf(stages);

  function change(next: StageDraft[]) {
    setEdit({ basis: stages, drafts: next });
    const refused = rushStagesProblem(next);
    setProblem(refused);
    if (refused) return;
    save.mutate(stagesBody(next), {
      onError: (error) => {
        setEdit(null);
        toastFailure({
          title: "Couldn't save the stages",
          error,
          fallback: "Retry in a moment.",
        });
      },
    });
  }

  return (
    <ProfileSection
      id="settings-module-rush-stages"
      title="Stages"
      hint={
        canEdit
          ? "Where a prospect is in recruitment. Rename, hide or reorder a stage within its group."
          : "Where a prospect is in recruitment."
      }
    >
      <div className="grid gap-5">
        {RUSH_STAGE_CATEGORIES.map((category) => (
          <CategoryStages
            key={category}
            category={category}
            drafts={drafts}
            canEdit={canEdit}
            describedBy={problem ? problemId : undefined}
            onChange={change}
          />
        ))}
      </div>
      {problem ? (
        <p
          id={problemId}
          role="alert"
          className="text-sm text-destructive-text"
        >
          {problem}
        </p>
      ) : null}
    </ProfileSection>
  );
}

function CategoryStages({
  category,
  drafts,
  canEdit,
  describedBy,
  onChange,
}: {
  category: RushStageCategory;
  drafts: StageDraft[];
  canEdit: boolean;
  describedBy: string | undefined;
  onChange: (next: StageDraft[]) => void;
}) {
  const headingId = useId();
  const [adding, setAdding] = useState(false);
  const own = drafts.filter((draft) => draft.category === category);
  const sortable = useSortableList({
    count: own.length,
    disabled: !canEdit || own.length < 2,
    onMove: (from, to) => {
      const moved = [...own];
      const [row] = moved.splice(from, 1);
      if (!row) return;
      moved.splice(to, 0, row);
      onChange([
        ...drafts.filter((draft) => draft.category !== category),
        ...moved,
      ]);
    },
  });

  const replace = (rowKey: string, patch: Partial<StageDraft>) =>
    onChange(
      drafts.map((draft) =>
        draft.rowKey === rowKey ? { ...draft, ...patch } : draft,
      ),
    );

  const label = RUSH_STAGE_CATEGORY_LABELS[category];
  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <h3 id={headingId} className={cn(EYEBROW, "text-muted-foreground")}>
        {label}
      </h3>
      <ul className="divide-y divide-border rounded-[14px] border border-border bg-card">
        {own.map((draft, index) => (
          <li
            key={draft.rowKey}
            ref={sortable.rowRef(index)}
            style={sortable.rowStyle(index)}
            className={cn(
              "flex min-h-11 items-center gap-2 bg-card px-3 py-1.5 first:rounded-t-[13px] last:rounded-b-[13px]",
              sortable.dragging === index && "shadow-lg ring-1 ring-border",
            )}
          >
            {canEdit && own.length > 1 ? (
              <button
                type="button"
                {...sortable.handleProps(index, draft.label)}
                className={cn(
                  "flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground active:cursor-grabbing pointer-coarse:h-11",
                  FOCUS_RING_OFFSET,
                )}
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
            {canEdit ? (
              <InlineNameField
                maxLength={RUSH_STAGE_LABEL_MAX}
                // A rename from elsewhere replaces what the field shows.
                key={`${draft.rowKey}:${draft.label}`}
                label={draft.label}
                describedBy={describedBy}
                onCommit={(next) => replace(draft.rowKey, { label: next })}
              />
            ) : (
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  draft.hidden ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {draft.label}
              </span>
            )}
            {canEdit ? (
              <Switch
                checked={!draft.hidden}
                onCheckedChange={(shown) =>
                  replace(draft.rowKey, { hidden: !shown })
                }
                aria-label={`Show ${draft.label} on the board`}
              />
            ) : draft.hidden ? (
              <span className="shrink-0 text-caption text-muted-foreground">
                Hidden
              </span>
            ) : null}
          </li>
        ))}
        {canEdit && adding ? (
          <li className="flex min-h-11 items-center gap-2 px-3 py-1.5">
            <InlineNameField
              maxLength={RUSH_STAGE_LABEL_MAX}
              label=""
              autoFocus
              placeholder={`New ${label.toLowerCase()} stage`}
              onCommit={(next) => {
                setAdding(false);
                onChange([
                  ...drafts,
                  {
                    rowKey: `new-${(newRow += 1)}`,
                    label: next,
                    category,
                    hidden: false,
                  },
                ]);
              }}
              onCancel={() => setAdding(false)}
            />
          </li>
        ) : null}
      </ul>
      <span className="sr-only" aria-live="polite">
        {sortable.announcement}
      </span>
      {canEdit && !adding ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add a stage
          </Button>
        </div>
      ) : null}
    </section>
  );
}
