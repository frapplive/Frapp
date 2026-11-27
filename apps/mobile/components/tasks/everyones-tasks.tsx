import { Fragment, useCallback, useMemo, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import {
  TASK_CONFIRMED_LABEL,
  TASK_STATUS_LABELS,
  useTasks,
  useViewerUserId,
} from "@repo/hooks";
import { SECTION_NAMES } from "@repo/validation";
import type { SignetTokens } from "@repo/theme/signet";
import { GridLine, toGridChunks } from "@/components/grid-line";
import { InlineNote } from "@/components/inline-note";
import { ListLayoutToggle } from "@/components/list-layout-toggle";
import { SectionHeader } from "@/components/list-section";
import { useRefetchAll } from "@/components/pull-to-refresh";
import { ScreenShell, type ScreenViews } from "@/components/screen-shell";
import { ErrorState } from "@/components/state-block";
import { SuggestedTasksEntry } from "@/components/tasks/suggested-tasks-entry";
import {
  TaskListSkeleton,
  TaskRow,
  TaskTile,
} from "@/components/tasks/task-row";
import { UndoBar } from "@/components/tasks/undo-bar";
import { useListLayout } from "@/lib/list-layout";
import {
  EVERYONES_TASK_LANES,
  selectEveryonesTasks,
  type EveryonesTaskLane,
  type TaskRowModel,
} from "@/lib/tasks/board";
import { MarkDoneHost, useTaskToggle } from "@/lib/tasks/use-task-toggle";
import { useTaskMenu } from "@/lib/tasks/use-task-menu";
import { useMemberLabel } from "@/lib/tasks/use-member-label";
import { typeRole, useFrappTheme } from "@/lib/theme";

/** Each lane's heading: the shared status words, as web's lanes read. */
export const EVERYONES_LANE_LABELS: Record<EveryonesTaskLane, string> = {
  overdue: TASK_STATUS_LABELS.OVERDUE,
  todo: TASK_STATUS_LABELS.TODO,
  in_progress: TASK_STATUS_LABELS.IN_PROGRESS,
  completed: TASK_STATUS_LABELS.COMPLETED,
  confirmed: TASK_CONFIRMED_LABEL,
};

/** Said when the chapter has no task anyone could list. */
export const EVERYONES_TASKS_EMPTY = "No tasks in the chapter yet.";

/**
 * Activity's Everyone's view on the phone (#5948 slice 3, Paul's "two
 * homes" of 2026-11-24): the chapter's tasks by status, as a list or a grid,
 * with the suggestions from minutes at the top. Web's Everyone's is the same
 * board (`apps/web/components/tasks/tasks-board.tsx`, `part="everyone"`).
 *
 * Offered beside Activity's title (`ViewLabels`) to whoever `everyoneOffered`
 * lets see it: a `tasks:manage` holder, whose read is the chapter's whole
 * board, and a member who follows someone else's task (#5473). Mine stays
 * the member's own (To do, Running, Up for grabs).
 *
 * The phone's board was always personal (`selectTaskRows`), so this is new
 * rather than moved. Each row leads its meta line with whose task it is; a
 * press opens the task's screen, the box and the long press work as on the
 * member's own rows (`useTaskToggle`, `useTaskMenu`), each to the viewer the
 * API allows. Web's By person grouping and its Filter button are not on the
 * phone yet (#6198 holds them).
 *
 * Its own `ScreenShell`, swapped for Activity's while the view is on, so the
 * undo bar and the task menu's sheets sit outside the scroll as on the
 * board they came from.
 */
export function EveryonesTasks({
  views,
  refreshAlso = [],
}: {
  views: ScreenViews<"mine" | "everyone">;
  /** Activity's reads, so a pull here reads them too. */
  refreshAlso?: Parameters<typeof useRefetchAll>[0];
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const router = useRouter();
  const layout = useListLayout("tasks");
  const viewerUserId = useViewerUserId();
  const tasksQuery = useTasks();
  const refresh = useRefetchAll([tasksQuery, ...refreshAlso]);
  const nameOf = useMemberLabel();

  // Re-read on every return, so a task due today lands under the right day.
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      return undefined;
    }, []),
  );
  const board = useMemo(
    () => selectEveryonesTasks(tasksQuery.data, now),
    [tasksQuery.data, now],
  );
  const findRow = useCallback(
    (id: string | null): TaskRowModel | null =>
      id === null
        ? null
        : (EVERYONES_TASK_LANES.flatMap((lane) => board.lanes[lane]).find(
            (row) => row.id === id,
          ) ?? null),
    [board],
  );
  const toggles = useTaskToggle(findRow, {
    viewerId: viewerUserId,
    onActive: () => setNow(new Date()),
  });
  const { pendingId, refusal, notice, undo, canToggle, toggle, takeBack } =
    toggles;
  const [created, setCreated] = useState<string | null>(null);
  const taskMenu = useTaskMenu({ toggles, onCreated: setCreated });
  const { menuFor } = taskMenu;
  const openTask = useCallback(
    (id: string) => router.push({ pathname: "/task-details", params: { id } }),
    [router],
  );

  const renderRows = (rows: TaskRowModel[]) => {
    const props = (row: TaskRowModel) => ({
      row,
      now,
      isPending: pendingId === row.id,
      onToggle: canToggle(row) ? () => void toggle(row) : undefined,
      onOpen: () => openTask(row.id),
      menu: menuFor(row),
      who: row.assigneeId ? nameOf(row.assigneeId) : null,
    });
    if (layout === "grid") {
      return (
        <View style={styles.grid}>
          {toGridChunks(rows).map((line) => (
            <GridLine key={line[0]!.id} filled={line.length}>
              {line.map((row) => (
                <TaskTile key={row.id} {...props(row)} />
              ))}
            </GridLine>
          ))}
        </View>
      );
    }
    return (
      <View>
        {rows.map((row, index) => (
          <TaskRow key={row.id} {...props(row)} isFirst={index === 0} />
        ))}
      </View>
    );
  };

  function renderBoard() {
    if (tasksQuery.isPending) return <TaskListSkeleton />;
    if (tasksQuery.isError && tasksQuery.data === undefined) {
      return (
        <ErrorState
          title="Couldn't load the chapter's tasks"
          body={describeLoadFailure(tasksQuery.error)}
          onRetry={() => void tasksQuery.refetch()}
          isRetrying={tasksQuery.isFetching}
        />
      );
    }
    if (board.total === 0) {
      return <InlineNote>{EVERYONES_TASKS_EMPTY}</InlineNote>;
    }
    // Each lane only when it holds a task: on a phone an empty heading is a
    // scroll for nothing.
    return EVERYONES_TASK_LANES.map((lane) =>
      board.lanes[lane].length > 0 ? (
        <Fragment key={lane}>
          <SectionHeader count={board.lanes[lane].length}>
            {EVERYONES_LANE_LABELS[lane]}
          </SectionHeader>
          {renderRows(board.lanes[lane])}
        </Fragment>
      ) : null,
    );
  }

  return (
    <View style={styles.frame}>
      <ScreenShell
        title={SECTION_NAMES.activity}
        views={views}
        refresh={refresh}
        headerAction={<ListLayoutToggle screen="tasks" />}
      >
        {/* The suggestions from minutes lead, as web's strip does: one row
            while some wait for this officer. */}
        <SuggestedTasksEntry />
        {created ? <InlineNote>{created}</InlineNote> : null}
        {refusal ? <Text style={styles.refusal}>{refusal}</Text> : null}
        {notice && !refusal ? (
          <Text style={styles.refusal}>{notice}</Text>
        ) : null}
        {renderBoard()}
      </ScreenShell>
      {undo ? (
        <UndoBar
          key={undo.key}
          message={undo.message}
          onUndo={() => void takeBack(undo.id)}
        />
      ) : null}
      <MarkDoneHost toggle={toggles} />
      {taskMenu.host}
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    frame: { flex: 1 },
    grid: { gap: tokens.spacing.sm },
    refusal: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
  });
}
