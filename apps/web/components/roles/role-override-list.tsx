"use client";

import { useMemo } from "react";
import {
  groupPermissionsByModule,
  overrideChoiceLabels,
  setApartLabel,
} from "@repo/validation";
import { useIsPermissionHidden, useUpdateRole } from "@repo/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsGroup } from "@/components/shared/settings-row";
import { permissionRows } from "@repo/hooks/role-tiers";
import { CANT_GIVE } from "@repo/hooks/use-roles-data";
import {
  useOverrideOverlay,
  type Override,
} from "@repo/hooks/permission-overlay";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, getErrorMessage } from "@/lib/utils";
import type { TieredRole, TierRow } from "@repo/hooks/role-tiers";

type Choice = "off" | "tier" | "on";

const toChoice = (value: Override): Choice =>
  value === null ? "tier" : value ? "on" : "off";
const fromChoice = (choice: Choice): Override =>
  choice === "tier" ? null : choice === "on";

/**
 * A role in a tier, set apart from its tier where it needs to be (#4072;
 * one row per permission since #6029). Each row reads the way the phone's
 * always has: the permission, what it opens, and what this role ends up with,
 * On or Off. A row set apart from the tier says so under it, in the accent
 * ("Set for this role. Exec board has it off."); the rest follow the tier.
 *
 * The value opens the three answers Discord gives a channel's per-role
 * override (deny, inherit, allow), in words: "Same as Exec board · On", On,
 * Off. "Same as" is a real answer: a role left on it follows the tier when
 * the tier changes, and one set On or Off keeps its answer whatever the tier
 * does later. Until #6029 web drew a read-only tier column beside a three-way
 * segmented switch on every row, forty of them on one page.
 *
 * Each pick saves on its own, as one key of `permission_overrides`
 * (`PATCH /v1/roles/:id`), so two quick picks on different rows never
 * overwrite each other the way two whole-list writes could.
 */
export function RoleOverrideList({
  role,
  tier,
  lockedReason,
  mayGrant,
  footnote,
}: {
  role: TieredRole;
  tier: TierRow;
  /** Set when nothing on the page can change, saying why, once at the top. */
  lockedReason: string | null;
  /** Whether the caller may switch this permission on for someone else. */
  mayGrant: (permission: string) => boolean;
  /** The one muted line under the first module's group. */
  footnote?: string;
}) {
  const { overrideOf, set, pending } = useRoleOverrideToggle(role);
  const isHidden = useIsPermissionHidden();
  const groups = useMemo(
    () =>
      groupPermissionsByModule(
        permissionRows(
          [
            ...tier.permissions,
            ...role.permissions,
            ...Object.keys(role.permission_overrides),
          ],
          isHidden,
        ),
      ),
    [tier.permissions, role.permissions, role.permission_overrides, isHidden],
  );

  return (
    <div className="space-y-8">
      {lockedReason ? (
        <p className="text-sm text-muted-foreground">{lockedReason}</p>
      ) : null}
      {groups.map((group, groupIndex) => (
        <SettingsGroup
          key={group.label}
          heading={group.label}
          footnote={groupIndex === 0 ? footnote : undefined}
        >
          {group.entries.map((row) => {
            const tierHas = tier.permissions.includes(row.permission);
            const override = overrideOf(row.permission);
            const holds = override ?? tierHas;
            const current = role.permission_overrides[row.permission];
            const canGive = mayGrant(row.permission);
            // What the API refuses (#4071): an override switched on, or
            // any pick that leaves the role holding something new, needs
            // the caller to hold it. Off is always allowed.
            const onRefused = !canGive && current !== true;
            const tierRefused = !canGive && tierHas && !holds;
            const rowReason =
              !lockedReason && (onRefused || tierRefused) ? CANT_GIVE : null;
            const choices = overrideChoiceLabels(tier.name, tierHas);
            const disabled =
              Boolean(lockedReason) || pending === row.permission;
            return (
              <li
                key={row.permission}
                className="flex min-h-11 items-center gap-4 px-4 py-2.5"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {row.label}
                  </span>
                  {override !== null ? (
                    <span className="text-caption text-accent-text">
                      {setApartLabel(tier.name, tierHas)}
                    </span>
                  ) : row.description ? (
                    <span className="text-caption text-muted-foreground">
                      {row.description}
                    </span>
                  ) : null}
                  {rowReason ? (
                    <span className="text-caption text-muted-foreground">
                      {rowReason}
                    </span>
                  ) : null}
                </div>
                <Select
                  value={toChoice(override)}
                  disabled={disabled}
                  onValueChange={(choice) =>
                    void set(row.permission, fromChoice(choice as Choice))
                  }
                >
                  <SelectTrigger
                    aria-label={`${row.label} for ${role.name}`}
                    className={cn(
                      "h-8 w-auto min-w-[4.5rem] shrink-0 gap-1.5 px-2.5 text-sm",
                      holds ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {/* The value shows what the role ends up with. */}
                    <SelectValue>{holds ? "On" : "Off"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="tier" disabled={tierRefused}>
                      {choices.inherit}
                    </SelectItem>
                    <SelectItem value="on" disabled={onRefused}>
                      {choices.on}
                    </SelectItem>
                    <SelectItem value="off">{choices.off}</SelectItem>
                  </SelectContent>
                </Select>
              </li>
            );
          })}
        </SettingsGroup>
      ))}
    </div>
  );
}

/** One role's overrides, through the overlay shared with the phone. */
function useRoleOverrideToggle(role: TieredRole) {
  const updateRole = useUpdateRole();
  const { toast } = useToast();
  return useOverrideOverlay(
    role,
    (permission, value) =>
      updateRole.mutateAsync({
        id: role.id,
        body: { permission_overrides: { [permission]: value } },
      }),
    (error) =>
      toast({
        title: `Couldn't update ${role.name}`,
        description: getErrorMessage(
          error,
          "The permission was not changed. Try again in a moment.",
        ),
        variant: "destructive",
      }),
  );
}
