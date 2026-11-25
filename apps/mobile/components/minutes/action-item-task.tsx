import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import {
  useAcceptAiSuggestion,
  type AiSuggestion,
  type MeetingActionItemTask,
} from "@repo/hooks";
import {
  AI_SUGGESTION_COPY,
  MINUTES_READ_COPY,
  minutesActionSuggestions,
  taskWhoOf,
  type MeetingActionItem,
} from "@repo/validation";
import { ForwardGlyph, PlusGlyph } from "@/components/control-glyphs";
import type { ItemMenu, ItemMenuHandle } from "@/components/item-actions-menu";
import type { ActionItemMenuFor } from "@/components/minutes/minutes-body";
import {
  NewTaskSheet,
  type TaskSuggestionSeed,
} from "@/components/tasks/new-task-sheet";
import { suggestionEdits } from "@/lib/tasks/suggestion-edits";

type Waiting = AiSuggestion & { task: NonNullable<AiSuggestion["task"]> };

/**
 * Create task from any action item of posted minutes, on the phone (#6051;
 * Winston, 2026-11-25). An officer long-presses the item and picks Create
 * task, which opens the task form on that item's waiting suggestion, the
 * sheet the Suggested tasks card opens for Change before creating; Create
 * there accepts the suggestion, so the task is the one the card would make
 * and the card stops offering it. An item already made a task offers Open
 * task instead. Web's row does the same from its Create task and ⋯ menu
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
  const byIndex = useMemo(
    () =>
      minutesActionSuggestions(
        items,
        suggestions.filter(
          (item): item is Waiting => item.kind === "task" && !!item.task,
        ),
      ),
    [items, suggestions],
  );
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
      // A task the item already became wins over a suggestion.
      const waiting = taskId ? null : (byIndex.get(index) ?? null);
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
      if (!waiting) return null;
      return handleFor({
        title: item.text,
        actions: [
          {
            key: "create-task",
            label: AI_SUGGESTION_COPY.accept,
            glyph: (color) => <PlusGlyph color={color} />,
            run: () => setFormFor(waiting),
          },
        ],
      });
    },
    [byIndex, handleFor, router],
  );

  const seed: TaskSuggestionSeed | undefined = formFor
    ? {
        title: formFor.task.title,
        // One member, several, a role, a group or everyone, as the card's.
        who: taskWhoOf(formFor.task),
        dueDay: formFor.task.due_date,
        dueAt: formFor.task.due_at,
        subtasks: formFor.task.subtasks,
        accept: async (form) => {
          await accept.mutateAsync({
            id: formFor.id,
            task: suggestionEdits(formFor.task, form),
          });
        },
      }
    : undefined;

  const sheet =
    formFor && seed ? (
      <NewTaskSheet
        key={formFor.id}
        ref={formRef}
        suggestion={seed}
        offerGroups
        onClosed={() => setFormFor(null)}
      />
    ) : null;

  return { menuFor, sheet };
}
