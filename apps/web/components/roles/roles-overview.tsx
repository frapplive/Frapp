"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Layers, Plus, ShieldCheck } from "lucide-react";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import {
  useCreateRole,
  useCreateRoleTier,
  useDeleteRole,
  useUpdateRole,
  useIsPermissionHidden,
} from "@repo/hooks";
import { matchesWordStarts, normalizeWords } from "@repo/hooks/fuzzy-match";
import {
  addTierLabel,
  deleteRoleConfirm,
  isActiveRole,
  isEveryoneRole,
  memberCountLabel,
  NEW_PICKABLE_ROLE_COPY,
  outsideTiersFootnote,
  outsideTiersHeading,
  PEOPLE_SETTINGS_COPY,
  permissionsOnLabel,
  ROLE_NAME_MAX_LENGTH,
  ROLE_TIER_NAME_MAX_LENGTH,
  roleColorOrNull,
  SELF_ASSIGNABLE_SECTION_CAPTION,
} from "@repo/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FOCUS_RING } from "@/components/ui/focus";
import {
  ErrorState,
  OfflineState,
  anyReadUncached,
} from "@/components/shared/async-states";
import type { RowMenuEntry } from "@/components/shared/row-menu";
import {
  confirmWords,
  useConfirmDialog,
} from "@/components/shared/confirm-dialog";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { SettingsListCardSkeleton } from "@/components/settings/settings-skeleton";
import { useNetwork } from "@/lib/providers/network-provider";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, getErrorMessage } from "@/lib/utils";
import {
  byDisplayOrder,
  addsTiers,
  isWildcardRole,
  reachesOutside,
  reachesRole,
  reachesTier,
  shownPermissionCount,
  type TieredRole,
} from "@repo/hooks/role-tiers";
import { useRolesData } from "@/components/roles/use-roles-data";
import { useStepRole } from "@/components/roles/use-step-role";

/** Where a role is created or moved to: a tier's id, or outside the tiers. */
type Placement = string | null;

/** Where a row of the overview leads. */
export type RolesLinks = {
  tier: (tierId: string) => string;
  role: (roleId: string) => string;
};

/** A role's or group's colour, as the dot that leads its row. */
export function ColorDot({ color }: { color: string | null | undefined }) {
  const hex = roleColorOrNull(color);
  return (
    <span
      aria-hidden
      className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
      // Palette literal: chapter data rendered as a raw swatch.
      style={hex ? { backgroundColor: hex, borderColor: hex } : undefined}
    />
  );
}

/**
 * Chapter settings → Roles and groups, its roles (#3990; in the settings
 * shape since #6029): one group per tier in rank order, then the roles
 * outside the tiers, then Non-chapter business.
 *
 * Paul's shape: "under roles you would have tiers, and then within each tier
 * you would have all the different roles". Each tier's group leads with its
 * Permissions row (the phone's since #3990, web's since #6029), then its
 * roles with their member counts, then Add role. Discord's Roles settings is
 * the comparison: one ordered list with a member count per role, a ⋯ per
 * row, a click into a role for everything else. A tier's name, order and
 * deletion live on its own page, opened from its Permissions row.
 *
 * Every control the rank rules would refuse is disabled before it is tried
 * (`@repo/hooks/role-tiers`); the API stays the authority, and a refusal it
 * sends anyway lands as a toast naming what was missing.
 */
