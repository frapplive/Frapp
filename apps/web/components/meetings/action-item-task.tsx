"use client";

import {
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ExternalLink, ListPlus, Pencil } from "lucide-react";
import {
  actionItemTaskIsFor,
  useAcceptAiSuggestion,
  useAiSuggestions,
  useCanManageTasks,
  useDismissAiSuggestion,
  useMakeActionItemTask,
  useMembers,
  useSimilarTasks,
  type ExistingTask,
  type MeetingActionItemTask,
  type TaskSuggestionEdits,
} from "@repo/hooks";
import { codeOf } from "@repo/api-sdk";
import { dueEntryFields } from "@repo/formatting";
import {
  AI_SUGGESTION_COPY,
  MINUTES_READ_COPY,
  SIMILAR_TASK_COPY,
  actionItemTaskRefusalLine,
  minutesActionMakeable,
  minutesActionSuggestions,
  sameTaskWho,
  taskWhoPeopleIds,
  type MeetingActionItem,
  type TaskWho,
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
import { DueChip } from "@/components/tasks/due-date-field";
import { WhoPicker } from "@/components/tasks/who-picker";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/lib/hooks/use-toast";
import { tasksTaskLink } from "@/lib/tasks/task-links";
import { cn, getErrorMessage } from "@/lib/utils";

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
 * An item with no suggestion waiting (an officer already went through the
 * review or dismissed it, it expired, or suggestions were off) offers the
 * same Create task to an officer who manages tasks (#6178; Winston,
 * 2026-11-25: "i cant assign anyone to anything"). Its popover picks people
 * only, one or several each getting a copy, since the item's own route
 * (`POST /v1/meetings/:id/action-items/:index/task`, #6176) takes members,
 * with an optional day; the route accepts a suggestion that turned up
 * meanwhile rather than make a second task.
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
  marks,
}: {
  meetingId: string;
  items: readonly MeetingActionItem[];
  meetingStart: string | null;
  /** Posted minutes, not being edited. */
  enabled: boolean;
  /**
   * The items' marks once read (`useMeetingActionItemTasks`), by place;
   * undefined until then, when no item is offered a create of its own.
   */
  marks: ReadonlyMap<number, MeetingActionItemTask> | undefined;
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
  const canMake = useCanManageTasks();
  const makeable = useMemo(
    () => minutesActionMakeable(items, marks),
    [items, marks],
  );
  // Items the server said are a task already with no mark to show for it
  // (accepted up for grabs and not yet claimed, #5508): not offered again.
  const [taken, setTaken] = useState<ReadonlySet<number>>(() => new Set());
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
        make={
          canMake && makeable.has(row.index) && !taken.has(row.index)
            ? {
                meetingId,
                index: row.index,
                onTaken: () =>
                  setTaken((previous) => new Set(previous).add(row.index)),
              }
            : null
        }
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
  make,
}: {
  item: MeetingActionItem;
  suggestion: WaitingSuggestion | null;
  /** The open task the suggestion reads like, until the officer says. */
  twin: ExistingTask | null;
  onDifferent: () => void;
  taskId: string | null;
  meetingStart: string | null;
  draw: ActionItemRowDraw;
  /**
   * Where the item's own create goes: for an officer who manages tasks, on
   * an item with no mark (`minutesActionMakeable`).
   */
  make: MakeTarget | null;
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

  if (!waiting && !taskId) {
    return make ? (
      <MakeTaskRow item={item} make={make} draw={draw} />
    ) : (
      draw(null, null)
    );
  }

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
            <RowCreatePopover
              open={creating}
              onOpenChange={setCreating}
              itemText={item.text}
              wide={!!twin}
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
            </RowCreatePopover>
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

/** Where an item's own create goes, and what to do once it can't be. */
interface MakeTarget {
  meetingId: string;
  index: number;
  /** The server said the item is a task already, with no mark to show. */
  onTaken: () => void;
}

/**
 * The row's Create task and its small popover: shared by an item with a
 * suggestion waiting and one without (#6178), so a fix to its guards
 * reaches both.
 */
function RowCreatePopover({
  open,
  onOpenChange,
  itemText,
  wide = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemText: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={cn("shrink-0", ROW_REVEAL)}
          aria-label={`${AI_SUGGESTION_COPY.accept}: ${itemText}`}
        >
          {AI_SUGGESTION_COPY.accept}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn("p-3", wide ? "w-[28rem]" : "w-80")}
        // Opened from the row's ⋯ menu, the menu hands focus back to its ⋯
        // as it closes, outside this popover: that is not the officer
        // leaving it. A click outside still closes it.
        onFocusOutside={(event) => event.preventDefault()}
        // Portaled, but React bubbles its events to the row's context-menu
        // trigger, as `RowMenu`'s own ⋯ menu stops.
        onContextMenu={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Create task on an item with no suggestion waiting (#6178): Who (people
 * only) and an optional day, prefilled from what the minutes said, then
 * Create task, sent to the item's own route with its text, so an edit to
 * the minutes meanwhile is refused rather than the wrong item made a task.
 */
function MakeTaskRow({
  item,
  make,
  draw,
}: {
  item: MeetingActionItem;
  make: MakeTarget;
  draw: ActionItemRowDraw;
}) {
  const [creating, setCreating] = useState(false);
  const entries: RowMenuEntry[] = [
    {
      type: "item",
      key: "create-task",
      label: AI_SUGGESTION_COPY.accept,
      icon: ListPlus,
      onSelect: () => setCreating(true),
    },
  ];
  return (
    <RowMenu entries={entries} label={`More for ${item.text}`}>
      {(menuButton) =>
        draw(
          <>
            <RowCreatePopover
              open={creating}
              onOpenChange={setCreating}
              itemText={item.text}
            >
              <MakeTaskForm
                item={item}
                make={make}
                onDone={() => setCreating(false)}
              />
            </RowCreatePopover>
            {menuButton}
          </>,
          null,
        )
      }
    </RowMenu>
  );
}

function MakeTaskForm({
  item,
  make: target,
  onDone,
}: {
  item: MeetingActionItem;
  make: MakeTarget;
  onDone: () => void;
}) {
  const make = useMakeActionItemTask();
  const { toast } = useToast();
  // Who the minutes named, and the day they gave, as the fields start.
  const named: TaskWho | null = item.owner_user_id
    ? { kind: "person", userId: item.owner_user_id }
    : null;
  const [who, setWho] = useState<TaskWho | null>(named);
  // The people picker drops its picks when closed without Done; here that
  // keeps what was there before it opened, the minutes' owner included.
  const kept = useRef<TaskWho | null>(named);
  const [due, setDue] = useState(item.due_date ?? "");
  const [flagged, setFlagged] = useState(false);
  const assigneeIds = taskWhoPeopleIds(who);
  const missingWho = flagged && !assigneeIds;
  const whoId = `action-item-${target.index}-make-who`;

  async function submit() {
    if (!assigneeIds) {
      setFlagged(true);
      return;
    }
    try {
      const mark = await make.mutateAsync({
        meetingId: target.meetingId,
        index: target.index,
        body: {
          text: item.text,
          assignee_ids: assigneeIds,
          due_date: due ? dueEntryFields(due).due_date : null,
        },
      });
      onDone();
      // An item already a task is answered with that task, unchanged.
      toast(
        actionItemTaskIsFor(mark, assigneeIds)
          ? { title: AI_SUGGESTION_COPY.created, description: item.text }
          : {
              title: actionItemTaskRefusalLine(
                "meeting.action_item.already_task",
              )!,
              description: item.text,
            },
      );
    } catch (error) {
      const code = codeOf(error);
      const refused = actionItemTaskRefusalLine(code);
      // Refused for good: the marks are read again, so the row redraws as
      // it now stands; one the read still can't show isn't offered again.
      if (refused) onDone();
      if (code === "meeting.action_item.already_task") target.onTaken();
      toast({
        title: AI_SUGGESTION_COPY.acceptFailed,
        description:
          refused ?? getErrorMessage(error, AI_SUGGESTION_COPY.tryAgain),
        variant: "destructive",
      });
    }
  }

  return (
    <form
      aria-label={`${AI_SUGGESTION_COPY.accept}: ${item.text}`}
      aria-busy={make.isPending || undefined}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="line-clamp-2 break-words text-sm font-medium">
        {item.text}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <WhoPicker
          chip
          allow="people"
          label={`Assignee for ${item.text}`}
          placeholder={AI_SUGGESTION_COPY.who}
          value={who}
          onChange={(next) => setWho(next ?? kept.current)}
          doneLabel={() => "Done"}
          onDone={() => {
            kept.current = who;
          }}
          disabled={make.isPending}
          invalid={missingWho}
          aria-describedby={missingWho ? whoId : undefined}
        />
        <DueChip
          withoutTime
          label={`Due date for ${item.text}`}
          placeholder={AI_SUGGESTION_COPY.when}
          value={due}
          onChange={setDue}
          disabled={make.isPending}
        />
      </div>
      {missingWho ? (
        <p
          id={whoId}
          role="alert"
          className="text-caption text-destructive-text"
        >
          {AI_SUGGESTION_COPY.missingWho}
        </p>
      ) : null}
      <div className="flex items-center justify-end">
        <Button type="submit" size="sm" disabled={make.isPending}>
          {make.isPending
            ? AI_SUGGESTION_COPY.accepting
            : AI_SUGGESTION_COPY.accept}
        </Button>
      </div>
    </form>
  );
}
