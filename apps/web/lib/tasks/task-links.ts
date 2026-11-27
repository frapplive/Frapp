import { WEB_ADDRESS_PARAMS } from "@repo/validation";
/**
 * The links that open a task in the task panel (#5538). The Tasks page
 * folded into Activity (#5948), so they are Activity's:
 * `/activity?group=<group id>` opens a task for everyone, since the task
 * panel is the one place on web that shows a group
 * (`spec/behavior/tasks.md` § Tasks for everyone), and
 * `/activity?task=<task id>` opens that task, or its group when it is a copy
 * of one. The board's parts read either param once their read holds the task
 * (`TasksBoard`'s `LinkedTaskParam`) and drop it from the address.
 *
 * `/tasks` only redirects here, keeping either param
 * (`app/(dashboard)/tasks/page.tsx`), so an old link, bookmark or
 * notification still opens its task.
 */
export const TASKS_GROUP_PARAM = WEB_ADDRESS_PARAMS.activity.group;
export const TASKS_TASK_PARAM = WEB_ADDRESS_PARAMS.activity.task;

/** `?view=everyone`: Activity opens on Everyone's (`activity-page.tsx`). */
export const ACTIVITY_VIEW_PARAM = WEB_ADDRESS_PARAMS.activity.view;
export const EVERYONES_VIEW = "everyone";

/** `/activity?group=<id>`: that group open in the task panel. */
export function tasksGroupLink(groupId: string): string {
  const params = new URLSearchParams({ [TASKS_GROUP_PARAM]: groupId });
  return `/activity?${params.toString()}`;
}

/** `/activity?task=<id>`: that task (or its group) open in the task panel. */
export function tasksTaskLink(taskId: string): string {
  const params = new URLSearchParams({ [TASKS_TASK_PARAM]: taskId });
  return `/activity?${params.toString()}`;
}

/** `/activity?view=everyone`: the chapter's tasks, for whoever is offered them. */
export function everyonesTasksLink(): string {
  const params = new URLSearchParams({ [ACTIVITY_VIEW_PARAM]: EVERYONES_VIEW });
  return `/activity?${params.toString()}`;
}

/**
 * Where an old `/tasks` address goes: Activity, with the link's `task` or
 * `group` kept, and New task's `?new=1` (`new-intent.ts`), which Activity's
 * Mine answers as the page did. Any other param the old page read is dropped.
 */
export function tasksRedirectPath(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const kept = new URLSearchParams();
  // `new` is `NEW_INTENT_PARAM`, spelled out: that module is a client one,
  // and this runs in the redirect's server component.
  for (const key of [TASKS_TASK_PARAM, TASKS_GROUP_PARAM, "new"]) {
    const value = searchParams[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first) kept.set(key, first);
  }
  const query = kept.toString();
  return query ? `/activity?${query}` : "/activity";
}