export function RolesOverview({
  query,
  links,
  onOpenRole,
}: {
  /** The page's search; only matching roles show while it holds words. */
  query: string;
  links: RolesLinks;
  /** Opens a role's page: Non-chapter business's Add role lands there. */
  onOpenRole: (roleId: string) => void;
}) {
  const { isOffline } = useNetwork();
  const data = useRolesData();
  const { rolesQuery, tiersQuery } = data;

  if (isOffline && anyReadUncached(rolesQuery, tiersQuery)) {
    return (
      <OfflineState description="Reconnect to see and change who holds what." />
    );
  }
  if (rolesQuery.isPending || tiersQuery.isPending) {
    return <SettingsListCardSkeleton label="Loading roles" rows={4} />;
  }
  if (rolesQuery.isError || tiersQuery.isError) {
    return (
      <ErrorState
        title="Couldn't load roles"
        description={describeLoadFailure(rolesQuery.error ?? tiersQuery.error)}
        onRetry={() => {
          void rolesQuery.refetch();
          void tiersQuery.refetch();
        }}
      />
    );
  }

  return (
    <TierList data={data} query={query} links={links} onOpenRole={onOpenRole} />
  );
}

function TierList({
  data,
  query,
  links,
  onOpenRole,
}: {
  data: ReturnType<typeof useRolesData>;
  query: string;
  links: RolesLinks;
  onOpenRole: (roleId: string) => void;
}) {
  const { roles, tiers, memberCounts, reach, canManage, words } = data;
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  const createTier = useCreateRoleTier();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const isHidden = useIsPermissionHidden();
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

  const filtering = normalizeWords(query).length > 0;
  const rolesIn = useMemo(() => {
    const byTier = new Map<Placement, TieredRole[]>();
    const tierIds = new Set(tiers.map((tier) => tier.id));
    for (const role of [...roles].sort(byDisplayOrder)) {
      // A role naming a tier this list doesn't have reads as outside, which
      // is how the API ranks it too.
      const key =
        role.tier_id && tierIds.has(role.tier_id) ? role.tier_id : null;
      if (!byTier.has(key)) byTier.set(key, []);
      byTier.get(key)!.push(role);
    }
    return byTier;
  }, [roles, tiers]);

  const shown = (placement: Placement) => {
    const all = rolesIn.get(placement) ?? [];
    return filtering
      ? all.filter((role) => matchesWordStarts(role.name, query))
      : all;
  };

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

  async function removeRole(role: TieredRole) {
    const ok = await confirm({
      ...confirmWords(deleteRoleConfirm(role.name)),
      tone: "destructive",
    });
    if (!ok) return;
    await run(
      () => deleteRole.mutateAsync(role.id),
      `Couldn't delete ${role.name}`,
      "Remove the role from its members first, or try again in a moment.",
    );
  }

  function moveRole(role: TieredRole, placement: Placement) {
    void run(
      () =>
        updateRole.mutateAsync({ id: role.id, body: { tier_id: placement } }),
      `Couldn't move ${role.name}`,
      "The role stayed where it was. Try again in a moment.",
    );
  }

  const roleRow = (role: TieredRole) => {
    const editable = canManage && reachesRole(reach, role, tiers);
    // A Non-chapter business role can't sit in a tier (#4958): the API
    // refuses the move until it's unmarked on its role page, so the menu
    // doesn't offer one. Actives (#5802) stays in its tier, as the API holds it.
    const movable = !role.self_assignable && !isActiveRole(role);
    // A tier_id naming a missing tier reads as outside, as `rolesIn` groups it.
    const tierId = tiers.some((tier) => tier.id === role.tier_id)
      ? role.tier_id
      : null;
    const stepTo = (by: -1 | 1) =>
      void run(
        () => stepper.step(role, by),
        `Couldn't move ${role.name}`,
        "The role stayed where it was. Try again in a moment.",
      );
    const entries: RowMenuEntry[] = [
      {
        type: "item",
        key: "up",
        label: PEOPLE_SETTINGS_COPY.moveUp,
        disabled: !editable || !stepper.canStep(role, -1),
        onSelect: () => stepTo(-1),
      },
      {
        type: "item",
        key: "down",
        label: PEOPLE_SETTINGS_COPY.moveDown,
        disabled: !editable || !stepper.canStep(role, 1),
        onSelect: () => stepTo(1),
      },
      ...(movable
        ? [
            { type: "separator", key: "move-sep" } as const,
            { type: "label", key: "move-label", label: "Move to" } as const,
          ]
        : []),
      ...tiers
        .filter((tier) => movable && tier.id !== tierId)
        .map((tier): RowMenuEntry => ({
          type: "item",
          key: `move-${tier.id}`,
          label: tier.name,
          disabled: !editable || !reachesTier(reach, tier),
          onSelect: () => moveRole(role, tier.id),
        })),
      ...(tierId === null || !movable
        ? []
        : [
            {
              type: "item",
              key: "move-outside",
              label: outsideTiersHeading(words.plural),
              disabled: !editable || !reachesOutside(reach),
              onSelect: () => moveRole(role, null),
            } satisfies RowMenuEntry,
          ]),
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
              onSelect: () => void removeRole(role),
            } satisfies RowMenuEntry,
          ]),
    ];
    const count = memberCounts?.get(role.id);
    // Everyone (#4191) neither moves nor goes: its page edits the rest.
    const menu = canManage
      ? {
          entries: isEveryoneRole(role) ? [] : entries,
          label: `More for ${role.name}`,
        }
      : undefined;
    return (
      <SettingsRow
        key={role.id}
        id={`role-row-${role.id}`}
        leading={<ColorDot color={role.color} />}
        label={role.name}
        description={
          isWildcardRole(role)
            ? "Can do everything"
            : isEveryoneRole(role)
              ? "Pinged as @everyone"
              : undefined
        }
        value={
          count === undefined
            ? memberCounts === null
              ? ""
              : memberCountLabel(0)
            : memberCountLabel(count)
        }
        href={links.role(role.id)}
        menu={menu}
      />
    );
  };

  // Non-chapter business (#4958, Shawn 2026-11-14): the roles members pick
  // themselves are outside the tiers by rule, and listed apart from the rest.
  const outsideAll = shown(null);
  const outside = outsideAll.filter((role) => !role.self_assignable);
  const pickable = outsideAll.filter((role) => role.self_assignable);

  return (
    <div className="space-y-8">
      {confirmDialog}
      {tiers.map((tier) => {
        const tierRoles = shown(tier.id);
        if (filtering && tierRoles.length === 0) return null;
        const editable = canManage && reachesTier(reach, tier);
        return (
          <SettingsGroup key={tier.id} heading={tier.name}>
            {filtering ? null : (
              <SettingsRow
                id={`tier-row-${tier.id}`}
                icon={ShieldCheck}
                label={PEOPLE_SETTINGS_COPY.permissionsRow}
                value={permissionsOnLabel(
                  shownPermissionCount(tier.permissions, isHidden),
                )}
                href={links.tier(tier.id)}
                menu={canManage ? { entries: [], label: tier.name } : undefined}
              />
            )}
            {tierRoles.map(roleRow)}
            {editable && !filtering ? <AddRoleRow placement={tier.id} /> : null}
          </SettingsGroup>
        );
      })}

      {canManage && addsTiers(reach) && !filtering ? (
        <SettingsGroup label={addTierLabel(words.singular)}>
          <AddTierRow
            words={words}
            onAdd={(name) =>
              run(
                () => createTier.mutateAsync({ name, permissions: [] }),
                `Couldn't add the ${words.singular}`,
                "Check the name isn't already used, then try again.",
              )
            }
          />
        </SettingsGroup>
      ) : null}

      {outside.length > 0 || (canManage && !filtering) ? (
        <SettingsGroup
          heading={outsideTiersHeading(words.plural)}
          footnote={outsideTiersFootnote(words.singular)}
        >
          {outside.map(roleRow)}
          {canManage && reachesOutside(reach) && !filtering ? (
            <AddRoleRow placement={null} />
          ) : null}
        </SettingsGroup>
      ) : null}

      {pickable.length > 0 || (canManage && !filtering) ? (
        <SettingsGroup
          heading="Non-chapter business"
          footnote={SELF_ASSIGNABLE_SECTION_CAPTION}
        >
          {pickable.length === 0 ? (
            <li className="flex min-h-11 items-center px-4 py-2.5 text-sm text-muted-foreground">
              {PEOPLE_SETTINGS_COPY.noneYet}
            </li>
          ) : (
            pickable.map(roleRow)
          )}
          {canManage && reachesOutside(reach) && !filtering ? (
            <AddRoleRow placement={null} pickable onCreated={onOpenRole} />
          ) : null}
        </SettingsGroup>
      ) : null}
    </div>
  );
}

