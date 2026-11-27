"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Eye, Layers, Loader2, Palette } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useChapterRoleColors,
  useDeleteRole,
  useUpdateRole,
  useViewerDisplayName,
} from "@repo/hooks";
import {
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
  selfAssignableRefusal,
  SELF_ASSIGNABLE_SWITCH_DESCRIPTION,
} from "@repo/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FOCUS_RING } from "@/components/ui/focus";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/shared/async-states";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  ActionMenuButton,
  type RowMenuEntry,
} from "@/components/shared/row-menu";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import {
  SettingsBackLink,
  SettingsSubpage,
} from "@/components/settings/settings-subpage";
import { SettingsListCardSkeleton } from "@/components/settings/settings-skeleton";
import { RoleColorPicker } from "@/components/roles/role-color-picker";
import { PermissionSwitchList } from "@/components/roles/permission-switch-list";
import { RoleOverrideList } from "@/components/roles/role-override-list";
import { ColorDot } from "@/components/roles/roles-overview";
import { useStepRole } from "@/components/roles/use-step-role";
import { useRolePermissionToggle } from "@/components/roles/use-role-permission-toggle";
import { useRolesData } from "@/components/roles/use-roles-data";
import { CANT_GIVE, lockedReasonFor } from "@repo/hooks/use-roles-data";
import { useToast } from "@/lib/hooks/use-toast";
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

/**
 * A role's permissions after a move: the tier's, plus its overrides that are
 * on, minus those that are off. The API's `effectivePermissions` rule, which
 * the database applies on the write.
 */
function permissionsAfterMove(
  tierPermissions: readonly string[],
  overrides: Readonly<Record<string, boolean>>,
): string[] {
  const result = new Set(tierPermissions);
  for (const [permission, on] of Object.entries(overrides)) {
    if (on) result.add(permission);
    else result.delete(permission);
  }
  return [...result];
}

/** The Select's value for "outside the tiers"; Radix can't carry `""`. */
const OUTSIDE = "__outside__";

/**
 * One role's page (#3990; in the settings shape since #6029): its name on
 * top, then the Role group (its tier, color, how many hold it, its @mention
 * switch and, for a role the chapter made, Non-chapter business), saved
 * together by Save role, then what it can do.
 *
 * A role in a tier lists each permission once, with what the role ends up
 * with and a picker to set it apart from its tier (`role-override-list.tsx`);
 * a role outside the tiers, which has no tier to follow, shows one column of
 * live switches. Delete and its order (Move up, Move down) sit in the header's
 * ⋯, never beside Save (rulebook § 2), the same on the phone.
 *
 * "View as" opens the dashboard as a member holding only this role sees it
 * (#4072), the way Discord's View Server As Role does. The phone has no View
 * as yet, so it stays on web.
 */
