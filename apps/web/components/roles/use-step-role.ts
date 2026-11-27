"use client";

import { useState } from "react";
import { useUpdateRole } from "@repo/hooks";
import { planRoleStep, type RoleStepWrite } from "@repo/hooks/role-step";
import type { TieredRole } from "@repo/hooks/role-tiers";

/**
 * Move a role one place up or down its own list (its tier, outside the
 * tiers, or Non-chapter business): Move up and Move down in the role row's ⋯
 * and the role page's ⋯ (#6029). Which roles change and to what is
 * `planRoleStep`, the phone's too; this sends its writes one after another.
 *
 * A step is offered only when the officer can reach every role it writes
 * (`canWrite`, the rank rules), so the API never refuses half a swap, and
 * not while another step is still saving, so two never interleave.
 */
export function useStepRole(
  roles: readonly TieredRole[],
  tiers: readonly { id: string }[],
  canWrite: (role: TieredRole) => boolean,
) {
  const updateRole = useUpdateRole();
  const [busy, setBusy] = useState(false);

  function plan(role: TieredRole, by: -1 | 1): RoleStepWrite[] | null {
    return planRoleStep(roles, new Set(tiers.map((tier) => tier.id)), role, by);
  }

  function canStep(role: TieredRole, by: -1 | 1): boolean {
    if (busy) return false;
    const writes = plan(role, by);
    if (!writes) return false;
    const byId = new Map(roles.map((candidate) => [candidate.id, candidate]));
    return writes.every((write) => {
      const target = byId.get(write.id);
      return !!target && canWrite(target);
    });
  }

  async function step(role: TieredRole, by: -1 | 1): Promise<void> {
    if (!canStep(role, by)) return;
    const writes = plan(role, by) ?? [];
    setBusy(true);
    try {
      for (const write of writes) {
        await updateRole.mutateAsync({
          id: write.id,
          body: { display_order: write.display_order },
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return { canStep, step, pending: busy };
}
