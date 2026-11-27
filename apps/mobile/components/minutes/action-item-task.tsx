import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import {
  actionItemTaskIsFor,
  useAcceptAiSuggestion,
  useCanManageTasks,
  useMakeActionItemTask,
  useSimilarTasks,
  type AiSuggestion,
  type MeetingActionItemTask,
} from "@repo/hooks";
import {
  AI_SUGGESTION_COPY,
  MINUTES_READ_COPY,
  SIMILAR_TASK_COPY,
  actionItemTaskRefusalLine,
  minutesActionMakeable,
  minutesActionSuggestions,
  taskTitleFrom,
  taskWhoPeopleIds,
  type MeetingActionItem,
} from "@repo/validation";
import {
  CheckGlyph,
  ForwardGlyph,
  PlusGlyph,
} from "@/components/control-glyphs";
import type { ItemMenu, ItemMenuHandle } from "@/components/item-actions-menu";
import type { ActionItemMenuFor } from "@/components/minutes/minutes-body";
import {
  NewTaskSheet,
  type TaskSuggestionSeed,
} from "@/components/tasks/new-task-sheet";
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
 * An item with no suggestion waiting (it was reviewed or dismissed, it
 * expired, or suggestions were off) offers Create task too, to an officer
 * who manages tasks (#6178; Winston, 2026-11-25: "i cant assign anyone to
 * anything"). The form opens on the item, its owner and its day, picks
 * people only, and creates through the item's own route
 * (`POST /v1/meetings/:id/action-items/:index/task`, #6176), which accepts
 * a suggestion that turned up meanwhile rather than make a second task.
 *
 * The server lists a suggestion only to someone who could accept it, and
 * names an item's task only to someone who manages tasks, so a member's
 * rows have no menu at all.
 */
export function useActionItemTaskMenu({
  meetingId,
  posted,
  marks,
  items,
  suggestions,
  handleFor,
}: {
  meetingId: string;
  /** Posted minutes: a draft's items can't be made tasks. */
  posted: boolean;
  /**
   * The items' marks once read, by place; undefined until then, when no
   * item is offered a create of its own.
   */
  marks: ReadonlyMap<number, MeetingActionItemTask> | undefined;
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
  const canMake = useCanManageTasks();
  const make = useMakeActionItemTask();
  const makeable = useMemo(
    () => minutesActionMakeable(items, posted ? marks : undefined),
    [items, posted, marks],
  );
  // Items the server said are a task already with no mark to show for it
  // (accepted up for grabs and not yet claimed, #5508): not offered again.
  const [taken, setTaken] = useState<ReadonlySet<number>>(() => new Set());
  const [formFor, setFormFor] = useState<
    | { kind: "suggestion"; suggestion: Waiting }
    | { kind: "item"; index: number; item: MeetingActionItem }
    | null
  >(null);
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
      if (!suggestion) {
        // Only an item with no mark, the first of any that read the same,
        // on posted minutes whose marks are read.
        if (!canMake || !makeable.has(index) || taken.has(index)) return null;
        return handleFor({
          title: item.text,
          actions: [
            {
              key: "create-task",
              label: AI_SUGGESTION_COPY.accept,
              glyph: (color) => <PlusGlyph color={color} />,
              run: () => setFormFor({ kind: "item", index, item }),
            },
          ],
        });
      }
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
                setFormFor({ kind: "suggestion", suggestion });
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
            run: () => setFormFor({ kind: "suggestion", suggestion }),
          },
        ],
      });
    },
    [accept, byIndex, canMake, handleFor, makeable, router, similar, taken],
  );

  const sheet = formFor ? (
    <NewTaskSheet
      key={
        formFor.kind === "suggestion"
          ? formFor.suggestion.id
          : `item-${formFor.index}`
      }
      ref={formRef}
      suggestion={
        formFor.kind === "suggestion"
          ? suggestionSeed(formFor.suggestion, accept.mutateAsync)
          : itemSeed(
              formFor.item,
              (body) =>
                make.mutateAsync({ meetingId, index: formFor.index, body }),
              () =>
                setTaken((previous) => new Set(previous).add(formFor.index)),
            )
      }
      offerGroups
      onClosed={() => setFormFor(null)}
    />
  ) : null;

  return { menuFor, sheet };
}

/** What the item's route refused with, when it made nothing. */
const ALREADY_TASK = { code: "meeting.action_item.already_task" };

/**
 * The task form opened on an action item with no suggestion waiting
 * (#6178): its words (cut to a title as the server cuts them), the member
 * the minutes named and the day they gave. People only, and a day only with
 * no subtasks, since the route takes nothing else. An item someone else made
 * a task first is answered with that task: the form says so rather than
 * report a task it didn't make.
 */
function itemSeed(
  item: MeetingActionItem,
  make: (body: {
    text: string;
    assignee_ids: string[];
    title: string;
    due_date: string | null;
  }) => Promise<MeetingActionItemTask>,
  onTaken: () => void,
): TaskSuggestionSeed {
  return {
    title: taskTitleFrom(item.text),
    who: item.owner_user_id
      ? { kind: "person", userId: item.owner_user_id }
      : null,
    dueDay: item.due_date ?? null,
    dueAt: null,
    subtasks: [],
    peopleOnly: true,
    dayOnly: true,
    refusalLine: actionItemTaskRefusalLine,
    accept: async (form) => {
      const assigneeIds = taskWhoPeopleIds(form.who);
      // The people-only picker hands back nothing else.
      if (!assigneeIds) throw new Error("Pick who this is for.");
      try {
        const mark = await make({
          text: item.text,
          assignee_ids: assigneeIds,
          title: form.title,
          due_date: form.due_date ?? null,
        });
        if (!actionItemTaskIsFor(mark, assigneeIds)) throw ALREADY_TASK;
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code === ALREADY_TASK.code) {
          onTaken();
        }
        throw error;
      }
    },
  };
}