export function RolePage({
  roleId,
  backHref,
  onDeleted,
}: {
  roleId: string;
  /** Roles and groups, where the back line and a deletion return. */
  backHref: string;
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

const VALUE_TRIGGER =
  "h-8 w-auto max-w-[14rem] gap-1.5 border-transparent bg-transparent px-2 text-sm text-muted-foreground hover:bg-card-hover";

function RoleBody({
  role,
  data,
  backHref,
  onDeleted,
}: {
  role: TieredRole;
  data: ReturnType<typeof useRolesData>;
  backHref: string;
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
  const stepper = useStepRole(roles, tiers);
  const holders = useMemo(() => [role], [role]);
  const { permissionsOf, toggle, pending } = useRolePermissionToggle(holders);

  const tier = tiers.find((candidate) => candidate.id === role.tier_id) ?? null;
  // The Everyone role (#4191): its permissions and @everyone switch are
  // edited here; its name and tier are fixed, as the API holds them.
  const everyone = isEveryoneRole(role);
  // Actives (#5802) stays in its tier: presidency's claim walk stops there.
  const tierFixed = everyone || isActiveRole(role);
  const wildcard = isWildcardRole(role);
  const editable = canManage && reachesRole(reach, role, tiers);

  const [name, setName] = useState(role.name);
  const chapterColors = useChapterRoleColors();
  const viewerName = useViewerDisplayName();
  // A stored value that may not paint (a pre-#3485 seed in red or gold, or
  // one too dark to read) reads as none, which is also how every client
  // paints it.
  const [color, setColor] = useState<string | null>(
    roleColorOrNull(role.color),
  );
  // Whether the officer picked a color: an unpaintable stored value shows as
  // "No color", so the draft alone can't tell "left alone" from "cleared".
  const [colorTouched, setColorTouched] = useState(false);
  const [placement, setPlacement] = useState(role.tier_id ?? OUTSIDE);
  const [mentionable, setMentionable] = useState(role.mentionable);
  // "Non-chapter business" (#4958, Shawn 2026-11-14): members add and remove
  // the role themselves. Judged against the drafted placement, since a move
  // into a tier is what most often rules it out.
  const [pickable, setPickable] = useState(role.self_assignable);
  const draftTierId = placement === OUTSIDE ? null : placement;
  const pickRefusal = selfAssignableRefusal({
    system_key: role.system_key,
    tier_id: draftTierId,
    // The permissions the save leaves it with, as the API judges them: its
    // stored ones while it stays put, else the drafted tier's with its own
    // overrides on top (a role moved out of a tier drops that tier's).
    permissions:
      draftTierId === (role.tier_id ?? null)
        ? role.permissions
        : permissionsAfterMove(
            tiers.find((candidate) => candidate.id === draftTierId)
              ?.permissions ?? [],
            role.permission_overrides,
          ),
  });

  async function save() {
    const nextTier = placement === OUTSIDE ? null : placement;
    try {
      await updateRole.mutateAsync({
        id: role.id,
        body: {
          name:
            name.trim() && name.trim() !== role.name ? name.trim() : undefined,
          // Sent only when changed, so re-saving an untouched role writes no
          // audit row for it; `null` clears the color.
          color:
            colorTouched && color !== (role.color ?? null) ? color : undefined,
          mentionable:
            mentionable !== role.mentionable ? mentionable : undefined,
          self_assignable:
            pickable !== role.self_assignable ? pickable : undefined,
          tier_id: nextTier !== role.tier_id ? nextTier : undefined,
          // **No `permissions` key.** The rows below save on their own;
          // sending a list here would roll back a pick made since this page
          // opened.
        },
      });
      setColorTouched(false);
      toast({
        title: "Role saved",
        description: `${name.trim() || role.name} is up to date.`,
      });
    } catch (error) {
      toast({
        title: "Couldn't save role",
        description: getErrorMessage(
          error,
          "Your change wasn't saved. Try again in a moment.",
        ),
        variant: "destructive",
      });
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${role.name}?`,
      description:
        "Members holding this role lose what it gives them right away. This can't be undone.",
      confirmLabel: PEOPLE_SETTINGS_COPY.deleteRole,
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
            disabled: !editable,
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

      <div className="grid max-w-md gap-1.5">
        <Label htmlFor="role-name">{PEOPLE_SETTINGS_COPY.name}</Label>
        <Input
          id="role-name"
          value={name}
          maxLength={ROLE_NAME_MAX_LENGTH}
          disabled={!editable || everyone}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="space-y-3">
        <SettingsGroup heading={PEOPLE_SETTINGS_COPY.roleHeading}>
          <SettingsRow
            icon={Layers}
            label={words.Singular}
            control={
              <Select
                value={placement}
                onValueChange={setPlacement}
                disabled={!editable || tierFixed}
              >
                <SelectTrigger
                  aria-label={words.Singular}
                  className={VALUE_TRIGGER}
                >
                  <SelectValue>{tierName}</SelectValue>
                </SelectTrigger>
                <SelectContent align="end">
                  {tiers.map((candidate) => (
                    <SelectItem
                      key={candidate.id}
                      value={candidate.id}
                      disabled={
                        candidate.id !== role.tier_id &&
                        !reachesTier(reach, candidate)
                      }
                    >
                      {candidate.name}
                    </SelectItem>
                  ))}
                  <SelectItem
                    value={OUTSIDE}
                    disabled={role.tier_id !== null && !reachesOutside(reach)}
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
                    onChange={(next) => {
                      setColor(next);
                      setColorTouched(true);
                    }}
                    previewName={name}
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
            onCheckedChange={setMentionable}
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
              onCheckedChange={setPickable}
            />
          )}
        </SettingsGroup>
        {editable ? (
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void save()}
              disabled={updateRole.isPending}
            >
              {updateRole.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Save role
            </Button>
          </div>
        ) : null}
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
