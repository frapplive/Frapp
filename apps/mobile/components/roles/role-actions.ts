import { useState } from "react";
import { useDeleteRole, useUpdateRole } from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import { planRoleStep } from "@repo/hooks/role-step";
import {
  isWildcardRole,
  reachesOutside,
  reachesRole,
  reachesTier,
  type TieredRole,
} from "@repo/hooks/role-tiers";
import {
  deleteRoleConfirm,
  isActiveRole,
  isEveryoneRole,
  outsideTiersHeading,
  PEOPLE_SETTINGS_COPY,
} from "@repo/validation";
import type { ItemMenu, ItemMenuAction } from "@/components/item-actions-menu";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import type { RolesData } from "@/lib/roles/use-roles-data";

/** A role write that failed, said on the role's own row (no toast here). */
type RoleFailure = { roleId: string; message: string } | null;

const MOVE_FAILED = "The role stayed where it was. Try again in a moment.";

/**
 * What an officer can do to a role from its row's long-press menu on Roles
 * and groups and from the ⋯ on its page (#6029), the same entries web's row
 * ⋯ and page ⋯ hold: Move up and Move down within its own list
 * (`planRoleStep`, shared with web), Move to another tier or out of the
 * tiers (the row's menu only, as on web; the page moves a role with its
 * Tier row, which saves on its own), and Delete role, which asks first.
 *
 * The phone's menu has no disabled row, so an entry the rank rules refuse
 * is left out rather than greyed (`@repo/hooks/role-tiers`). The API stays
 * the authority: a refusal it sends anyway lands as `failure`, under the
 * role's row or the page's title.
 */
export function useRoleActions(data: RolesData) {
  const { roles, tiers, reach, canManage, words } = data;
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const [failure, setFailure] = useState<RoleFailure>(null);
  // One step at a time: a second Move built from the list before the first
  // one's writes land would interleave with them (web's `useStepRole`).
  const [stepping, setStepping] = useState(false);
  const tierIds = new Set(tiers.map((tier) => tier.id));
  const byId = new Map(roles.map((role) => [role.id, role]));

  async function attempt(
    role: TieredRole,
    action: () => Promise<unknown>,
    fallback: string,
  ): Promise<boolean> {
    setFailure(null);
    try {
      await action();
      return true;
    } catch (error) {
      setFailure({
        roleId: role.id,
        message: `Couldn't change ${role.name}. ${errorCopy(error, fallback, { serverWritesForMembers: true })}`,
      });
      return false;
    }
  }

  const editable = (role: TieredRole) =>
    canManage && reachesRole(reach, role, tiers) && !isEveryoneRole(role);

  // A step writes its neighbour too (every role in the list, on a tie):
  // offered only when the officer reaches each one, as on web, so the API
  // never refuses half a swap. The President role is no one's to edit, but
  // a wildcard caller may still move it past a neighbour.
  const writable = (role: TieredRole) =>
    canManage &&
    (isWildcardRole(role) ? reach.wildcard : reachesRole(reach, role, tiers));

  function stepPlan(role: TieredRole, by: -1 | 1) {
    if (stepping) return null;
    const writes = planRoleStep(roles, tierIds, role, by);
    if (!writes) return null;
    return writes.every((write) => {
      const target = byId.get(write.id);
      return !!target && writable(target);
    })
      ? writes
      : null;
  }

  function step(role: TieredRole, by: -1 | 1) {
    const writes = stepPlan(role, by);
    if (!writes) return;
    setStepping(true);
    void attempt(
      role,
      async () => {
        for (const write of writes) {
          await updateRole.mutateAsync({
            id: write.id,
            body: { display_order: write.display_order },
          });
        }
      },
      MOVE_FAILED,
    ).finally(() => setStepping(false));
  }

  function moveTo(role: TieredRole, tierId: string | null) {
    void attempt(
      role,
      () => updateRole.mutateAsync({ id: role.id, body: { tier_id: tierId } }),
      MOVE_FAILED,
    );
  }

  /** Asks, then deletes; resolves true once the role is gone. */
  async function remove(role: TieredRole): Promise<boolean> {
    const words = deleteRoleConfirm(role.name);
    const ok = await confirmAlert({
      title: words.title,
      body: words.body,
      confirmLabel: words.action,
      destructive: true,
    });
    if (!ok) return false;
    return attempt(
      role,
      () => deleteRole.mutateAsync(role.id),
      "Remove the role from its members first, or try again in a moment.",
    );
  }

  /** Move up and Move down, where the role has a neighbour that way. */
  function stepActions(role: TieredRole): ItemMenuAction[] {
    if (!editable(role)) return [];
    const actions: ItemMenuAction[] = [];
    if (stepPlan(role, -1)) {
      actions.push({
        key: "up",
        label: PEOPLE_SETTINGS_COPY.moveUp,
        run: () => step(role, -1),
      });
    }
    if (stepPlan(role, 1)) {
      actions.push({
        key: "down",
        label: PEOPLE_SETTINGS_COPY.moveDown,
        run: () => step(role, 1),
      });
    }
    return actions;
  }

  /** Delete role, for a role the chapter made. */
  function deleteActions(
    role: TieredRole,
    onDeleted?: () => void,
  ): ItemMenuAction[] {
    if (!editable(role) || role.is_system) return [];
    return [
      {
        key: "delete",
        label: PEOPLE_SETTINGS_COPY.deleteRole,
        destructive: true,
        run: () =>
          void remove(role).then((gone) => {
            if (gone) onDeleted?.();
          }),
      },
    ];
  }

  /** A role row's long-press menu, or `null` when it offers nothing. */
  function rowMenu(role: TieredRole): ItemMenu | null {
    if (!editable(role)) return null;
    // A Non-chapter business role can't sit in a tier (#4958), and Actives
    // (#5802) stays in its tier, as the API holds them.
    const movable = !role.self_assignable && !isActiveRole(role);
    // A tier_id naming a missing tier reads as outside, as the list shows it.
    const tierId =
      role.tier_id && tierIds.has(role.tier_id) ? role.tier_id : null;
    const moves: ItemMenuAction[] = movable
      ? [
          ...tiers
            .filter((tier) => tier.id !== tierId && reachesTier(reach, tier))
            .map((tier) => ({
              key: `move-${tier.id}`,
              label: `Move to ${tier.name}`,
              run: () => moveTo(role, tier.id),
            })),
          ...(tierId !== null && reachesOutside(reach)
            ? [
                {
                  key: "move-outside",
                  label: `Move to ${outsideTiersHeading(words.plural)}`,
                  run: () => moveTo(role, null),
                },
              ]
            : []),
        ]
      : [];
    const actions = [...stepActions(role), ...moves, ...deleteActions(role)];
    return actions.length > 0 ? { title: role.name, actions } : null;
  }

  return {
    failure,
    clearFailure: () => setFailure(null),
    editable,
    stepActions,
    deleteActions,
    rowMenu,
  };
}
