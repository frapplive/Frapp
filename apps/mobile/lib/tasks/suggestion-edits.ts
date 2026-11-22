import type { AiSuggestion, TaskSuggestionEdits } from "@repo/hooks";
import {
  sameTaskWho,
  taskWhoOf,
  taskWhoSuggestionFields,
} from "@repo/validation";
import type { ValidatedNewTask } from "@/lib/tasks/create-task";

type SuggestedTask = NonNullable<AiSuggestion["task"]>;

/** Only what the officer changed in the form, as the accept route takes it. */
export function suggestionEdits(
  task: SuggestedTask,
  form: ValidatedNewTask,
  options: { full?: boolean } = {},
): TaskSuggestionEdits | undefined {
  const edits: TaskSuggestionEdits = {};
  if (form.title !== task.title) edits.title = form.title;
  // One answer to Who? (2026-11-18): a member, several, a role, a group or
  // everyone, each doing it or one claiming it. Changed, every who-field
  // goes, so the edit replaces the whole answer.
  if (!sameTaskWho(form.who, taskWhoOf(task))) {
    Object.assign(edits, taskWhoSuggestionFields(form.who));
  }
  const dueAt = form.due_at ?? null;
  if (form.due_date !== task.due_date || dueAt !== task.due_at) {
    edits.due_date = form.due_date;
    edits.due_at = dueAt;
  }
  const steps = form.subtasks ?? [];
  if (
    steps.length !== task.subtasks.length ||
    steps.some((step, index) => step !== task.subtasks[index])
  ) {
    edits.subtasks = steps;
  }
  // Points, proof and From (2026-11-22): only a form that offered them (an
  // Ask Frapp card's, `full`) can change them; a minutes suggestion's sends
  // none, so it never clears what it didn't show.
  if (!options.full) {
    return Object.keys(edits).length > 0 ? edits : undefined;
  }
  const points = form.point_reward ?? null;
  if (points !== (task.point_reward ?? null)) edits.point_reward = points;
  const proof = form.proof_kind ?? "none";
  if (proof !== (task.proof_kind ?? "none")) edits.proof_kind = proof;
  const from = form.followed_by ?? null;
  if (from !== (task.followed_by ?? null)) edits.followed_by = from;
  return Object.keys(edits).length > 0 ? edits : undefined;
}
