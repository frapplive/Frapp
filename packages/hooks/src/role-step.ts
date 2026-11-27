import { isEveryoneRole } from "@repo/validation";
import { byDisplayOrder, type TieredRole } from "./role-tiers";

/*
 * Move up and Move down for a role (#6029), on web and the phone: which
 * `display_order` writes one step makes. Pure, so both apps share one copy
 * and its spec (`@repo/hooks/role-step`); each app sends the writes with its
 * own `useUpdateRole`.
 */

/** One write a step makes: the role's id and its new `display_order`. */
export type RoleStepWrite = { id: string; display_order: number };

/**
 * The list a role sits in, as Roles and groups draws it: its tier, or, when
 * it has none or names a tier this chapter doesn't have, outside the tiers,
 * where the roles members pick themselves (Non-chapter business) are a list
 * of their own.
 */
function listOf(role: TieredRole, tierIds: ReadonlySet<string>): string {
  if (role.tier_id && tierIds.has(role.tier_id)) return `tier:${role.tier_id}`;
  return role.self_assignable ? "pickable" : "outside";
}

/**
 * The writes that move `role` one place up (`-1`) or down (`1`) its own
 * list, or `null` when it has no neighbour that way (or is the Everyone role,
 * which is in no list and never written).
 *
 * - While the list's orders all differ, the role and its neighbour swap
 *   orders: two writes.
 * - Two roles added at once can share an order, and a swap would leave them
 *   where they were (a tie at 0 can't step below it either), so with any tie
 *   in the list it is numbered afresh in its new order from its lowest order,
 *   and only the roles whose order changes are written.
 */
export function planRoleStep(
  roles: readonly TieredRole[],
  tierIds: ReadonlySet<string>,
  role: TieredRole,
  by: -1 | 1,
): RoleStepWrite[] | null {
  if (isEveryoneRole(role)) return null;
  const key = listOf(role, tierIds);
  const list = roles
    .filter(
      (candidate) =>
        !isEveryoneRole(candidate) && listOf(candidate, tierIds) === key,
    )
    .sort(byDisplayOrder);
  const index = list.findIndex((candidate) => candidate.id === role.id);
  const neighbour = index < 0 ? undefined : list[index + by];
  if (!neighbour) return null;
  const current = list[index]!;

  const strictlyIncreasing = list.every(
    (candidate, position) =>
      position === 0 ||
      candidate.display_order > list[position - 1]!.display_order,
  );
  if (strictlyIncreasing) {
    return [
      { id: current.id, display_order: neighbour.display_order },
      { id: neighbour.id, display_order: current.display_order },
    ];
  }

  const reordered = [...list];
  reordered[index] = neighbour;
  reordered[index + by] = current;
  const start = list[0]!.display_order;
  const writes: RoleStepWrite[] = [];
  reordered.forEach((candidate, position) => {
    const next = start + position;
    if (candidate.display_order !== next) {
      writes.push({ id: candidate.id, display_order: next });
    }
  });
  return writes;
}
