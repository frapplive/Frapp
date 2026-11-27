import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import {
  useAcceptAiSuggestion,
  useSimilarTasks,
  type AiSuggestion,
  type MeetingActionItemTask,
} from "@repo/hooks";
import {
  AI_SUGGESTION_COPY,
  MINUTES_READ_COPY,
  SIMILAR_TASK_COPY,
  minutesActionSuggestions,
  type MeetingActionItem,
} from "@repo/validation";
import {
  CheckGlyph,
  ForwardGlyph,
  PlusGlyph,
} from "@/components/control-glyphs";
import type { ItemMenu, ItemMenuHandle } from "@/components/item-actions-menu";
import type { ActionItemMenuFor } from "@/components/minutes/minutes-body";
import { NewTaskSheet } from "@/components/tasks/new-task-sheet";
import { suggestionSeed } from "@/components/tasks/suggestion-seed";
import { alertFailure } from "@/lib/failure-alert";

type Waiting = AiSuggestion & { task: NonNullable<AiSuggestion["task"]> };

/**
 * Create task from any action item of posted minutes, on the phone (#6051;
 * Winston, 2026-11-25). An officer long-presses the item and picks Create
 * task, which opens the task form on that item's waiting suggestion, the
 * sheet the Suggested tasks card opens for Change before creating
 * (`suggestionSeed`); Create there accepts the suggestion, so the task is the
 * one the card would make and the card stops offering it. An item that reads
 * like a task the chapter already has asks first, as the card does: Already
 * a task, or Create anyway. An item already made a task offers Open task.
 * Web's row does the same from its Create task and ⋯ menu
 * (`apps/web/components/meetings/action-item-task.tsx`).
 *
 * The server lists a suggestion only to someone who could accept it, and
 * names an item's task only to someone who manages tasks, so a member's
 * rows have no menu at all.
 */
export function useActionItemTaskMenu({
  items,
  suggestions,
  handleFor,
}: {
  items: readonly MeetingActionItem[];
  /** These minutes' waiting suggestions, as the screen already reads them. */
  suggestions: readonly AiSuggestion[];
  handleFor: (menu: ItemMenu | null) => ItemMenuHandle | null;
}): { menuFor: ActionItemMenuFor; sheet: React.ReactNode } {
  const router = useRouter();
  const accept = useAcceptAiSuggestion();
  const waiting = useMemo(
    () =>
      suggestions.filter(
        (item): item is Waiting => item.kind === "task" && !!item.task,
      ),
    [suggestions],
  );
  const byIndex = useMemo(
    () => minutesActionSuggestions(items, waiting),
    [items, waiting],
  );
  const similar = useSimilarTasks(waiting);
  const [formFor, setFormFor] = useState<Waiting | null>(null);
  const formRef = useRef<BottomSheetModal>(null);
  useEffect(() => {
    if (formFor) formRef.current?.present();
  }, [formFor]);

  const menuFor: ActionItemMenuFor = useCallback(
    ({
      index,
      item,
      task,
    }: {
      index: number;
      item: MeetingActionItem;
      task: MeetingActionItemTask | undefined;
    }) => {
      const taskId = task?.task?.id ?? null;
      if (taskId) {
        return handleFor({
          title: item.text,
          actions: [
            {
              key: "open-task",
              label: MINUTES_READ_COPY.openTask,
              glyph: (color) => <ForwardGlyph color={color} />,
              run: () =>
                router.push({
                  pathname: "/task-details",
                  params: { id: taskId },
                }),
            },
          ],
        });
      }
      // A task the item already became wins over a suggestion.
      const suggestion = byIndex.get(index);
      if (!suggestion) return null;
      const twin = similar.twinOf(suggestion.id);
      if (twin) {
        return handleFor({
          title: item.text,
          message: `${SIMILAR_TASK_COPY.heading}: ${twin.title}`,
          actions: [
            {
              key: "same",
              label: SIMILAR_TASK_COPY.same,
              glyph: (color) => <CheckGlyph color={color} />,
              run: () =>
                void accept
                  .mutateAsync({
                    id: suggestion.id,
                    task: { existing_task_id: twin.id },
                  })
                  .catch((error: unknown) =>
                    alertFailure({
                      title: SIMILAR_TASK_COPY.linkFailed,
                      error,
                    }),
                  ),
            },
            {
              key: "different",
              label: SIMILAR_TASK_COPY.different,
              glyph: (color) => <PlusGlyph color={color} />,
              run: () => {
                similar.keep(suggestion.id);
                setFormFor(suggestion);
              },
            },
          ],
        });
      }
      return handleFor({
        title: item.text,
        actions: [
          {
            key: "create-task",
            label: AI_SUGGESTION_COPY.accept,
            glyph: (color) => <PlusGlyph color={color} />,
            run: () => setFormFor(suggestion),
          },
        ],
      });
    },
    [accept, byIndex, handleFor, router, similar],
  );

  const sheet = formFor ? (
    <NewTaskSheet
      key={formFor.id}
      ref={formRef}
      suggestion={suggestionSeed(formFor, accept.mutateAsync)}
      offerGroups
      onClosed={() => setFormFor(null)}
    />
  ) : null;

  return { menuFor, sheet };
}
