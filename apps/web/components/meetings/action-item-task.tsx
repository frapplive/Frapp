"use client";

import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, ListPlus, Pencil } from "lucide-react";
import {
  useAcceptAiSuggestion,
  useAiSuggestions,
  useDismissAiSuggestion,
  useMembers,
  useSimilarTasks,
  type ExistingTask,
  type MeetingActionItemTask,
  type TaskSuggestionEdits,
} from "@repo/hooks";
import {
  AI_SUGGESTION_COPY,
  MINUTES_READ_COPY,
  SIMILAR_TASK_COPY,
  minutesActionSuggestions,
  sameTaskWho,
  type MeetingActionItem,
} from "@repo/validation";
import {
  SimilarTaskCard,
  SuggestionChips,
  SuggestionTaskForm,
  acceptBlocked,
  editsFor,
  isWaitingTask,
  rowValues,
  suggestionGuess,
  suggestionRefusalLine,
  type RowEdits,
  type RowValues,
  type WaitingSuggestion,
} from "@/components/ai/suggested-tasks";
import {
  ROW_REVEAL,
  RowMenu,
  type RowMenuEntry,
} from "@/components/shared/row-menu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/lib/hooks/use-toast";
import { tasksTaskLink } from "@/lib/tasks/task-links";
import { cn } from "@/lib/utils";

/**
 * Create task from any action item of posted minutes (#6051; Winston,
 * 2026-11-25, on a chapter's minutes with 19 action items: "i want to be
 * able to quick create tasks and assign people to it from the minutes doc
 * menu"). The suggested-task card at the top shows one item at a time; this
 * puts the same create on the item the officer is reading, the way Notion
 * and Linear make a task from a line of a doc with its assignee inline, and
 * Fellow assigns a meeting's action items from the list.
 *
 * It is a faster door onto the same path, not a second one: the row's
 * Create task accepts that item's waiting suggestion, with the card's own
 * chips, checks and form (`suggested-tasks.tsx`), so the task is made under
 * the officer's own permission, keeps the minutes' id, tells its assignees,
 * and the card stops offering it. A suggestion that reads like a task the
 * chapter already has asks first, as the card does. Only an item with a
 * waiting suggestion offers it, and the server lists a suggestion only to
 * someone who could accept it, so a member who can't manage tasks sees
 * nothing. An item already made a task offers Open task to an officer, who
 * may read it.
 *
 * Its controls: a small popover anchored to the row (Who, an optional Due,
 * Create task, and Change before creating, which opens the board's task form
 * under the row), reached from the row's Create task on hover or focus, and
 * from its right-click and ⋯ menu.
 */

/** What a row of the checklist hands its draw: its actions and what opens under it. */
export type ActionItemRowDraw = (
  actions: ReactNode,
  below: ReactNode,
) => ReactElement;

/** The checklist's hook for an item's row (`ActionChecklist`'s `taskRow`). */
export type ActionItemTaskRowRenderer = (
  row: {
    index: number;
    item: MeetingActionItem;
    task: MeetingActionItemTask | undefined;
  },
  draw: ActionItemRowDraw,
) => ReactElement;

/**
 * The rows' Create task and Open task for posted minutes: the waiting
 * suggestions read once for the page, each matched to its item, and the
 * open tasks each one reads like.
 */
export function useActionItemTaskRow({
  meetingId,
  items,
  meetingStart,
  enabled,
}: {
  meetingId: string;
  items: readonly MeetingActionItem[];
  meetingStart: string | null;
  /** Posted minutes, not being edited. */
  enabled: boolean;
}): ActionItemTaskRowRenderer | undefined {
  const suggestionsQuery = useAiSuggestions({
    source: { type: "meeting", id: meetingId },
    enabled,
  });
  const waiting = useMemo(
    () => (suggestionsQuery.data?.items ?? []).filter(isWaitingTask),
    [suggestionsQuery.data],
  );
  const byIndex = useMemo(
    () => minutesActionSuggestions(items, waiting),
    [items, waiting],
  );
  const similar = useSimilarTasks(enabled ? waiting : NONE);
  if (!enabled) return undefined;
  return function TaskRow(row, draw) {
    const suggestion = byIndex.get(row.index) ?? null;
    return (
      <ActionItemTaskRow
        key={row.index}
        item={row.item}
        suggestion={suggestion}
        twin={suggestion ? similar.twinOf(suggestion.id) : null}
        onDifferent={() => suggestion && similar.keep(suggestion.id)}
        taskId={row.task?.task?.id ?? null}
        meetingStart={meetingStart}
        draw={draw}
      />
    );
  };
}

