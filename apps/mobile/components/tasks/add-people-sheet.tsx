import { useEffect, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { errorCopy } from "@repo/hooks/error-copy";
import { useAddToTaskGroup } from "@repo/hooks";
import { peopleToAdd } from "@repo/hooks/task-who-picker";
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
 * The screen mounts it when the plus is tapped, so the chapter's members are
 * read only then; it opens itself, and `onClose` fires once it has closed,
 * however it closed. Picks die with it, so one dismissed is never sent later.
 *
 * Not optimistic: the copies are rows the server makes. What it did, or why
 * it couldn't, goes to `onResult` for the Who has it note.
 */
export function AddPeopleSheet({
  taskId,
  holders,
  onSending,
  onResult,
  onClose,
}: {
  /** Any copy of the group. */
  taskId: string;
  /** Who already has a copy. */
  holders: readonly string[];
  /** An add went out; `onResult` follows once it is answered. */
  onSending: () => void;
  onResult: (line: string) => void;
  onClose: () => void;
}) {
  const sheet = useRef<BottomSheetModal>(null);
  const whoRead = useWhoDirectory({ groups: false });
  const add = useAddToTaskGroup();
  const [picked, setPicked] = useState<TaskWho | null>(null);
  const marked = new Set(holders);

  useEffect(() => {
    sheet.current?.present();
  }, []);

  const submit = async () => {
    const assigneeIds = peopleToAdd(picked, whoRead.directory, marked);
    if (assigneeIds.length === 0) {
      onResult(TASK_AUDIENCE_COPY.addedLine(0));
      return;
    }
    onSending();
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
      ref={sheet}
      title={TASK_AUDIENCE_COPY.addPeople}
      value={picked}
      onChange={setPicked}
      directory={whoRead.directory}
      people={whoRead.people}
      sets={whoRead.sets}
      onDismiss={onClose}
      add={{
        marked,
        alreadyNote: TASK_AUDIENCE_COPY.alreadyHasIt,
        label: TASK_AUDIENCE_COPY.addButton,
        onAdd: () => void submit(),
      }}
    />
  );
}
