"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, Eye, Layers, Palette } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useChapterRoleColors,
  useDeleteRole,
  useUpdateRole,
  useViewerDisplayName,
} from "@repo/hooks";
import {
  deleteRoleConfirm,
  isActiveRole,
  isEveryoneRole,
  memberCountLabel,
  outsideTiersHeading,
  PEOPLE_SETTINGS_COPY,
  ROLE_NAME_MAX_LENGTH,
  roleColorLabel,
  roleColorOrNull,
  rolePermissionsFootnote,
  SELF_ASSIGNABLE_REFUSAL_COPY,
  SELF_ASSIGNABLE_SWITCH_DESCRIPTION,
  selfAssignableRefusal,
} from "@repo/validation";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Link from "next/link";
import { FOCUS_RING } from "@/components/ui/focus";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/shared/async-states";
import {
  confirmWords,
  useConfirmDialog,
} from "@/components/shared/confirm-dialog";
import {
  ActionMenuButton,
  type RowMenuEntry,
} from "@/components/shared/row-menu";
import {
  SettingsGroup,
  SettingsRow,
  SETTINGS_VALUE_TRIGGER,
} from "@/components/shared/settings-row";
import {
  SettingsBackLink,
  SettingsSubpage,
} from "@/components/settings/settings-subpage";
import { SettingsListCardSkeleton } from "@/components/settings/settings-skeleton";
import { SettingsTextField } from "@/components/settings/settings-name-field";
import { RoleColorPicker } from "@/components/roles/role-color-picker";
import { PermissionSwitchList } from "@/components/roles/permission-switch-list";
import { RoleOverrideList } from "@/components/roles/role-override-list";
import { ColorDot } from "@/components/roles/roles-overview";
import { useStepRole } from "@/components/roles/use-step-role";
import { useRolePermissionToggle } from "@/components/roles/use-role-permission-toggle";
import { useRolesData } from "@/components/roles/use-roles-data";
import { CANT_GIVE, lockedReasonFor } from "@repo/hooks/use-roles-data";
import { useToast } from "@/lib/hooks/use-toast";
import { useToastedRun } from "@/lib/hooks/use-toasted-run";
import { usePendingSetting } from "@repo/hooks/use-pending-setting";
import type { UpdateRoleBody } from "@repo/hooks/use-roles";
import { cn, getErrorMessage } from "@/lib/utils";
import { useChapterStore } from "@/lib/stores/chapter-store";
import { useRolePreviewStore } from "@/lib/stores/role-preview-store";
import {
  isWildcardRole,
  mayGrant,
  previewPermissions,
  reachesOutside,
  reachesRole,
  reachesTier,
  type TieredRole,
} from "@repo/hooks/role-tiers";

/** The Select's value for "outside the tiers"; Radix can't carry `""`. */
const OUTSIDE = "__outside__";

/**
 * One role's page (#3990; in the settings shape since #6029): its name on
 * top, then the Role group (its tier, color, how many hold it, its @mention
 * switch and, for a role the chapter made, Non-chapter business), each
 * saving on its own the moment it changes (#6033), then what it can do.
 *
 * A role in a tier lists each permission once, with what the role ends up
 * with and a picker to set it apart from its tier (`role-override-list.tsx`);
 * a role outside the tiers, which has no tier to follow, shows one column of
 * live switches. Delete and its order (Move up, Move down) sit in the header's
 * ⋯ (rulebook § 2), the same on the phone.
 *
 * "View as" opens the dashboard as a member holding only this role sees it
 * (#4072), the way Discord's View Server As Role does. The phone has no View
 * as yet, so it stays on web.
 */