const NONE: WaitingSuggestion[] = [];

function ActionItemTaskRow({
  item,
  suggestion,
  twin,
  onDifferent,
  taskId,
  meetingStart,
  draw,
}: {
  item: MeetingActionItem;
  suggestion: WaitingSuggestion | null;
  /** The open task the suggestion reads like, until the officer says. */
  twin: ExistingTask | null;
  onDifferent: () => void;
  taskId: string | null;
  meetingStart: string | null;
  draw: ActionItemRowDraw;
}) {
  const [creating, setCreating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [edits, setEdits] = useState<RowEdits>({});
  const accept = useAcceptAiSuggestion();
  const dismiss = useDismissAiSuggestion();
  const { toast } = useToast();
  const membersQuery = useMembers();
  const members = useMemo(
    () => (membersQuery.data ?? []).filter((member) => member.user_id),
    [membersQuery.data],
  );
  // A task the item already became wins over a suggestion: the card is
  // done with it.
  const waiting = taskId ? null : suggestion;
  const guess = useMemo(
    () => (waiting ? suggestionGuess(waiting, members, meetingStart) : null),
    [waiting, members, meetingStart],
  );

  if (!waiting && !taskId) return draw(null, null);

  const label = `More for ${item.text}`;
  if (!waiting) {
    const href = tasksTaskLink(taskId!);
    const entries: RowMenuEntry[] = [
      {
        type: "item",
        key: "open-task",
        label: MINUTES_READ_COPY.openTask,
        icon: ExternalLink,
        href,
      },
    ];
    return (
      <RowMenu entries={entries} label={label}>
        {(menuButton) =>
          draw(
            <>
              <Button
                asChild
                size="sm"
                variant="ghost"
                className={cn("shrink-0", ROW_REVEAL)}
              >
                <Link href={href}>{MINUTES_READ_COPY.openTask}</Link>
              </Button>
              {menuButton}
            </>,
            null,
          )
        }
      </RowMenu>
    );
  }

  const values = rowValues(waiting, edits, guess ?? undefined);
  const acceptWith = async (task: TaskSuggestionEdits | undefined) => {
    await accept.mutateAsync({ id: waiting.id, task });
  };
  /** Already a task: the suggestion is that task, and its item follows it. */
  async function link(existing: ExistingTask) {
    try {
      await acceptWith({ existing_task_id: existing.id });
      setCreating(false);
      toast({ title: SIMILAR_TASK_COPY.linked, description: existing.title });
    } catch (error) {
      toast({
        title: SIMILAR_TASK_COPY.linkFailed,
        description: suggestionRefusalLine(error),
        variant: "destructive",
      });
    }
  }
  async function dismissIt() {
    try {
      await dismiss.mutateAsync({ id: waiting!.id });
      setCreating(false);
    } catch (error) {
      toast({
        title: AI_SUGGESTION_COPY.dismissFailed,
        description: suggestionRefusalLine(error),
        variant: "destructive",
      });
    }
  }
  const entries: RowMenuEntry[] = [
    {
      type: "item",
      key: "create-task",
      label: AI_SUGGESTION_COPY.accept,
      icon: ListPlus,
      onSelect: () => setCreating(true),
    },
    {
      type: "item",
      key: "change",
      label: AI_SUGGESTION_COPY.change,
      icon: Pencil,
      onSelect: () => setFormOpen(true),
    },
  ];
  const busy = accept.isPending || dismiss.isPending;
  return (
    <RowMenu entries={entries} label={label}>
      {(menuButton) =>
        draw(
          <>
            <Popover open={creating} onOpenChange={setCreating}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn("shrink-0", ROW_REVEAL)}
                  aria-label={`${AI_SUGGESTION_COPY.accept}: ${item.text}`}
                >
                  {AI_SUGGESTION_COPY.accept}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className={cn("p-3", twin ? "w-[28rem]" : "w-80")}
                // Opened from the row's ⋯ menu, the menu hands focus back
                // to its ⋯ as it closes, outside this popover: that is not
                // the officer leaving it. A click outside still closes it.
                onFocusOutside={(event) => event.preventDefault()}
                // Portaled, but React bubbles its events to the row's
                // context-menu trigger, as `RowMenu`'s own ⋯ menu stops.
                onContextMenu={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {twin ? (
                  <SimilarTaskCard
                    item={waiting}
                    existing={twin}
                    disabled={busy}
                    pending={busy}
                    onSame={() => void link(twin)}
                    onDifferent={onDifferent}
                    onDismiss={() => void dismissIt()}
                  />
                ) : (
                  <QuickCreate
                    item={waiting}
                    values={values}
                    suggestedWho={
                      edits.who === undefined &&
                      !!guess?.who &&
                      sameTaskWho(values.who, guess.who)
                    }
                    suggestedDue={
                      edits.due === undefined &&
                      !!guess?.due &&
                      values.due === guess.due
                    }
                    onEdit={(patch) =>
                      setEdits((previous) => ({ ...previous, ...patch }))
                    }
                    pending={accept.isPending}
                    onCreate={async () => {
                      await acceptWith(editsFor(waiting, values));
                      setCreating(false);
                    }}
                    onMore={() => {
                      setCreating(false);
                      setFormOpen(true);
                    }}
                  />
                )}
              </PopoverContent>
            </Popover>
            {menuButton}
          </>,
          formOpen ? (
            <div className="mt-2">
              <SuggestionTaskForm
                item={waiting}
                values={values}
                onClose={() => setFormOpen(false)}
                acceptWith={acceptWith}
              />
            </div>
          ) : null,
        )
      }
    </RowMenu>
  );
}

/**
 * The popover's few fields: the card's own who and when chips (pre-picked
 * from the minutes, or Frapp's dashed suggestion), Create task, which Enter
 * presses too, and Change before creating.
 */
function QuickCreate({
  item,
  values,
  suggestedWho,
  suggestedDue,
  onEdit,
  pending,
  onCreate,
  onMore,
}: {
  item: WaitingSuggestion;
  values: RowValues;
  suggestedWho: boolean;
  suggestedDue: boolean;
  onEdit: (patch: RowEdits) => void;
  pending: boolean;
  onCreate: () => Promise<void>;
  onMore: () => void;
}) {
  const { toast } = useToast();
  const [flagged, setFlagged] = useState(false);
  const { task } = item;

  async function submit() {
    if (acceptBlocked(item, values)) {
      setFlagged(true);
      return;
    }
    try {
      await onCreate();
      toast({ title: AI_SUGGESTION_COPY.created, description: task.title });
    } catch (error) {
      toast({
        title: AI_SUGGESTION_COPY.acceptFailed,
        description: suggestionRefusalLine(error),
        variant: "destructive",
      });
    }
  }

  return (
    <form
      aria-label={`${AI_SUGGESTION_COPY.accept}: ${task.title}`}
      aria-busy={pending || undefined}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="line-clamp-2 break-words text-sm font-medium">
        {task.title}
      </p>
      <SuggestionChips
        item={item}
        values={values}
        suggestedWho={suggestedWho}
        suggestedDue={suggestedDue}
        flagged={flagged}
        disabled={pending}
        onEdit={onEdit}
        idPrefix={`${item.id}-row`}
      />
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={onMore}
        >
          {AI_SUGGESTION_COPY.change}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? AI_SUGGESTION_COPY.accepting : AI_SUGGESTION_COPY.accept}
        </Button>
      </div>
    </form>
  );
}
