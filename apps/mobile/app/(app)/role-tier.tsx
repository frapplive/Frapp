import { useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  useDeleteRoleTier,
  useReorderRoleTiers,
  useUpdateRoleTier,
} from "@repo/hooks";
import { describeLoadFailure, errorCopy } from "@repo/hooks/error-copy";
import { usePermissionOverlay } from "@repo/hooks/permission-overlay";
import { byDisplayOrder, mayGrant, reachesTier } from "@repo/hooks/role-tiers";
import {
  deleteTierConfirm,
  deleteTierLabel,
  memberCountLabel,
  mentionTierLabel,
  PEOPLE_SETTINGS_COPY,
  ROLE_TIER_NAME_MAX_LENGTH,
  tierPermissionsFootnote,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { ScreenShell } from "@/components/screen-shell";
import { BACK_TO_ROLES } from "@/components/back-row";
import { HeaderButton } from "@/components/header-button";
import { MoreGlyph } from "@/components/control-glyphs";
import {
  openItemMenu,
  type ItemMenuAction,
} from "@/components/item-actions-menu";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { Toggle } from "@/components/toggle";
import { PermissionToggleList } from "@/components/roles/permission-toggle-list";
import { ColorDot } from "@/components/roles/groups-section";
import {
  ChapterTextField,
  FormFields,
} from "@/components/settings/chapter-form";
import { describeError } from "@/lib/roles/save-error";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import {
  CANT_GIVE,
  lockedReasonFor,
  useRolesData,
} from "@/lib/roles/use-roles-data";
import { useFrappTheme } from "@/lib/theme";

/**
 * A tier's page on the phone (#4074; web's in the same rows and words since
 * #6029): its name on top, saved on its own when the field is left, as
 * web's `SettingsNameField`; its @mention switch; the roles in it; then one
 * switch per permission, grouped by module, saved on tap. A switch here
 * changes every role in the tier at once; a role set apart from its tier on
 * its own page keeps that difference (the API rewrites each role "with its
 * own overrides applied").
 *
 * The tier's order and deletion sit in the header's ⋯ (Move up, Move down,
 * Delete tier), where the officer is already looking at it, as on web. The
 * rank rules are web's (`@repo/hooks/role-tiers`): a tier at or above the
 * officer's own is read-only and says so once, and a permission their role
 * lacks can't be switched on and says why on its row.
 */
export default function RoleTierScreen() {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const params = useLocalSearchParams<{ tierId?: string | string[] }>();
  const tierId = Array.isArray(params.tierId)
    ? params.tierId[0]
    : (params.tierId ?? "");
  const data = useRolesData();
  const { rolesQuery, tiersQuery, roles, tiers, reach, canManage, words } =
    data;
  const tier = tiers.find((candidate) => candidate.id === tierId) ?? null;
  const holders = useMemo(() => (tier ? [tier] : []), [tier]);
  const updateTier = useUpdateRoleTier();
  const reorderTiers = useReorderRoleTiers();
  const deleteTier = useDeleteRoleTier();
  const [failure, setFailure] = useState<{
    permission: string;
    message: string;
  } | null>(null);
  // A failed rename, move, ping switch or deletion: said under the name.
  const [pageFailure, setPageFailure] = useState<string | null>(null);
  const { permissionsOf, toggle, pending } = usePermissionOverlay(
    holders,
    (holder, next) =>
      updateTier.mutateAsync({ id: holder.id, body: { permissions: next } }),
    (holder, error, permission) =>
      setFailure({ permission, message: describeError(holder.name, error) }),
  );
  const tierRoles = useMemo(
    () => roles.filter((role) => role.tier_id === tierId).sort(byDisplayOrder),
    [roles, tierId],
  );
  const backLabel = PEOPLE_SETTINGS_COPY.pageTitle;

  if (
    (tiersQuery.isError && tiersQuery.data === undefined) ||
    (rolesQuery.isError && rolesQuery.data === undefined)
  ) {
    return (
      <ScreenShell back={BACK_TO_ROLES} title={words.Singular}>
        <ErrorState
          title={`Couldn't load this ${words.singular}`}
          body={describeLoadFailure(tiersQuery.error ?? rolesQuery.error)}
          onRetry={() => {
            void tiersQuery.refetch();
            void rolesQuery.refetch();
          }}
          isRetrying={tiersQuery.isFetching || rolesQuery.isFetching}
        />
      </ScreenShell>
    );
  }
  if (!tiersQuery.isSuccess || !rolesQuery.isSuccess) {
    return (
      <ScreenShell back={BACK_TO_ROLES} title={words.Singular}>
        <SkeletonRegion label="Loading permissions" style={styles.skeleton}>
          <ListSection>
            {[0, 1, 2, 3, 4].map((index) => (
              <ListRowSkeleton key={index} index={index} />
            ))}
          </ListSection>
        </SkeletonRegion>
      </ScreenShell>
    );
  }
  if (!tier) {
    return (
      <ScreenShell back={BACK_TO_ROLES} title={words.Singular}>
        <ErrorState
          title={`This ${words.singular} is gone`}
          body={`Someone may have deleted it. Go back to ${backLabel} to see the ${words.plural} as they are now.`}
        />
      </ScreenShell>
    );
  }

  const held = permissionsOf(tier);
  const editable = canManage && reachesTier(reach, tier);
  const lockedReason = lockedReasonFor(data, editable, words.singular);
  const index = tiers.findIndex((candidate) => candidate.id === tier.id);
  const above = tiers[index - 1];
  const below = tiers[index + 1];

  async function run(action: () => Promise<unknown>, fallback: string) {
    setPageFailure(null);
    try {
      await action();
      return true;
    } catch (error) {
      setPageFailure(
        `Couldn't change ${tier!.name}. ${errorCopy(error, fallback, { serverWritesForMembers: true })}`,
      );
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
      `Someone may have changed the ${words.plural} since you opened this page. Go back and try again.`,
    );
  }

  async function remove() {
    const confirm = deleteTierConfirm(tier!.name, words.singular, words.plural);
    const ok = await confirmAlert({
      title: confirm.title,
      body: confirm.body,
      confirmLabel: confirm.action,
      destructive: true,
    });
    if (!ok) return;
    if (
      await run(
        () => deleteTier.mutateAsync(tier!.id),
        `Move its roles to another ${words.singular} first.`,
      )
    ) {
      router.back();
    }
  }

  const menuActions: ItemMenuAction[] = [
    ...(above && reachesTier(reach, above)
      ? [
          {
            key: "up",
            label: PEOPLE_SETTINGS_COPY.moveUp,
            run: () => move(-1),
          },
        ]
      : []),
    ...(below && reachesTier(reach, below)
      ? [
          {
            key: "down",
            label: PEOPLE_SETTINGS_COPY.moveDown,
            run: () => move(1),
          },
        ]
      : []),
    // The API refuses to delete a tier with roles in it, so the menu only
    // offers it once the tier is empty and says so until then.
    ...(tierRoles.length === 0
      ? [
          {
            key: "delete",
            label: deleteTierLabel(words.singular),
            destructive: true,
            run: () => void remove(),
          },
        ]
      : []),
  ];

  return (
    <ScreenShell
      back={BACK_TO_ROLES}
      title={tier.name}
      headerAction={
        editable ? (
          <HeaderButton
            label={`More for ${tier.name}`}
            onPress={() =>
              openItemMenu({
                title: tier.name,
                message:
                  tierRoles.length > 0
                    ? `${deleteTierLabel(words.singular)} (move its roles out first)`
                    : undefined,
                actions: menuActions,
              })
            }
          >
            <MoreGlyph color={tokens.color.text.foreground} />
          </HeaderButton>
        ) : undefined
      }
    >
      <TierNameField
        value={tier.name}
        editable={editable}
        failure={pageFailure}
        onSave={(name) =>
          run(
            () => updateTier.mutateAsync({ id: tier.id, body: { name } }),
            "The name was not changed. Try again in a moment.",
          )
        }
      />

      {/*
        #4076 (Paul and Shawn, 2026-11-11): a tier's name is pingable, and
        reaches everyone holding a role in it. Saved on the flip.
      */}
      <ListSection>
        <ListRow
          label={mentionTierLabel(words.singular)}
          trailing={
            <Toggle
              value={tier.mentionable}
              disabled={!editable || updateTier.isPending}
              onValueChange={(on) =>
                void run(
                  () =>
                    updateTier.mutateAsync({
                      id: tier.id,
                      body: { mentionable: on },
                    }),
                  "Try again in a moment.",
                )
              }
              accessibilityLabel={mentionTierLabel(words.singular)}
            />
          }
        />
      </ListSection>

      {tierRoles.length > 0 ? (
        <>
          <SectionHeader>
            {PEOPLE_SETTINGS_COPY.rolesInTierHeading}
          </SectionHeader>
          <ListSection>
            {tierRoles.map((role) => {
              const count =
                data.memberCounts?.get(role.id) ??
                (data.memberCounts ? 0 : null);
              return (
                <ListRow
                  key={role.id}
                  label={role.name}
                  leading={<ColorDot color={role.color} />}
                  value={count === null ? null : memberCountLabel(count)}
                  accessibilityHint="Opens what this role can do."
                  onPress={() =>
                    router.push({
                      pathname: "/role",
                      params: { roleId: role.id },
                    })
                  }
                />
              );
            })}
          </ListSection>
        </>
      ) : null}

      <PermissionToggleList
        holderName={tier.name}
        isOn={(permission) => held.includes(permission)}
        onToggle={(permission, on) => {
          setFailure(null);
          void toggle(tier, permission, on);
        }}
        failure={failure}
        extraPermissions={held}
        lockedReason={lockedReason}
        footnote={tierPermissionsFootnote(tier.name)}
        rowLockedReason={(permission, on) =>
          !on && !mayGrant(reach, permission) ? CANT_GIVE : null
        }
        pendingPermission={pending?.id === tier.id ? pending.permission : null}
      />
    </ScreenShell>
  );
}

/**
 * The tier's name, saved on its own when the field is left, as web's
 * `SettingsNameField`: a blank name puts the saved one back, and a rename
 * made elsewhere replaces what it shows while it isn't being edited.
 */
function TierNameField({
  value,
  editable,
  failure,
  onSave,
}: {
  value: string;
  editable: boolean;
  failure: string | null;
  onSave: (next: string) => Promise<boolean>;
}) {
  // What the officer is typing, or `null` while the field shows the saved name.
  const [draft, setDraft] = useState<string | null>(null);

  async function commit() {
    if (draft === null) return;
    const next = draft.trim();
    if (!next || next === value) {
      setDraft(null);
      return;
    }
    // Held until saved, so the field doesn't flick back to the old name;
    // a failed save keeps it for another try.
    if (await onSave(next)) setDraft(null);
  }

  return (
    <FormFields>
      <ChapterTextField
        label={PEOPLE_SETTINGS_COPY.name}
        value={draft ?? value}
        onChangeText={setDraft}
        onBlur={() => void commit()}
        editable={editable}
        maxLength={ROLE_TIER_NAME_MAX_LENGTH}
        error={failure}
      />
    </FormFields>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    skeleton: { gap: tokens.spacing.lg },
  });
}
