"use client";

import { useMemo } from "react";
import {
  useDeleteRoleTier,
  useReorderRoleTiers,
  useUpdateRoleTier,
} from "@repo/hooks";
import {
  memberCountLabel,
  PEOPLE_SETTINGS_COPY,
  ROLE_TIER_NAME_MAX_LENGTH,
  tierPermissionsFootnote,
} from "@repo/validation";
import { useToast } from "@/lib/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";
import { ErrorState } from "@/components/shared/async-states";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  ActionMenuButton,
  type RowMenuEntry,
} from "@/components/shared/row-menu";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { SettingsListCardSkeleton } from "@/components/settings/settings-skeleton";
import { SettingsNameField } from "@/components/settings/settings-name-field";
import {
  SettingsBackLink,
  SettingsSubpage,
} from "@/components/settings/settings-subpage";
import { PermissionSwitchList } from "@/components/roles/permission-switch-list";
import { ColorDot } from "@/components/roles/roles-overview";
import { useTierPermissionToggle } from "@/components/roles/use-role-permission-toggle";
import { useRolesData } from "@/components/roles/use-roles-data";
import { CANT_GIVE, lockedReasonFor } from "@repo/hooks/use-roles-data";
import { byDisplayOrder, mayGrant, reachesTier } from "@repo/hooks/role-tiers";

/**
 * A tier's page (#3990; in the settings shape since #6029), opened from the
 * tier's Permissions row: its name on top, its @mention switch, the roles in
 * it, then one group of switches per module, saved on click. A switch here
 * changes every role in the tier at once; a role set apart from its tier on
 * its own page keeps that difference (the API rewrites each role "with its own
 * overrides applied").
 *
 * The tier's rename, order and deletion live here, in its name field and the
 * header's ⋯, where the officer is already looking at it (rulebook § 2,
 * "edit a thing where you're looking at it"), the same on the phone.
 */
