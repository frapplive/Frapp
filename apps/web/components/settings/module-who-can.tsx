"use client";

import { useMemo, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineNote } from "@/components/shared/inline-note";
import { FOCUS_RING } from "@/components/ui/focus";
import { SearchablePicker } from "@/components/shared/searchable-picker";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import {
  useRolePermissionToggle,
  useTierPermissionToggle,
} from "@/components/roles/use-role-permission-toggle";
import { useRolesData } from "@/components/roles/use-roles-data";
import {
  byDisplayOrder,
  isWildcardRole,
  mayGrant,
  reachesRole,
  reachesTier,
  type TierRow,
  type TieredRole,
} from "@repo/hooks/role-tiers";
import { CANT_GIVE } from "@repo/hooks/use-roles-data";
import {
  modulePermissions,
  whoCanHolders,
  whoCanPageId,
  whoCanSummary,
} from "@repo/hooks/module-settings";
import { WHO_CAN_FOOTNOTE, WHO_CAN_ROLES_FOOTNOTE } from "@repo/validation";

/**
 * A module page's Who can (#4073, in the settings-rows shape since #6030):
 * one row per permission of the module, in the registry's words, showing
 * the tiers and roles that hold it, and opening that permission's page.
 *
 * An officer setting up Events asks "who can create events?" on the Events
 * page, so the answer sits in the row's value and the change one page away,
 * the way Slack's admin Permissions lists "Who can create channels" with its
 * answer and Discord's channel settings open Permissions as a page. Since
 * the tiers rebuild (#3990) the answer is mostly tiers, so a chapter with a
 * hundred roles reads "Exec board, Officers and chairs" rather than forty
 * role names.
 */

/** The roles a Who can answer can name: every role but the President's. */
function useWhoCanData() {
  const data = useRolesData();
  const tierToggle = useTierPermissionToggle(data.tiers);
  const editableRoles = useMemo(
    () =>
      data.roles.filter((role) => !isWildcardRole(role)).sort(byDisplayOrder),
    [data.roles],
  );
  const roleToggle = useRolePermissionToggle(editableRoles);
  const tierHas = (tier: TierRow, permission: string) =>
    tierToggle.permissionsOf(tier).includes(permission);
  const roleHas = (role: TieredRole, permission: string) =>
    roleToggle.permissionsOf(role).includes(permission);
  const holdersOf = (permission: string) =>
    whoCanHolders(permission, data.tiers, editableRoles, tierHas, roleHas);
  return {
    ...data,
    editableRoles,
    tierToggle,
    roleToggle,
    tierHas,
    roleHas,
    holdersOf,
    loading: data.rolesQuery.isPending || data.tiersQuery.isPending,
    failed: data.rolesQuery.isError || data.tiersQuery.isError,
  };
}

/** The module page's Who can group: a row per permission, with its answer. */
export function ModuleWhoCanGroup({
  moduleKey,
  pageHref,
}: {
  moduleKey: string;
  /** Where a permission's page is: the module page with `?page=`. */
  pageHref: (page: string) => string;
}) {
  const data = useWhoCanData();
  const permissions = modulePermissions(moduleKey);
  if (permissions.length === 0) return null;
  if (data.failed) {
    return (
      <SettingsGroup heading="Who can">
        <li className="px-4 py-3">
          <InlineNote>Couldn&apos;t load your chapter&apos;s roles.</InlineNote>
        </li>
      </SettingsGroup>
    );
  }
  return (
    <SettingsGroup heading="Who can" footnote={WHO_CAN_FOOTNOTE}>
      {permissions.map((entry) => {
        const page = whoCanPageId(entry.permission);
        const holders = data.holdersOf(entry.permission);
        const names = [
          ...holders.tiers.map((tier) => tier.name),
          ...holders.roles.map((role) => role.name),
        ];
        return (
          <SettingsRow
            key={entry.permission}
            id={`module-row-${page}`}
            label={entry.label}
            value={data.loading ? "Loading" : whoCanSummary(names)}
            href={pageHref(page)}
          />
        );
      })}
    </SettingsGroup>
  );
}

/**
 * One permission's page, opened from its Who can row: the chapter's tiers as
 * switches, then the roles that hold it apart from their tier, each with a
 * way to take it away, and Add a role. Discord's channel permission page and
 * the phone's tier screen (#4074) both answer "who can" as switches.
 *
 * The writes are the tier and role pages' own (`use-role-permission-toggle`),
 * saved the moment a switch flips. Editing needs `roles:manage`; the rank
 * rules (#4071) disable what the API would refuse, a tier or role at or
 * above the caller's own and granting a permission the caller doesn't hold,
 * and the row says why.
 */
