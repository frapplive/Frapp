import type { AiSuggestion } from "@repo/hooks";
import { taskWhoOf } from "@repo/validation";
import type { TaskSuggestionSeed } from "@/components/tasks/new-task-sheet";
import type { ValidatedNewTask } from "@/lib/tasks/create-task";
import { suggestionEdits } from "@/lib/tasks/suggestion-edits";

type SuggestedTask = NonNullable<AiSuggestion["task"]>;

/**
 * The task form opened on a suggested task, which accepts it with only what
 * the officer changed: the Suggested tasks card's Change before creating, and
 * an action item's Create task on posted minutes (#6051), so both make the
 * same task.
 */
export function suggestionSeed(
  item: { id: string; task: SuggestedTask },
  accept: (decision: {
    id: string;
    task: ReturnType<typeof suggestionEdits>;
  }) => Promise<unknown>,
): TaskSuggestionSeed {
  return {
    title: item.task.title,
    // One member, several, a role, a group or everyone, each doing it or one
    // claiming it (2026-11-18).
    who: taskWhoOf(item.task),
    dueDay: item.task.due_date,
    dueAt: item.task.due_at,
    subtasks: item.task.subtasks,
    accept: async (form: ValidatedNewTask) => {
      await accept({ id: item.id, task: suggestionEdits(item.task, form) });
    },
  };
}