export function TierPermissionsPage({
  tierId,
  backHref,
  roleHref,
  onDeleted,
}: {
  tierId: string;
  /** Roles and groups, where the back line and a deletion return. */
  backHref: string;
  roleHref: (roleId: string) => string;
  onDeleted: () => void;
}) {
  const data = useRolesData();
  const { rolesQuery, tiersQuery, roles, tiers, reach, canManage, words } =
    data;
  const tier = tiers.find((candidate) => candidate.id === tierId) ?? null;
  const holders = useMemo(() => (tier ? [tier] : []), [tier]);
  const { permissionsOf, toggle, pending } = useTierPermissionToggle(holders);
  const updateTier = useUpdateRoleTier();
  const reorderTiers = useReorderRoleTiers();
  const deleteTier = useDeleteRoleTier();
  const { confirm, confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const tierRoles = useMemo(
    () => roles.filter((role) => role.tier_id === tierId).sort(byDisplayOrder),
    [roles, tierId],
  );
  const backLabel = PEOPLE_SETTINGS_COPY.pageTitle;

  if (tiersQuery.isPending || rolesQuery.isPending) {
    return (
      <div className="space-y-4">
        <SettingsBackLink href={backHref} label={backLabel} />
        <SettingsListCardSkeleton label="Loading permissions" rows={6} />
      </div>
    );
  }
  if (tiersQuery.isError || !tier) {
    return (
      <div className="space-y-4">
        <SettingsBackLink href={backHref} label={backLabel} />
        <ErrorState
          title={
            tiersQuery.isError
              ? `Couldn't load this ${words.singular}`
              : `This ${words.singular} is gone`
          }
          description={
            tiersQuery.isError
              ? `Retry, or go back to ${backLabel}.`
              : `Someone may have deleted it. Go back to ${backLabel} to see the ${words.plural} as they are now.`
          }
          onRetry={
            tiersQuery.isError ? () => void tiersQuery.refetch() : undefined
          }
        />
      </div>
    );
  }

  const held = permissionsOf(tier);
  const editable = canManage && reachesTier(reach, tier);
  const lockedReason = lockedReasonFor(
    { canManage, reach },
    editable,
    words.singular,
  );
  const index = tiers.findIndex((candidate) => candidate.id === tier.id);
  const above = tiers[index - 1];
  const below = tiers[index + 1];

  async function run(
    action: () => Promise<unknown>,
    failTitle: string,
    fallback: string,
  ) {
    try {
      await action();
      return true;
    } catch (error) {
      toast({
        title: failTitle,
        description: getErrorMessage(error, fallback),
        variant: "destructive",
      });
      return false;
    }
  }

  function move(by: -1 | 1) {
    const target = index + by;
    if (index < 0 || target < 0 || target >= tiers.length) return;
    const ids = tiers.map((candidate) => candidate.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void run(
      () => reorderTiers.mutateAsync(ids),
      `Couldn't move ${tier!.name}`,
      `Someone may have changed the ${words.plural} since you opened this page. Reload and try again.`,
    );
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${tier!.name}?`,
      description: `It has no roles left, so nobody loses anything. The other ${words.plural} keep their order.`,
      confirmLabel: `Delete ${words.singular}`,
      tone: "destructive",
    });
    if (!ok) return;
    if (
      await run(
        () => deleteTier.mutateAsync(tier!.id),
        `Couldn't delete ${tier!.name}`,
        `Move its roles to another ${words.singular} first.`,
      )
    ) {
      onDeleted();
    }
  }

  const entries: RowMenuEntry[] = [
    {
      type: "item",
      key: "up",
      label: PEOPLE_SETTINGS_COPY.moveUp,
      disabled: !editable || !above || !reachesTier(reach, above),
      onSelect: () => move(-1),
    },
    {
      type: "item",
      key: "down",
      label: PEOPLE_SETTINGS_COPY.moveDown,
      disabled: !editable || !below || !reachesTier(reach, below),
      onSelect: () => move(1),
    },
    { type: "separator", key: "sep" },
    {
      type: "item",
      key: "delete",
      label:
        tierRoles.length > 0
          ? `Delete ${words.singular} (move its roles out first)`
          : `Delete ${words.singular}`,
      destructive: true,
      disabled: !editable || tierRoles.length > 0,
      onSelect: () => void remove(),
    },
  ];

  return (
    <SettingsSubpage
      backHref={backHref}
      backLabel={backLabel}
      title={tier.name}
      actions={
        editable ? (
          <ActionMenuButton entries={entries} label={`More for ${tier.name}`} />
        ) : null
      }
    >
      {confirmDialog}
      <SettingsNameField
        // Keyed on the saved name, so a rename from elsewhere shows.
        key={tier.name}
        value={tier.name}
        maxLength={ROLE_TIER_NAME_MAX_LENGTH}
        disabled={!editable}
        onSave={(name) =>
          run(
            () => updateTier.mutateAsync({ id: tier.id, body: { name } }),
            `Couldn't rename ${tier.name}`,
            "The name was not changed. Try again in a moment.",
          )
        }
      />

      {/*
        #4076 (Paul and Shawn, 2026-11-11): a tier's name is pingable, and
        reaches everyone holding a role in it. On by default, like a role's;
        saved on the flip, as the permission switches below are.
      */}
      <SettingsGroup label={tier.name}>
        <SettingsRow
          label={`Anyone can @mention this ${words.singular}`}
          checked={tier.mentionable}
          disabled={!editable || updateTier.isPending}
          onCheckedChange={(on) =>
            void run(
              () =>
                updateTier.mutateAsync({
                  id: tier.id,
                  body: { mentionable: on },
                }),
              "Couldn't change who can ping it",
              "Try again in a moment.",
            )
          }
        />
      </SettingsGroup>

      {tierRoles.length > 0 ? (
        <SettingsGroup heading={PEOPLE_SETTINGS_COPY.rolesInTierHeading}>
          {tierRoles.map((role) => {
            const count = data.memberCounts?.get(role.id);
            return (
              <SettingsRow
                key={role.id}
                leading={<ColorDot color={role.color} />}
                label={role.name}
                value={
                  count === undefined
                    ? data.memberCounts === null
                      ? ""
                      : memberCountLabel(0)
                    : memberCountLabel(count)
                }
                href={roleHref(role.id)}
              />
            );
          })}
        </SettingsGroup>
      ) : null}

      <PermissionSwitchList
        idPrefix={`tier-${tier.id}`}
        holderName={tier.name}
        isOn={(permission) => held.includes(permission)}
        onToggle={(permission, on) => void toggle(tier, permission, on)}
        extraPermissions={held}
        lockedReason={lockedReason}
        footnote={tierPermissionsFootnote(tier.name)}
        rowLockedReason={(permission, on) =>
          !on && !mayGrant(reach, permission) ? CANT_GIVE : null
        }
        pendingPermission={pending?.id === tier.id ? pending.permission : null}
      />
    </SettingsSubpage>
  );
}