export function RolePage({
  roleId,
  backHref,
  tierHref,
  onDeleted,
}: {
  roleId: string;
  /** Roles and groups, where the back line and a deletion return. */
  backHref: string;
  /** The page of the role's tier, linked from its Tier row. */
  tierHref?: (tierId: string) => string;
  onDeleted: () => void;
}) {
  const data = useRolesData();
  const { rolesQuery, tiersQuery, roles, words } = data;
  const role = roles.find((candidate) => candidate.id === roleId) ?? null;
  const backLabel = PEOPLE_SETTINGS_COPY.pageTitle;

  if (rolesQuery.isPending || tiersQuery.isPending) {
    return (
      <div className="space-y-4">
        <SettingsBackLink href={backHref} label={backLabel} />
        <SettingsListCardSkeleton label="Loading role" rows={6} />
      </div>
    );
  }
  if (rolesQuery.isError || !role) {
    return (
      <div className="space-y-4">
        <SettingsBackLink href={backHref} label={backLabel} />
        <ErrorState
          title={
            rolesQuery.isError ? "Couldn't load this role" : "This role is gone"
          }
          description={
            rolesQuery.isError
              ? `Retry, or go back to ${backLabel}.`
              : `Someone may have deleted it. Go back to ${backLabel} to see the ${words.plural} as they are now.`
          }
          onRetry={
            rolesQuery.isError ? () => void rolesQuery.refetch() : undefined
          }
        />
      </div>
    );
  }
  // Keyed by role so the drafts start over when another role opens.
  return (
    <RoleBody
      key={role.id}
      role={role}
      data={data}
      backHref={backHref}
      tierHref={tierHref}
      onDeleted={onDeleted}
    />
  );
}

/** A row's trailing value that opens nothing, in a row's value tone. */
function PlainValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-sm tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

