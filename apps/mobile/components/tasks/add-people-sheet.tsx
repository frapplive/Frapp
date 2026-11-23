import { forwardRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { errorCopy } from "@repo/hooks/error-copy";
import { useAddToTaskGroup } from "@repo/hooks";
import { tickedIds } from "@repo/hooks/task-who-picker";
import { TASK_AUDIENCE_COPY, type TaskWho } from "@repo/validation";
import { WhoPickerSheet } from "@/components/tasks/who-picker-sheet";
import { useWhoDirectory } from "@/lib/tasks/use-who-directory";

/**
 * Add people to a group task (#5905): the Who picker for people only, with
 * everyone who already has a copy ticked and fixed, and an Add button that
 * gives each one picked a To do copy (`POST /v1/tasks/:id/group/add`). The
 * mirror of Remove people. Asana's and Microsoft Planner's assignee menus add
 * people to a task that exists; here each gets their own copy.
 *
 * Not optimistic: the copies are rows the server makes. What it did, or why
 * it couldn't, goes to `onResult` for the Who has it note.
 */
export const AddPeopleSheet = forwardRef<
  BottomSheetModal,
  {
    /** Any copy of the group. */
    taskId: string;
    /** Who already has a copy. */
    holders: readonly string[];
    onResult: (line: string) => void;
  }
>(function AddPeopleSheet({ taskId, holders, onResult }, ref) {
  const whoRead = useWhoDirectory({ groups: false });
  const add = useAddToTaskGroup();
  const [picked, setPicked] = useState<TaskWho | null>(null);
  const marked = new Set(holders);

  const submit = async () => {
    const assigneeIds = tickedIds(picked, whoRead.directory).filter(
      (userId) => !marked.has(userId),
    );
    setPicked(null);
    if (assigneeIds.length === 0) return;
    try {
      const result = await add.mutateAsync({ id: taskId, assigneeIds });
      onResult(TASK_AUDIENCE_COPY.addedLine(result.added.length));
    } catch (error) {
      onResult(
        errorCopy(error, TASK_AUDIENCE_COPY.addFailed, {
          serverWritesForMembers: true,
        }),
      );
    }
  };

  return (
    <WhoPickerSheet
      ref={ref}
      title={TASK_AUDIENCE_COPY.addPeople}
      value={picked}
      onChange={setPicked}
      directory={whoRead.directory}
      people={whoRead.people}
      sets={whoRead.sets}
      add={{
        marked,
        alreadyNote: TASK_AUDIENCE_COPY.alreadyHasIt,
        label: TASK_AUDIENCE_COPY.addButton,
        onAdd: () => void submit(),
      }}
    />
  );
});
