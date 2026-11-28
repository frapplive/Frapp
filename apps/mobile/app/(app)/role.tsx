import { useMemo, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useIsPermissionHidden, useUpdateRole } from "@repo/hooks";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import {
  useOverrideOverlay,
  usePermissionOverlay,
} from "@repo/hooks/permission-overlay";
import {
  isWildcardRole,
  mayGrant,
  permissionRows,
  permissionsAfterMove,
  reachesOutside,
  reachesRole,
  reachesTier,
  type TieredRole,
  type TierRow,
} from "@repo/hooks/role-tiers";
import {
  groupPermissionsByModule,
  isActiveRole,
  isEveryoneRole,
  memberCountLabel,
  outsideTiersHeading,
  PEOPLE_SETTINGS_COPY,
  ROLE_NAME_MAX_LENGTH,
  roleColorOrNull,
  rolePermissionsFootnote,
  SELF_ASSIGNABLE_REFUSAL_COPY,
  SELF_ASSIGNABLE_SWITCH_DESCRIPTION,
  selfAssignableRefusal,
  setApartLabel,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { ScreenShell } from "@/components/screen-shell";
import { BACK_TO_ROLES } from "@/components/back-row";
import { HeaderButton } from "@/components/header-button";
import { MoreGlyph } from "@/components/control-glyphs";
import { openItemMenu } from "@/components/item-actions-menu";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { OptionSheet } from "@/components/option-sheet";
import {
  PermissionGroup,
  PermissionToggleList,
} from "@/components/roles/permission-toggle-list";
import {
  OverrideSheet,
  type OverrideTarget,
} from "@/components/roles/override-sheet";
import { RoleColorRow } from "@/components/roles/role-color-row";
import { useRoleActions } from "@/components/roles/role-actions";
import { Toggle } from "@/components/toggle";
import {
  ChapterTextField,
  FormCommitRow,
  FormFields,
  FormHint,
  useFormSaveStatus,
} from "@/components/settings/chapter-form";
import { describeError } from "@/lib/roles/save-error";
import {
  CANT_GIVE,
  lockedReasonFor,
  useRolesData,
  type RolesData,
} from "@/lib/roles/use-roles-data";
import { useFrappTheme } from "@/lib/theme";
import { ROLES_HIDDEN_TITLE, useCanSeeRoles } from "@/lib/roles/can-see-roles";

type Failure = { permission: string; message: string } | null;

/** The Tier picker's value for "outside the tiers". */
const OUTSIDE = "__outside__";

/**
 * One role's page on the phone (#4074; web's in the same rows and words
 * since #6029): its name on top, then the Role group (its tier, color, how
 * many hold it, its @mention switch and, for a role the chapter made,
 * Non-chapter business), saved together by Save role, as on web until #6033;
 * then what it can do. Move up, Move down and Delete role sit in the
 * header's ⋯, never beside Save (rulebook § 2), as on web.
 *
 * - **In a tier**, each permission row shows what the role ends up with (On
 *   or Off), and a row set apart from the tier says so on its second line
 *   (`setApartLabel`). A tap opens the three answers web gives
 *   (`overrideChoiceLabels`, `components/roles/override-sheet.tsx`); each
 *   saves on its own.
 * - **Outside the tiers**, each permission is a plain switch.
 * - **The President's role** (`*`) can do everything and shows every switch
 *   on and still; it moves only through Transfer presidency.
 *
 * View as a role stays on web: the phone has no preview mode. Giving a
 * member a role is the Directory's member profile (#3676).
 */
export default function RoleScreen() {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const params = useLocalSearchParams<{ roleId?: string | string[] }>();
  const roleId = Array.isArray(params.roleId)
    ? params.roleId[0]
    : (params.roleId ?? "");
  const data = useRolesData();
  const canSeeRoles = useCanSeeRoles();
  const { rolesQuery, tiersQuery, roles, words } = data;
  const role = roles.find((candidate) => candidate.id === roleId) ?? null;

  if (
    (rolesQuery.isError && rolesQuery.data === undefined) ||
    (tiersQuery.isError && tiersQuery.data === undefined)
  ) {
    return (
      <ScreenShell back={BACK_TO_ROLES} title="Role">
        <ErrorState
          title="Couldn't load this role"
          body={describeLoadFailure(rolesQuery.error ?? tiersQuery.error)}
          onRetry={() => {
            void rolesQuery.refetch();
            void tiersQuery.refetch();
          }}
          isRetrying={rolesQuery.isFetching || tiersQuery.isFetching}
        />
      </ScreenShell>
    );
  }
  if (!rolesQuery.isSuccess || !tiersQuery.isSuccess) {
    return (
      <ScreenShell back={BACK_TO_ROLES} title="Role">
        <SkeletonRegion label="Loading role" style={styles.skeleton}>
          <ListSection>
            {[0, 1, 2, 3, 4].map((index) => (
              <ListRowSkeleton key={index} index={index} />
            ))}
          </ListSection>
        </SkeletonRegion>
      </ScreenShell>
    );
  }
  if (canSeeRoles === false) {
    return (
      <ScreenShell back={BACK_TO_ROLES} title="Role">
        <ErrorState
          title={ROLES_HIDDEN_TITLE}
          body="Ask an officer who manages roles if you need to see this."
        />
      </ScreenShell>
    );
  }
  if (!role) {
    return (
      <ScreenShell back={BACK_TO_ROLES} title="Role">
        <ErrorState
          title="This role is gone"
          body={`Someone may have deleted it. Go back to ${PEOPLE_SETTINGS_COPY.pageTitle} to see the ${words.plural} as they are now.`}
        />
      </ScreenShell>
    );
  }
  // Keyed by role so the drafts and a failure line start over for another.
  return <RoleBody key={role.id} role={role} data={data} />;
}

function RoleBody({ role, data }: { role: TieredRole; data: RolesData }) {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const { tiers, reach, canManage, words, memberCounts } = data;
  const updateRole = useUpdateRole();
  const actions = useRoleActions(data);
  const status = useFormSaveStatus();
  const tierSheetRef = useRef<BottomSheetModal>(null);
  const tier = tiers.find((candidate) => candidate.id === role.tier_id) ?? null;
  // A tier_id naming a missing tier reads as outside, as the list shows it.
  const tierId = tier?.id ?? null;
  // The Everyone role (#4191): its permissions and @everyone switch change
  // here; its name and tier are fixed, as the API holds them.
  const everyone = isEveryoneRole(role);
  // Actives (#5802) stays in its tier: presidency's claim walk stops there.
  const tierFixed = everyone || isActiveRole(role);
  const wildcard = isWildcardRole(role);
  const editable = canManage && reachesRole(reach, role, tiers);
  const count = memberCounts?.get(role.id) ?? (memberCounts ? 0 : null);
  const lockedReason = wildcard
    ? "This role can do everything. That only moves through Transfer presidency."
    : lockedReasonFor(data, editable, "role");

  const [name, setName] = useState(role.name);
  // A stored value that may not paint reads as none, as every client paints it.
  const [color, setColor] = useState<string | null>(
    roleColorOrNull(role.color),
  );
  const [colorTouched, setColorTouched] = useState(false);
  const [placement, setPlacement] = useState(tierId ?? OUTSIDE);
  const [mentionable, setMentionable] = useState(role.mentionable);
  const [pickable, setPickable] = useState(role.self_assignable);
  const [saving, setSaving] = useState(false);
  const draftTierId = placement === OUTSIDE ? null : placement;
  // Non-chapter business (#4958) is judged against the drafted placement,
  // since a move into a tier is what most often rules it out.
  const pickRefusal = selfAssignableRefusal({
    system_key: role.system_key,
    tier_id: draftTierId,
    permissions:
      draftTierId === tierId
        ? role.permissions
        : permissionsAfterMove(
            tiers.find((candidate) => candidate.id === draftTierId)
              ?.permissions ?? [],
            role.permission_overrides,
          ),
  });

  const trimmed = name.trim();
  const changes = {
    name: trimmed && trimmed !== role.name ? trimmed : undefined,
    // `null` clears the color; sent only when the officer picked one.
    color: colorTouched && color !== (role.color ?? null) ? color : undefined,
    mentionable: mentionable !== role.mentionable ? mentionable : undefined,
    self_assignable: pickable !== role.self_assignable ? pickable : undefined,
    tier_id: draftTierId !== role.tier_id ? draftTierId : undefined,
  };
  const dirty = Object.values(changes).some((value) => value !== undefined);

  function edited<T>(set: (next: T) => void) {
    return (next: T) => {
      status.clear();
      set(next);
    };
  }

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      // **No `permissions` key.** The rows below save on their own; sending
      // a list here would roll back a pick made since this page opened.
      await updateRole.mutateAsync({ id: role.id, body: changes });
      setColorTouched(false);
      status.saved();
    } catch (error) {
      status.failed(error, "Your change wasn't saved. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  const placementName =
    placement === OUTSIDE
      ? outsideTiersHeading(words.plural)
      : (tiers.find((candidate) => candidate.id === placement)?.name ?? "");
  const tierOptions = [
    ...tiers
      .filter(
        (candidate) => candidate.id === tierId || reachesTier(reach, candidate),
      )
      .map((candidate) => ({ value: candidate.id, label: candidate.name })),
    ...(tierId === null || reachesOutside(reach)
      ? [{ value: OUTSIDE, label: outsideTiersHeading(words.plural) }]
      : []),
  ];
  const menuActions = [
    ...actions.stepActions(role),
    ...actions.deleteActions(role, () => router.back()),
  ];

  return (
    <ScreenShell
      back={BACK_TO_ROLES}
      title={role.name}
      headerAction={
        editable && !everyone && menuActions.length > 0 ? (
          <HeaderButton
            label={`More for ${role.name}`}
            onPress={() =>
              openItemMenu({ title: role.name, actions: menuActions })
            }
          >
            <MoreGlyph color={tokens.color.text.foreground} />
          </HeaderButton>
        ) : undefined
      }
    >
      {everyone ? (
        <FormHint>
          Every member holds it, including someone who has just joined and has
          no base role yet.
        </FormHint>
      ) : null}

      <FormFields>
        <ChapterTextField
          label={PEOPLE_SETTINGS_COPY.name}
          value={name}
          onChangeText={edited(setName)}
          editable={editable && !everyone && !saving}
          maxLength={ROLE_NAME_MAX_LENGTH}
          error={actions.failure?.message ?? null}
        />
      </FormFields>

      <SectionHeader>{PEOPLE_SETTINGS_COPY.roleHeading}</SectionHeader>
      <ListSection>
        <ListRow
          label={words.Singular}
          value={placementName}
          disabled={!editable || tierFixed}
          onPress={
            editable && !tierFixed
              ? () => tierSheetRef.current?.present()
              : undefined
          }
          accessibilityHint={`Opens the ${words.plural}.`}
        />
        {tier ? (
          // What the tier gives lives on its page: the way there, for
          // anyone who can see this role (web's "Open <tier>").
          <ListRow
            label={`Open ${tier.name}`}
            onPress={() =>
              router.push({
                pathname: "/role-tier",
                params: { tierId: tier.id },
              })
            }
            accessibilityHint={`Opens ${tier.name}: what every role in it can do.`}
          />
        ) : null}
        <RoleColorRow
          label={PEOPLE_SETTINGS_COPY.color}
          value={color}
          subject={role.id}
          name={trimmed || role.name}
          onChange={(next) => {
            status.clear();
            setColor(next);
            setColorTouched(true);
          }}
          disabled={!editable}
        />
        <ListRow
          label={PEOPLE_SETTINGS_COPY.members}
          value={count === null ? "" : memberCountLabel(count)}
          variant="detail"
        />
        {/*
          Owner, 2026-11-06: "anyone can ping any role by default. officers
          can change defaults." (spec/behavior/chat/README.md § Role mentions)
        */}
        <ListRow
          label={
            everyone
              ? "Anyone can use @everyone and @here"
              : PEOPLE_SETTINGS_COPY.mentionRole
          }
          trailing={
            <Toggle
              value={mentionable}
              disabled={!editable || saving}
              onValueChange={edited(setMentionable)}
              accessibilityLabel={`@mention for ${role.name}`}
            />
          }
        />
        {/*
          Non-chapter business (#4958): interest roles members pick
          themselves. Built-in roles never are, so they don't show it.
          spec/behavior/rbac.md § Self-assignable roles.
        */}
        {role.system_key ? null : (
          <ListRow
            label="Non-chapter business"
            description={
              pickRefusal
                ? SELF_ASSIGNABLE_REFUSAL_COPY[pickRefusal]
                : SELF_ASSIGNABLE_SWITCH_DESCRIPTION
            }
            trailing={
              <Toggle
                value={pickable}
                disabled={
                  !editable || saving || (pickRefusal !== null && !pickable)
                }
                onValueChange={edited(setPickable)}
                accessibilityLabel={`Non-chapter business for ${role.name}`}
              />
            }
          />
        )}
      </ListSection>
      {editable ? (
        <FormCommitRow
          label="Save role"
          canSave
          readOnlyLine=""
          disabled={!dirty || saving}
          busy={saving}
          status={status.status}
          onPress={() => void save()}
        />
      ) : null}

      {tier && !wildcard ? (
        <OverrideList
          role={role}
          tier={tier}
          lockedReason={lockedReason}
          footnote={rolePermissionsFootnote(tier.name, words.plural)}
          mayGrant={(permission) => mayGrant(reach, permission)}
        />
      ) : (
        <OwnPermissions
          role={role}
          wildcard={wildcard}
          lockedReason={lockedReason}
          footnote={
            wildcard ? null : rolePermissionsFootnote(null, words.plural)
          }
          mayGrant={(permission) => mayGrant(reach, permission)}
        />
      )}

      {editable && !tierFixed ? (
        <OptionSheet
          ref={tierSheetRef}
          title={words.Singular}
          options={tierOptions}
          selected={placement}
          onSelect={(value) => {
            status.clear();
            setPlacement(value ?? OUTSIDE);
          }}
        />
      ) : null}
    </ScreenShell>
  );
}

/** A role outside the tiers, or the President's: one switch per permission. */
function OwnPermissions({
  role,
  wildcard,
  lockedReason,
  footnote,
  mayGrant: canGive,
}: {
  role: TieredRole;
  wildcard: boolean;
  lockedReason: string | null;
  footnote: string | null;
  mayGrant: (permission: string) => boolean;
}) {
  const updateRole = useUpdateRole();
  const holders = useMemo(() => [role], [role]);
  const [failure, setFailure] = useState<Failure>(null);
  const { permissionsOf, toggle, pending } = usePermissionOverlay(
    holders,
    (holder, next) =>
      updateRole.mutateAsync({ id: holder.id, body: { permissions: next } }),
    (holder, error, permission) =>
      setFailure({ permission, message: describeError(holder.name, error) }),
  );
  const held = permissionsOf(role);

  return (
    <PermissionToggleList
      holderName={role.name}
      isOn={(permission) => wildcard || held.includes(permission)}
      onToggle={(permission, on) => {
        setFailure(null);
        void toggle(role, permission, on);
      }}
      extraPermissions={wildcard ? [] : held}
      lockedReason={lockedReason}
      footnote={footnote}
      rowLockedReason={(permission, on) =>
        !on && !canGive(permission) ? CANT_GIVE : null
      }
      pendingPermission={pending?.id === role.id ? pending.permission : null}
      failure={failure}
    />
  );
}

/**
 * A role in a tier: each permission's answer, and where it comes from, with
 * the three-way pick a tap away. Each pick saves on its own, as one key of
 * `permission_overrides`, through the overlay web's list uses.
 */
function OverrideList({
  role,
  tier,
  lockedReason,
  footnote,
  mayGrant: canGive,
}: {
  role: TieredRole;
  tier: TierRow;
  lockedReason: string | null;
  footnote: string;
  mayGrant: (permission: string) => boolean;
}) {
  const updateRole = useUpdateRole();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [target, setTarget] = useState<OverrideTarget | null>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const { overrideOf, set, pending } = useOverrideOverlay(
    role,
    (permission, value) =>
      updateRole.mutateAsync({
        id: role.id,
        body: { permission_overrides: { [permission]: value } },
      }),
    (error, permission) =>
      setFailure({ permission, message: describeError(role.name, error) }),
  );
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
    <>
      {lockedReason ? <FormHint>{lockedReason}</FormHint> : null}
      {groups.map((group, index) => (
        <PermissionGroup
          key={group.label}
          label={group.label}
          footnote={index === 0 ? footnote : null}
        >
          {group.entries.map((row) => {
            const tierHas = tier.permissions.includes(row.permission);
            const override = overrideOf(row.permission);
            const holds = override ?? tierHas;
            const stored = role.permission_overrides[row.permission];
            const allowed = canGive(row.permission);
            // What the API refuses (#4071): an override switched on, or any
            // pick that leaves the role holding something new, needs the
            // caller to hold it. Off is always allowed.
            const onRefused = !allowed && stored !== true;
            const tierRefused = !allowed && tierHas && !holds;
            const failed =
              failure?.permission === row.permission ? failure.message : null;
            // Only a row set apart says so; the footnote says where the
            // rest start from.
            const source =
              override === null ? null : setApartLabel(tier.name, tierHas);
            const locked = Boolean(lockedReason) || pending === row.permission;
            return (
              <ListRow
                key={row.permission}
                label={row.label}
                value={holds ? "On" : "Off"}
                description={failed ?? source}
                descriptionTone={failed ? "destructive" : "default"}
                accessibilityHint={
                  locked
                    ? undefined
                    : `Choose same as ${tier.name}, on, or off.`
                }
                onPress={
                  locked
                    ? undefined
                    : () => {
                        setTarget({
                          permission: row.permission,
                          label: row.label,
                          roleName: role.name,
                          tierName: tier.name,
                          tierHas,
                          current: override,
                          onRefused,
                          tierRefused,
                          refusedReason: CANT_GIVE,
                        });
                        sheetRef.current?.present();
                      }
                }
              />
            );
          })}
        </PermissionGroup>
      ))}
      <OverrideSheet
        ref={sheetRef}
        target={target}
        onPick={(permission, value) => {
          setFailure(null);
          void set(permission, value);
        }}
      />
    </>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    skeleton: { gap: tokens.spacing.lg },
  });
}