/** The shape of an "Add …" row's button, matching `SettingsRow`'s rows. */
const ADD_ROW =
  "flex min-h-11 w-full items-center gap-4 px-4 py-2.5 text-left text-sm font-medium text-foreground transition hover:bg-card-hover group-first:rounded-t-[13px] group-last:rounded-b-[13px]";

/**
 * "Add role" as the last row of a group: the new role starts with the tier's
 * permissions, so naming it is the whole form. Color, the @mention switch and
 * any difference from the tier are set on the role's own page after.
 *
 * Under Non-chapter business (`pickable`, #5736) it creates the role outside
 * the tiers, holding nothing, and already marked for members to pick, in one
 * request, then opens its page (`onCreated`). Discord's onboarding adds a
 * question in place the same way, rather than sending an admin to build a
 * role first and flag it after.
 */
function AddRoleRow({
  placement,
  pickable = false,
  onCreated,
}: {
  placement: Placement;
  pickable?: boolean;
  onCreated?: (roleId: string) => void;
}) {
  const { toast } = useToast();
  const createRole = useCreateRole();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      // `permissions: []` means "take the tier's" (`createAsMember`); outside
      // the tiers that is nothing, which a pickable role must hold.
      const created = await createRole.mutateAsync({
        name: trimmed,
        permissions: [],
        tier_id: placement,
        ...(pickable ? { self_assignable: true } : {}),
      });
      setName("");
      setOpen(false);
      if (created.id) onCreated?.(created.id);
    } catch (error) {
      toast({
        title: NEW_PICKABLE_ROLE_COPY.failed,
        description: getErrorMessage(error, NEW_PICKABLE_ROLE_COPY.failedBody),
        variant: "destructive",
      });
    }
  }

  if (!open) {
    return (
      <li className="group">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(ADD_ROW, FOCUS_RING)}
        >
          <Plus
            className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
            aria-hidden
          />
          {PEOPLE_SETTINGS_COPY.addRole}
        </button>
      </li>
    );
  }
  return (
    <li className="px-4 py-2">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          aria-label={pickable ? NEW_PICKABLE_ROLE_COPY.title : "New role name"}
          placeholder={
            pickable ? NEW_PICKABLE_ROLE_COPY.placeholder : "Philanthropy chair"
          }
          value={name}
          maxLength={ROLE_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          className="max-w-xs"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!name.trim() || createRole.isPending}
        >
          {PEOPLE_SETTINGS_COPY.addRole}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </form>
    </li>
  );
}

/**
 * "Add tier", one row under the last tier: name it and it goes at the
 * bottom, holding nothing; its page (from its Permissions row) moves it up
 * and switches on what it can do.
 */
function AddTierRow({
  words,
  onAdd,
}: {
  words: ReturnType<typeof useRolesData>["words"];
  onAdd: (name: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (await onAdd(trimmed)) {
      setName("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <li className="group">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(ADD_ROW, FOCUS_RING)}
        >
          <Layers
            className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
            aria-hidden
          />
          Add {words.singular}
        </button>
      </li>
    );
  }
  return (
    <li className="px-4 py-2">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          aria-label={`New ${words.singular} name`}
          placeholder="Committee chairs"
          value={name}
          maxLength={ROLE_TIER_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          className="max-w-xs"
        />
        <Button type="submit" size="sm" disabled={!name.trim()}>
          Add {words.singular}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </form>
    </li>
  );
}
