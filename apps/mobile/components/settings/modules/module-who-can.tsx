import { useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useUpdateRole, useUpdateRoleTier } from "@repo/hooks";
import {
  modulePermissions,
  whoCanHolders,
  whoCanSummary,
} from "@repo/hooks/module-settings";
import {
  usePermissionOverlay,
  type PermissionHolder,
} from "@repo/hooks/permission-overlay";
import {
  byDisplayOrder,
  isWildcardRole,
  mayGrant,
  reachesRole,
  reachesTier,
  type TierRow,
  type TieredRole,
} from "@repo/hooks/role-tiers";
import {
  ROLE_CANT_CHANGE_THESE,
  WHO_CAN_FOOTNOTE,
  WHO_CAN_ROLES_FOOTNOTE,
  roleColorOrNull,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { CloseGlyph, PlusGlyph } from "@/components/control-glyphs";
import { IconButton } from "@/components/icon-button";
import { InlineNote } from "@/components/inline-note";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { OptionSheet } from "@/components/option-sheet";
import { SkeletonRegion } from "@/components/state-block";
import { Toggle } from "@/components/toggle";
import { describeError } from "@/lib/roles/save-error";
import { CANT_GIVE, useRolesData } from "@/lib/roles/use-roles-data";
import { useFrappTheme } from "@/lib/theme";

/**
 * A module screen's Who can on the phone (#6030), web's `module-who-can.tsx`
 * in the phone's grouped rows: one row per permission of the module, in the
 * registry's words, showing who holds it ("Exec board, Officers and chairs",
 * "Only the President") and opening that permission's own screen. The
 * holders, the summary and the rank rules are web's, through
 * `@repo/hooks/module-settings` and `@repo/hooks/role-tiers`.
 */

/** The last save that failed, said on its own row (the phone has no toast). */
type Failure = { id: string; permission: string; message: string };

/** The roles a Who can answer can name: every role but the President's. */
function useWhoCanData() {
  const data = useRolesData();
  const updateTier = useUpdateRoleTier();
  const updateRole = useUpdateRole();
  const [failure, setFailure] = useState<Failure | null>(null);
  const onError = (
    holder: PermissionHolder,
    error: unknown,
    permission: string,
  ) =>
    setFailure({
      id: holder.id,
      permission,
      message: describeError(holder.name, error),
    });
  const tierToggle = usePermissionOverlay(
    data.tiers,
    (tier, next) =>
      updateTier.mutateAsync({ id: tier.id, body: { permissions: next } }),
    onError,
  );
  const editableRoles = useMemo(
    () =>
      data.roles.filter((role) => !isWildcardRole(role)).sort(byDisplayOrder),
    [data.roles],
  );
  const roleToggle = usePermissionOverlay(
    editableRoles,
    (role, next) =>
      updateRole.mutateAsync({ id: role.id, body: { permissions: next } }),
    onError,
  );
  const tierHas = (tier: TierRow, permission: string) =>
    tierToggle.permissionsOf(tier).includes(permission);
  const roleHas = (role: TieredRole, permission: string) =>
    roleToggle.permissionsOf(role).includes(permission);
  return {
    ...data,
    editableRoles,
    tierToggle,
    roleToggle,
    tierHas,
    roleHas,
    failure,
    clearFailure: () => setFailure(null),
    holdersOf: (permission: string) =>
      whoCanHolders(permission, data.tiers, editableRoles, tierHas, roleHas),
    loading: data.rolesQuery.isPending || data.tiersQuery.isPending,
    failed:
      (data.rolesQuery.isError && data.rolesQuery.data === undefined) ||
      (data.tiersQuery.isError && data.tiersQuery.data === undefined),
  };
}

const ROLES_FAILED = "Couldn't load your chapter's roles.";

/** The module screen's Who can group: a row per permission, with its answer. */
export function ModuleWhoCanSection({
  moduleKey,
  onOpen,
}: {
  moduleKey: string;
  /** Pushes the permission's own screen. */
  onOpen: (permission: string) => void;
}) {
  const data = useWhoCanData();
  const permissions = modulePermissions(moduleKey);
  if (permissions.length === 0) return null;
  return (
    <>
      <SectionHeader>Who can</SectionHeader>
      {data.failed ? (
        <InlineNote tone="warning">{ROLES_FAILED}</InlineNote>
      ) : (
        <ListSection footnote={WHO_CAN_FOOTNOTE}>
          {permissions.map((entry) => {
            const holders = data.holdersOf(entry.permission);
            const names = [
              ...holders.tiers.map((tier) => tier.name),
              ...holders.roles.map((role) => role.name),
            ];
            return (
              <ListRow
                key={entry.permission}
                label={entry.label}
                value={data.loading ? "Loading" : whoCanSummary(names)}
                accessibilityHint={`Opens who can ${entry.label.toLowerCase()}.`}
                onPress={() => onOpen(entry.permission)}
              />
            );
          })}
        </ListSection>
      )}
    </>
  );
}

/**
 * One permission's screen, pushed from its Who can row: the chapter's tiers
 * as switches, then the roles that hold it apart from their tier, each with a
 * way to take it away, and Add a role. Saved the moment a switch flips,
 * through the tier and role screens' own writes. Editing needs
 * `roles:manage`; a tier at or above the officer's rank, or a permission
 * their role lacks, is a switch that can't move, with the reason on its line.
 */
export function WhoCanPermissionPage({
  permission,
  canEdit,
  note,
}: {
  permission: string;
  /** Whether the viewer holds `roles:manage`. */
  canEdit: boolean;
  /** A part about this permission in particular, above its tiers. */
  note?: ReactNode;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const data = useWhoCanData();
  const addSheet = useRef<BottomSheetModal>(null);
  const { tiers, editableRoles, reach, words, failure } = data;

  if (data.failed)
    return <InlineNote tone="warning">{ROLES_FAILED}</InlineNote>;
  if (data.loading) {
    return (
      <SkeletonRegion label="Loading who can">
        <ListSection>
          {[0, 1, 2, 3].map((index) => (
            <ListRowSkeleton key={index} index={index} />
          ))}
        </ListSection>
      </SkeletonRegion>
    );
  }

  const canGrant = mayGrant(reach, permission);
  const holders = data.holdersOf(permission);
  const failedOn = (id: string) =>
    failure?.id === id && failure.permission === permission
      ? failure.message
      : null;
  const tierReason = (tier: TierRow, held: boolean): string | null => {
    if (!canEdit) return null;
    if (!reachesTier(reach, tier)) {
      return "At or above your rank, so your role can't change it.";
    }
    if (!held && !canGrant) return CANT_GIVE;
    return null;
  };
  const mayEditRole = (role: TieredRole) =>
    canEdit && reachesRole(reach, role, tiers);
  const pendingOn = (
    pending: { id: string; permission: string } | null,
    id: string,
  ) => pending?.id === id && pending.permission === permission;
  const addable = canGrant
    ? editableRoles.filter(
        (role) =>
          !holders.roles.some((held) => held.id === role.id) &&
          !data.roleHas(role, permission) &&
          mayEditRole(role),
      )
    : [];
  const showRoles = holders.roles.length > 0 || (canEdit && addable.length > 0);

  return (
    <>
      {note}
      <SectionHeader>{words.Plural}</SectionHeader>
      <ListSection
        footnote={
          canEdit
            ? WHO_CAN_FOOTNOTE
            : `${WHO_CAN_FOOTNOTE} ${ROLE_CANT_CHANGE_THESE}`
        }
      >
        {tiers.map((tier) => {
          const held = data.tierHas(tier, permission);
          const reason = tierReason(tier, held);
          const failed = failedOn(tier.id);
          return (
            <ListRow
              key={tier.id}
              label={tier.name}
              description={failed ?? reason}
              descriptionTone={failed ? "destructive" : "default"}
              trailing={
                <Toggle
                  value={held}
                  disabled={
                    !canEdit ||
                    reason !== null ||
                    pendingOn(data.tierToggle.pending, tier.id)
                  }
                  onValueChange={() => {
                    data.clearFailure();
                    void data.tierToggle.toggle(tier, permission, held);
                  }}
                  accessibilityLabel={tier.name}
                />
              }
            />
          );
        })}
      </ListSection>

      {showRoles ? (
        <>
          <SectionHeader>Roles set apart</SectionHeader>
          <ListSection footnote={WHO_CAN_ROLES_FOOTNOTE}>
            {holders.roles.map((role) => {
              const color = roleColorOrNull(role.color);
              const failed = failedOn(role.id);
              return (
                <ListRow
                  key={role.id}
                  label={role.name}
                  leading={
                    <View
                      style={[
                        styles.dot,
                        color ? { backgroundColor: color } : null,
                      ]}
                    />
                  }
                  description={failed}
                  descriptionTone="destructive"
                  trailing={
                    mayEditRole(role) ? (
                      <IconButton
                        label={`Take it away from ${role.name}`}
                        disabled={pendingOn(data.roleToggle.pending, role.id)}
                        onPress={() => {
                          data.clearFailure();
                          void data.roleToggle.toggle(role, permission, true);
                        }}
                      >
                        <CloseGlyph
                          color={tokens.color.text.mutedForeground}
                          size={18}
                        />
                      </IconButton>
                    ) : undefined
                  }
                />
              );
            })}
            {canEdit && addable.length > 0 ? (
              <ListRow
                label="Add a role"
                leading={
                  <PlusGlyph color={tokens.color.text.mutedForeground} />
                }
                accessibilityHint="Opens the roles that could be given it."
                onPress={() => addSheet.current?.present()}
              />
            ) : null}
          </ListSection>
        </>
      ) : null}

      {canEdit && addable.length > 0 ? (
        <OptionSheet
          ref={addSheet}
          title="Add a role"
          options={addable.map((role) => ({
            value: role.id,
            label: role.name,
          }))}
          selected={null}
          searchPlaceholder="Find a role"
          onSelect={(roleId) => {
            const role = addable.find((candidate) => candidate.id === roleId);
            if (!role) return;
            data.clearFailure();
            void data.roleToggle.toggle(role, permission, false);
          }}
        />
      ) : null}
    </>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    // The role's own color, drawn as Roles and groups draws it beside a name.
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: tokens.color.border.input,
    },
  });
}
