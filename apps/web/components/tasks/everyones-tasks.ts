import { useMemo } from "react";
import { useCurrentUser, useMyPermissions, useTasks } from "@repo/hooks";
import { can } from "@repo/validation";
import { asArray } from "@/lib/utils";
import type { BoardTask } from "./board-task";

/**
 * Whether Activity offers Everyone's beside Mine (#5948): the chapter's task
 * board, by status or by person.
 *
 * - A `tasks:manage` holder: `GET /v1/tasks` serves them the chapter's whole
 *   board (`TaskController.list`).
 * - A member who follows someone else's task (#5473, a tier, role or group
 *   they're in follows it): their read holds those tasks, which Activity's To
 *   do (the member's own) never lists, so Everyone's is where they stay
 *   (everything the member can read). Without it, folding the Tasks page in
 *   would have lost them.
 *
 * Anyone else has only their own, which is Mine, so no labels are drawn. A
 * member's read holds only their own and followed tasks; View as a role keeps
 * the officer's whole read, which `every` keeps from reading as a follower's.
 */
export function everyoneOffered({
  canManage,
  permissionsKnown,
  viewerId,
  tasks,
}: {
  canManage: boolean;
  permissionsKnown: boolean;
  viewerId: string;
  tasks: readonly Pick<BoardTask, "assignee_id" | "followed_by">[];
}): boolean {
  if (canManage) return true;
  if (!permissionsKnown || viewerId === "") return false;
  return (
    tasks.some((task) => !!task.followed_by && task.assignee_id !== viewerId) &&
    tasks.every((task) => task.assignee_id === viewerId || !!task.followed_by)
  );
}

/**
 * `everyoneOffered` from the reads the board and Activity share. The task read
 * runs only when it can change the answer: with Tasks on (the module guard
 * refuses `GET /v1/tasks` otherwise), permissions known, and no
 * `tasks:manage`, whose holder is offered Everyone's without it (and whose
 * read is the chapter's whole board).
 */
export function useEveryoneOffered(tasksOn: boolean): boolean {
  const permissions = useMyPermissions();
  const currentUser = useCurrentUser();
  const canManage = can("tasks:manage", permissions.data?.permissions);
  const permissionsKnown = permissions.data !== undefined;
  const tasksQuery = useTasks({
    enabled: tasksOn && permissionsKnown && !canManage,
  });
  const viewerId = (currentUser.data as { id?: string } | undefined)?.id ?? "";
  const tasks = useMemo(
    () => asArray<BoardTask>(tasksQuery.data),
    [tasksQuery.data],
  );
  if (!tasksOn) return false;
  return everyoneOffered({
    canManage,
    permissionsKnown,
    viewerId,
    tasks,
  });
}