export function WhoCanPermissionPage({
  permission,
  canEdit,
  note,
}: {
  permission: string;
  /** Whether the viewer holds `roles:manage`. */
  canEdit: boolean;
  /** A line about this permission in particular, above its tiers. */
  note?: ReactNode;
}) {
  const data = useWhoCanData();
  const { tiers, editableRoles, reach, words } = data;
  if (data.failed) {
    return (
      <InlineNote>Couldn&apos;t load your chapter&apos;s roles.</InlineNote>
    );
  }
  if (data.loading) {
    return <p className="text-caption text-muted-foreground">Loading</p>;
  }

  const canGrant = mayGrant(reach, permission);
  const holders = data.holdersOf(permission);
  const tierReason = (tier: TierRow, held: boolean): string | null => {
    if (!canEdit) return null;
    if (!reachesTier(reach, tier)) {
      return `At or above your rank, so your role can't change it.`;
    }
    if (!held && !canGrant) return CANT_GIVE;
    return null;
  };
  const mayEditRole = (role: TieredRole) =>
    canEdit && reachesRole(reach, role, tiers);
  const tierPending = (tier: TierRow) =>
    data.tierToggle.pending?.id === tier.id &&
    data.tierToggle.pending.permission === permission;
  const rolePending = (role: TieredRole) =>
    data.roleToggle.pending?.id === role.id &&
    data.roleToggle.pending.permission === permission;
  const addable = canGrant
    ? editableRoles.filter(
        (role) =>
          !holders.roles.some((held) => held.id === role.id) &&
          !data.roleHas(role, permission) &&
          mayEditRole(role),
      )
    : [];

  return (
    <div className="space-y-8">
      {note}
      <SettingsGroup
        heading={words.Plural}
        footnote={
          canEdit
            ? WHO_CAN_FOOTNOTE
            : `${WHO_CAN_FOOTNOTE} Your role can't change these.`
        }
      >
        {tiers.map((tier) => {
          const held = data.tierHas(tier, permission);
          const reason = tierReason(tier, held);
          return (
            <SettingsRow
              key={tier.id}
              label={tier.name}
              description={reason ?? undefined}
              checked={held}
              disabled={!canEdit || reason !== null || tierPending(tier)}
              onCheckedChange={() =>
                void data.tierToggle.toggle(tier, permission, held)
              }
            />
          );
        })}
      </SettingsGroup>

      {holders.roles.length > 0 || (canEdit && addable.length > 0) ? (
        <SettingsGroup
          heading="Roles set apart"
          footnote={WHO_CAN_ROLES_FOOTNOTE}
        >
          {holders.roles.map((role) => (
            <SettingsRow
              key={role.id}
              label={
                <span className="inline-flex items-center gap-2">
                  <RoleDot color={role.color} />
                  {role.name}
                </span>
              }
              control={
                mayEditRole(role) ? (
                  <button
                    type="button"
                    onClick={() =>
                      void data.roleToggle.toggle(role, permission, true)
                    }
                    disabled={rolePending(role)}
                    aria-label={`Take it away from ${role.name}`}
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-card-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
                      FOCUS_RING,
                    )}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                ) : null
              }
            />
          ))}
          {canEdit && addable.length > 0 ? (
            <li className="group">
              <SearchablePicker
                trigger={
                  <button
                    type="button"
                    className={cn(
                      "flex min-h-11 w-full items-center gap-4 px-4 py-2.5 text-left text-sm text-muted-foreground transition hover:bg-card-hover hover:text-foreground group-first:rounded-t-[13px] group-last:rounded-b-[13px]",
                      FOCUS_RING,
                    )}
                  >
                    <Plus className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    Add a role
                  </button>
                }
                align="start"
                label="Role to add"
                placeholder="Find a role"
                items={addable}
                nameOf={(role) => role.name}
                keyOf={(role) => role.id}
                itemClassName="min-h-control-row gap-2 text-sm pointer-coarse:min-h-11 pointer-coarse:text-base"
                renderItem={(role) => (
                  <>
                    <RoleDot color={role.color} />
                    <span className="min-w-0 flex-1 break-words">
                      {role.name}
                    </span>
                  </>
                )}
                onPick={(role) =>
                  void data.roleToggle.toggle(role, permission, false)
                }
              />
            </li>
          ) : null}
        </SettingsGroup>
      ) : null}
    </div>
  );
}

function RoleDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}
