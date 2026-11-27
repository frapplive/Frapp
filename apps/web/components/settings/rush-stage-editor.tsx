"use client";

import { useId, useState } from "react";
import { GripVertical, Plus } from "lucide-react";
import { useSaveRushStages, type RushStage } from "@repo/hooks";
import type { StageDraft } from "@repo/hooks/rush-stage-drafts";
import { useRushStageEditor } from "@repo/hooks/use-rush-stage-editor";
import {
  RUSH_STAGE_CATEGORIES,
  RUSH_STAGE_CATEGORY_LABELS,
  RUSH_SETTINGS_COPY,
  RUSH_STAGE_LABEL_MAX,
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

let newRow = 0;

/**
 * The chapter's recruitment stages, on the Recruitment module page
 * (`spec/behavior/rush.md` § Stages; `ifc-recruitment.md` § Where the chapter's settings
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
  const problemId = useId();
  const save = useSaveRushStages();
  const { drafts, problem, change } = useRushStageEditor(
    stages,
    save,
    (error) =>
      toastFailure({
        title: RUSH_SETTINGS_COPY.stages.failed,
        error,
        fallback: "Retry in a moment.",
      }),
  );

  return (
    <ProfileSection
      id="settings-module-rush-stages"
      title={RUSH_SETTINGS_COPY.stages.title}
      hint={
        canEdit
          ? RUSH_SETTINGS_COPY.stages.editHint
          : RUSH_SETTINGS_COPY.stages.hint
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
      <h3 id={headingId} className={cn(EYEBROW, "text-muted")}>
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
                  "flex h-control-row w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground active:cursor-grabbing pointer-coarse:h-11",
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
                aria-label={RUSH_SETTINGS_COPY.stages.show(draft.label)}
              />
            ) : draft.hidden ? (
              <span className="shrink-0 text-caption text-muted-foreground">
                {RUSH_SETTINGS_COPY.stages.hidden}
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
              placeholder={RUSH_SETTINGS_COPY.stages.newStage(label)}
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
            {RUSH_SETTINGS_COPY.stages.add}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
