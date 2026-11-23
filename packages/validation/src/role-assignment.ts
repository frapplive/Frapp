/**
 * Giving a member a role: the rule the API enforces and both apps predict
 * (`spec/behavior/rbac.md` § Rank, #5730), kept in one place so the "+ Add"
 * list and the API can't disagree about what an officer may give.
 */
import { isEveryoneRole, type EveryoneSaveRole } from "./everyone-role";

/**
 * A role ranked at or above the caller (`canAssignAt`), or a member ranked
 * above them (`canAssignToMemberAt`; a peer is reachable since #5843).
 */
export const ROLE_ASSIGN_OUT_OF_REACH_CODE = "role.assign_out_of_reach";

/** A role carrying a permission the caller doesn't hold. */
export const ROLE_ASSIGN_PERMISSION_NOT_HELD_CODE =
  "role.assign_permission_not_held";

/**
 * What giving `granted` would hand out that the caller doesn't hold, sorted
 * and distinct: nobody gives a permission they lack, to anyone, since a
 * second account would otherwise collect it. What the chapter's Everyone role
 * carries is exempt, since every member has it, and a `*` holder holds
 * everything.
 */
export function permissionsNotGivable(
  caller: { wildcard: boolean; held: ReadonlySet<string> },
  granted: Iterable<string>,
  roles: readonly EveryoneSaveRole[],
): string[] {
  if (caller.wildcard) return [];
  const everyone = new Set(roles.find(isEveryoneRole)?.permissions ?? []);
  return [...new Set(granted)]
    .filter((p) => !caller.held.has(p) && !everyone.has(p))
    .sort();
}