function RoleBody({
  role,
  data,
  backHref,
  tierHref,
  onDeleted,
}: {
  role: TieredRole;
  data: ReturnType<typeof useRolesData>;
  backHref: string;
  tierHref?: (tierId: string) => string;
  onDeleted: () => void;
}) {
  const { tiers, roles, reach, canManage, words, memberCounts } = data;
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeChapterId = useChapterStore((s) => s.activeChapterId);
  const startPreview = useRolePreviewStore((s) => s.start);
  const { confirm, confirmDialog } = useConfirmDialog();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const stepper = useStepRole(
    roles,
    tiers,
    // The President role is no one's to edit, but a wildcard caller
    // may still move it past a neighbour (the API ranks it at the top).
    (target) =>
      canManage &&
      (isWildcardRole(target)
        ? reach.wildcard
        : reachesRole(reach, target, tiers)),
  );
  const holders = useMemo(() => [role], [role]);
  const { permissionsOf, toggle, pending } = useRolePermissionToggle(holders);

  const tier = tiers.find((candidate) => candidate.id === role.tier_id) ?? null;
  // A tier_id naming a tier this chapter doesn't have reads as outside the
  // tiers, the way the overview lists it and the API ranks it.
  const tierId = tier?.id ?? null;
  // The Everyone role (#4191): its permissions and @everyone switch are
  // edited here; its name and tier are fixed, as the API holds them.
  const everyone = isEveryoneRole(role);
  // Actives (#5802) stays in its tier: presidency's claim walk stops there.
  const tierFixed = everyone || isActiveRole(role);
  const wildcard = isWildcardRole(role);
  const editable = canManage && reachesRole(reach, role, tiers);

  const chapterColors = useChapterRoleColors();
  const viewerName = useViewerDisplayName();
  const run = useToastedRun();
  // Each setting saves on its own the moment it changes (#6033), sending
  // only its own key, so a stale page never undoes another officer's edit.
  // **Never a `permissions` key**: the rows below save on their own.
  const saveRole = useCallback(
    (body: UpdateRoleBody) =>
      run(
        () => updateRole.mutateAsync({ id: role.id, body }),
        PEOPLE_SETTINGS_COPY.saveRoleFailed,
        PEOPLE_SETTINGS_COPY.saveFallback,
      ),
    [run, updateRole, role.id],
  );
  // A stored value that may not paint (a pre-#3485 seed in red or gold, or
  // one too dark to read) reads as none, which is also how every client
  // paints it.
  const [color, changeColor] = usePendingSetting<string | null>(
    roleColorOrNull(role.color),
    useCallback((next) => saveRole({ color: next }), [saveRole]),
  );
  const [placement, changePlacement] = usePendingSetting(
    tierId ?? OUTSIDE,
    useCallback(
      (next) => saveRole({ tier_id: next === OUTSIDE ? null : next }),
      [saveRole],
    ),
  );
  const [mentionable, changeMentionable] = usePendingSetting(
    role.mentionable,
    useCallback((next) => saveRole({ mentionable: next }), [saveRole]),
  );
  // "Non-chapter business" (#4958, Shawn 2026-11-14): members add and remove
  // the role themselves. The tier saves at once, so it is judged against the
  // role as stored.
  const [pickable, changePickable] = usePendingSetting(
    role.self_assignable,
    useCallback((next) => saveRole({ self_assignable: next }), [saveRole]),
  );
  const pickRefusal = selfAssignableRefusal(role);
  // What the name field holds, for the color picker's preview.
  const [draftName, setDraftName] = useState(role.name);

  async function remove() {
    const ok = await confirm({
      ...confirmWords(deleteRoleConfirm(role.name)),
      tone: "destructive",
    });
    if (!ok) return;
    try {
      await deleteRole.mutateAsync(role.id);
      toast({
        title: "Role deleted",
        description: `${role.name} was removed.`,
      });
      onDeleted();
    } catch (error) {
      toast({
        title: "Couldn't delete role",
        description: getErrorMessage(
          error,
          "Remove the role from its members first, or try again.",
        ),
        variant: "destructive",
      });
    }
  }

  function moveBy(by: -1 | 1) {
    void stepper.step(role, by).catch((error: unknown) =>
      toast({
        title: `Couldn't move ${role.name}`,
        description: getErrorMessage(
          error,
          "The role stayed where it was. Try again in a moment.",
        ),
        variant: "destructive",
      }),
    );
  }

  function viewAs() {
    if (!activeChapterId) return;
    const query = searchParams.toString();
    startPreview({
      chapterId: activeChapterId,
      roleId: role.id,
      roleName: role.name,
      permissions: previewPermissions(role, roles),
      returnTo: query ? `${pathname}?${query}` : pathname,
    });
    // Chat is where every member lands, so the preview starts there, with
    // the nav as the role would have it.
    router.push("/chat");
  }

  const held = permissionsOf(role);
  const count = memberCounts?.get(role.id) ?? (memberCounts ? 0 : null);
  const lockedReason = wildcard
    ? "This role can do everything. That only moves through Transfer presidency."
    : lockedReasonFor({ canManage, reach }, editable, "role");

  const menuEntries: RowMenuEntry[] = [
    {
      type: "item",
      key: "up",
      label: PEOPLE_SETTINGS_COPY.moveUp,
      disabled: !editable || !stepper.canStep(role, -1),
      onSelect: () => moveBy(-1),
    },
    {
      type: "item",
      key: "down",
      label: PEOPLE_SETTINGS_COPY.moveDown,
      disabled: !editable || !stepper.canStep(role, 1),
      onSelect: () => moveBy(1),
    },
    ...(role.is_system
      ? []
      : [
          { type: "separator", key: "sep" } satisfies RowMenuEntry,
          {
            type: "item",
            key: "delete",
            label: PEOPLE_SETTINGS_COPY.deleteRole,
            destructive: true,
            disabled: !editable || deleteRole.isPending,
            onSelect: () => void remove(),
          } satisfies RowMenuEntry,
        ]),
  ];

  const tierName =
    placement === OUTSIDE
      ? outsideTiersHeading(words.plural)
      : (tiers.find((candidate) => candidate.id === placement)?.name ?? "");

  return (
    <SettingsSubpage
      backHref={backHref}
      backLabel={PEOPLE_SETTINGS_COPY.pageTitle}
      title={role.name}
      titleLeading={<ColorDot color={role.color} />}
      actions={
        <>
          {/*
            Anyone who can edit roles may look (#4072), at any role but the
            President's, which can do everything. Looking changes nothing,
            so the rank rules that guard edits don't apply.
          */}
          {canManage && !wildcard ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={viewAs}
            >
              <Eye aria-hidden />
              View as {role.name}
            </Button>
          ) : null}
          {editable && !everyone ? (
            <ActionMenuButton
              entries={menuEntries}
              label={`More for ${role.name}`}
            />
          ) : null}
        </>
      }
    >
      {confirmDialog}
      {everyone ? (
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every member holds it, including someone who has just joined and has
          no base role yet.
        </p>
      ) : null}

      <div className="max-w-md">
        <SettingsTextField
          id="role-name"
          label={PEOPLE_SETTINGS_COPY.name}
          value={role.name}
          maxLength={ROLE_NAME_MAX_LENGTH}
          disabled={!editable || everyone}
          onTextChange={setDraftName}
          onSave={(next) => saveRole({ name: next })}
        />
      </div>

      <div className="space-y-3">
        <SettingsGroup heading={PEOPLE_SETTINGS_COPY.roleHeading}>
          <SettingsRow
            icon={Layers}
            label={words.Singular}
            description={
              tier && tierHref ? (
                // What the tier gives lives on its page: the way there.
                <Link
                  href={tierHref(tier.id)}
                  className={cn("underline underline-offset-2", FOCUS_RING)}
                >
                  Open {tier.name}
                </Link>
              ) : undefined
            }
            control={
              <Select
                value={placement}
                onValueChange={(next) => void changePlacement(next)}
                disabled={!editable || tierFixed}
              >
                <SelectTrigger
                  aria-label={words.Singular}
                  className={SETTINGS_VALUE_TRIGGER}
                >
                  <SelectValue>{tierName}</SelectValue>
                </SelectTrigger>
                <SelectContent align="end">
                  {tiers.map((candidate) => (
                    <SelectItem
                      key={candidate.id}
                      value={candidate.id}
                      disabled={
                        candidate.id !== tierId &&
                        !reachesTier(reach, candidate)
                      }
                    >
                      {candidate.name}
                    </SelectItem>
                  ))}
                  <SelectItem
                    value={OUTSIDE}
                    disabled={tierId !== null && !reachesOutside(reach)}
                  >
                    {outsideTiersHeading(words.plural)}
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingsRow
            icon={Palette}
            label={PEOPLE_SETTINGS_COPY.color}
            control={
              <Popover>
                <PopoverTrigger
                  disabled={!editable}
                  className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition hover:bg-card-hover disabled:opacity-50",
                    FOCUS_RING,
                  )}
                >
                  <ColorDot color={color} />
                  {roleColorLabel(color)}
                  <ChevronDown className="h-4 w-4 opacity-50" aria-hidden />
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-auto max-w-[min(30rem,calc(100vw-2rem))]"
                >
                  <span id="role-color-label" className="sr-only">
                    {PEOPLE_SETTINGS_COPY.color}
                  </span>
                  <RoleColorPicker
                    labelId="role-color-label"
                    value={color}
                    onChange={(next) => void changeColor(next)}
                    previewName={draftName || role.name}
                    memberName={viewerName}
                    chapterColors={chapterColors}
                  />
                </PopoverContent>
              </Popover>
            }
          />
          <SettingsRow
            label={PEOPLE_SETTINGS_COPY.members}
            control={
              <PlainValue>
                {count === null ? "" : memberCountLabel(count)}
              </PlainValue>
            }
          />
          {/*
            Owner, 2026-11-06: "anyone can ping any role by default. officers
            can change defaults." Off, only a member who can manage channels
            or roles can @ it (spec/behavior/chat/README.md § Role mentions).
          */}
          <SettingsRow
            label={
              everyone
                ? "Anyone can use @everyone and @here"
                : PEOPLE_SETTINGS_COPY.mentionRole
            }
            checked={mentionable}
            disabled={!editable}
            onCheckedChange={(next) => void changeMentionable(next)}
          />
          {/*
            Non-chapter business (#4958): interest roles members pick
            themselves. Built-in roles never are, so they don't show it.
            spec/behavior/rbac.md § Self-assignable roles.
          */}
          {role.system_key ? null : (
            <SettingsRow
              label="Non-chapter business"
              description={
                pickRefusal
                  ? SELF_ASSIGNABLE_REFUSAL_COPY[pickRefusal]
                  : SELF_ASSIGNABLE_SWITCH_DESCRIPTION
              }
              checked={pickable}
              disabled={!editable || (!!pickRefusal && !pickable)}
              onCheckedChange={(next) => void changePickable(next)}
            />
          )}
        </SettingsGroup>
      </div>

      {tier && !wildcard ? (
        <RoleOverrideList
          role={role}
          tier={tier}
          lockedReason={lockedReason}
          mayGrant={(permission) => mayGrant(reach, permission)}
          footnote={rolePermissionsFootnote(tier.name, words.plural)}
        />
      ) : (
        <PermissionSwitchList
          idPrefix={`role-${role.id}`}
          holderName={role.name}
          isOn={(permission) => wildcard || held.includes(permission)}
          onToggle={(permission, on) => void toggle(role, permission, on)}
          extraPermissions={wildcard ? [] : held}
          lockedReason={lockedReason}
          footnote={
            wildcard ? undefined : rolePermissionsFootnote(null, words.plural)
          }
          rowLockedReason={(permission, on) =>
            !on && !mayGrant(reach, permission) ? CANT_GIVE : null
          }
          pendingPermission={
            pending?.id === role.id ? pending.permission : null
          }
        />
      )}
    </SettingsSubpage>
  );
}
