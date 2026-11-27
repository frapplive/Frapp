import { Fragment, useMemo, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useCreateRoleTier,
  useGroups,
  useIsPermissionHidden,
  usePermissionList,
} from "@repo/hooks";
import { describeLoadFailure, errorCopy } from "@repo/hooks/error-copy";
import { matchesWordStarts, normalizeWords } from "@repo/hooks/fuzzy-match";
import {
  addsTiers,
  byDisplayOrder,
  isWildcardRole,
  reachesOutside,
  shownPermissionCount,
  type TieredRole,
} from "@repo/hooks/role-tiers";
import {
  addTierLabel,
  can,
  canAny,
  groupDisplayName,
  isEveryoneRole,
  memberCountLabel,
  outsideTiersFootnote,
  outsideTiersHeading,
  PEOPLE_SETTINGS_COPY,
  permissionsOnLabel,
  ROLE_TIER_NAME_MAX_LENGTH,
  SELF_ASSIGNABLE_SECTION_CAPTION,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { ScreenShell } from "@/components/screen-shell";
import { BACK_TO_CHAPTER_SETTINGS } from "@/components/back-row";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { SearchField } from "@/components/filter-chips";
import { PlusGlyph } from "@/components/control-glyphs";
import { ShieldGlyph } from "@/components/settings-glyphs";
import {
  itemMenuAccessibility,
  longPressOf,
  openItemMenu,
  type ItemMenu,
  type ItemMenuHandle,
} from "@/components/item-actions-menu";
import { NewRoleSheet } from "@/components/roles/new-role-sheet";
import { NameSheet } from "@/components/roles/name-sheet";
import { useRoleActions } from "@/components/roles/role-actions";
import {
  AUTOMATIC_GROUPS,
  AutomaticGroupsPage,
  ColorDot,
  GroupPage,
  GroupsSection,
} from "@/components/roles/groups-section";
import { InvitesSection } from "@/components/roles/invites-section";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { useRolesData } from "@/lib/roles/use-roles-data";
import { newRolePlacements } from "@/lib/roles/new-role";
import { typeRole, useFrappTheme } from "@/lib/theme";

/** A list longer than this gets a search field, as web's does. */
const SEARCH_FROM = 8;

/** Where Add role puts the new role: a tier's id, outside, or pickable. */
type AddTo = { tierId: string | null } | null;

/** A menu the shared host draws, as a row's long press takes it. */
function hosted(menu: ItemMenu | null): ItemMenuHandle | null {
  if (!menu || menu.actions.length === 0) return null;
  return {
    ...menu,
    open: (pageY, trigger) => openItemMenu(menu, { pageY, trigger }),
  };
}

function firstParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first ? first : null;
}

/**
 * Chapter settings → Roles and groups on the phone (#4074; web's page in
 * the same groups, order and words since #6029, Paul's 2026-11-25 call:
 * "as drawn, on web and the phone"). The words are shared
 * (`@repo/validation`'s `people-settings-copy.ts`), so the two can't drift.
 *
 * One group per tier in rank order (its Permissions row, its roles, Add
 * role), Add tier, the roles outside the tiers, Non-chapter business,
 * Groups, then Invites and presidency. A role's long press offers what web's
 * row ⋯ does: Move up, Move down, Move to another tier, Delete role
 * (`components/roles/role-actions.ts`). A tier's name, order and deletion
 * live on its page, opened from its Permissions row, as on web.
 *
 * Like web's `?tab=roles&group=…`, this route also draws a group's page
 * (`?group=<id>`) and the groups Frapp keeps (`?groups=automatic`), pushed
 * on the stack so each goes back by the gesture
 * (`components/roles/groups-section.tsx`).
 *
 * The roles part shows to whoever web shows it to (`chapter-config:view` or
 * `roles:manage`), so a `groups:manage` holder without either sees only the
 * groups. Tier names, and the word for a tier, are the chapter's own
 * (`tierWords(vocab("tier"))`), never a constant.
 */
export default function ChapterRolesScreen() {
  const params = useLocalSearchParams<{
    group?: string | string[];
    groups?: string | string[];
  }>();
  const permissions = usePermissionList();
  const groupId = firstParam(params.group);
  if (groupId) {
    return (
      <GroupPage
        groupId={groupId}
        canManage={can("groups:manage", permissions)}
      />
    );
  }
  if (firstParam(params.groups) === AUTOMATIC_GROUPS) {
    return <AutomaticGroupsPage />;
  }
  return <RolesAndGroups />;
}

function RolesAndGroups() {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const data = useRolesData();
  const {
    rolesQuery,
    tiersQuery,
    roles,
    tiers,
    memberCounts,
    words,
    canManage,
    reach,
  } = data;
  const actions = useRoleActions(data);
  const createTier = useCreateRoleTier();
  const newPickableRef = useRef<BottomSheetModal>(null);
  const newRoleRef = useRef<BottomSheetModal>(null);
  const addTierRef = useRef<BottomSheetModal>(null);
  const [addTo, setAddTo] = useState<AddTo>(null);
  const placements = useMemo(
    () => newRolePlacements(reach, tiers, outsideTiersHeading(words.plural)),
    [reach, tiers, words.plural],
  );
  const [query, setQuery] = useState("");
  const filtering = normalizeWords(query).length > 0;
  const permissions = usePermissionList();
  const isHidden = useIsPermissionHidden();
  const canSeeRoles = canAny(
    ["roles:manage", "chapter-config:view"],
    permissions,
  );
  const groupsQuery = useGroups({ enabled: true });
  const groups = groupsQuery.data ?? [];

  const lists = useMemo(() => {
    const tierIds = new Set(tiers.map((tier) => tier.id));
    const shown = [...roles]
      .filter((role) => !filtering || matchesWordStarts(role.name, query))
      .sort(byDisplayOrder);
    // A role naming a tier this list doesn't have reads as outside, which is
    // how the API ranks it too.
    const outsideAll = shown.filter(
      (role) => !(role.tier_id && tierIds.has(role.tier_id)),
    );
    return {
      inTier: (tierId: string) =>
        shown.filter((role) => role.tier_id === tierId),
      outside: outsideAll.filter((role) => !role.self_assignable),
      pickable: outsideAll.filter((role) => role.self_assignable),
    };
  }, [roles, tiers, filtering, query]);

  const loaded = rolesQuery.isSuccess && tiersQuery.isSuccess;
  const subtitle = loaded
    ? `${roles.length} ${roles.length === 1 ? "role" : "roles"} in ${tiers.length} ${tiers.length === 1 ? words.singular : words.plural}`
    : undefined;

  const openRole = (roleId: string) =>
    router.push({ pathname: "/role", params: { roleId } });
  const openAddRole = (tierId: string | null) => {
    setAddTo({ tierId });
    newRoleRef.current?.present();
  };

  const roleRow = (role: TieredRole) => {
    // 0 once the members read lands; nothing before it, so a row never
    // claims "No members" for a role that may well have some.
    const count = memberCounts?.get(role.id) ?? (memberCounts ? 0 : null);
    const menu = hosted(actions.rowMenu(role));
    const failed =
      actions.failure?.roleId === role.id ? actions.failure.message : null;
    return (
      <ListRow
        key={role.id}
        label={role.name}
        leading={<ColorDot color={role.color} />}
        // The same notes web's list puts beside a name.
        description={
          failed ??
          (isWildcardRole(role)
            ? "Can do everything"
            : isEveryoneRole(role)
              ? "Pinged as @everyone"
              : null)
        }
        descriptionTone={failed ? "destructive" : "default"}
        value={count === null ? null : memberCountLabel(count)}
        accessibilityHint="Opens what this role can do."
        onPress={() => openRole(role.id)}
        onLongPress={longPressOf(menu)}
        {...itemMenuAccessibility(menu)}
      />
    );
  };

  const addRoleRow = (tierId: string | null) => (
    <ListRow
      label={PEOPLE_SETTINGS_COPY.addRole}
      leading={<PlusGlyph color={tokens.color.text.mutedForeground} />}
      action
      accessibilityHint="Names a role, then opens it."
      onPress={() => openAddRole(tierId)}
    />
  );

  let roleSections: React.ReactNode = null;
  if (!canSeeRoles) {
    roleSections = null;
  } else if (
    (rolesQuery.isError && rolesQuery.data === undefined) ||
    (tiersQuery.isError && tiersQuery.data === undefined)
  ) {
    roleSections = (
      <ErrorState
        title="Couldn't load roles"
        body={describeLoadFailure(rolesQuery.error ?? tiersQuery.error)}
        onRetry={() => {
          void rolesQuery.refetch();
          void tiersQuery.refetch();
        }}
        isRetrying={rolesQuery.isFetching || tiersQuery.isFetching}
      />
    );
  } else if (!loaded) {
    roleSections = (
      <SkeletonRegion label="Loading roles" style={styles.skeleton}>
        {[0, 1].map((section) => (
          <ListSection key={section}>
            {[0, 1, 2].map((index) => (
              <ListRowSkeleton key={index} index={section + index} />
            ))}
          </ListSection>
        ))}
      </SkeletonRegion>
    );
  } else {
    const canAddOutside = canManage && reach.known && reachesOutside(reach);
    roleSections = (
      <>
        {tiers.map((tier) => {
          const tierRoles = lists.inTier(tier.id);
          if (filtering && tierRoles.length === 0) return null;
          const canAdd =
            !filtering &&
            placements.some((placement) => placement.value === tier.id);
          return (
            <Fragment key={tier.id}>
              <SectionHeader>{tier.name}</SectionHeader>
              <ListSection>
                {filtering ? null : (
                  <ListRow
                    label={PEOPLE_SETTINGS_COPY.permissionsRow}
                    leading={
                      <ShieldGlyph color={tokens.color.text.mutedForeground} />
                    }
                    value={permissionsOnLabel(
                      shownPermissionCount(tier.permissions, isHidden),
                    )}
                    accessibilityHint={`Opens ${tier.name}: what every role in it can do.`}
                    onPress={() =>
                      router.push({
                        pathname: "/role-tier",
                        params: { tierId: tier.id },
                      })
                    }
                  />
                )}
                {tierRoles.map(roleRow)}
                {canAdd ? addRoleRow(tier.id) : null}
              </ListSection>
            </Fragment>
          );
        })}

        {canManage && addsTiers(reach) && !filtering ? (
          <ListSection>
            <ListRow
              label={addTierLabel(words.singular)}
              leading={<PlusGlyph color={tokens.color.text.mutedForeground} />}
              action
              accessibilityHint={`Names a ${words.singular}, added at the bottom.`}
              onPress={() => addTierRef.current?.present()}
            />
          </ListSection>
        ) : null}

        {lists.outside.length > 0 || (canManage && !filtering) ? (
          <>
            <SectionHeader>{outsideTiersHeading(words.plural)}</SectionHeader>
            <ListSection footnote={outsideTiersFootnote(words.singular)}>
              {lists.outside.map(roleRow)}
              {canAddOutside && !filtering ? addRoleRow(null) : null}
            </ListSection>
          </>
        ) : null}

        {lists.pickable.length > 0 || (canManage && !filtering) ? (
          <>
            <SectionHeader>Non-chapter business</SectionHeader>
            <ListSection footnote={SELF_ASSIGNABLE_SECTION_CAPTION}>
              {lists.pickable.length === 0 ? (
                <ListRow
                  label={PEOPLE_SETTINGS_COPY.noneYet}
                  variant="detail"
                />
              ) : (
                lists.pickable.map(roleRow)
              )}
              {canAddOutside && !filtering ? (
                <ListRow
                  label={PEOPLE_SETTINGS_COPY.addRole}
                  leading={
                    <PlusGlyph color={tokens.color.text.mutedForeground} />
                  }
                  action
                  accessibilityHint="Adds a role members can join themselves."
                  onPress={() => newPickableRef.current?.present()}
                />
              ) : null}
            </ListSection>
          </>
        ) : null}
      </>
    );
  }

  const searchable =
    (canSeeRoles ? roles.length : 0) + groups.length > SEARCH_FROM;
  const nothingMatches =
    filtering &&
    !(
      canSeeRoles && roles.some((role) => matchesWordStarts(role.name, query))
    ) &&
    !groups.some((group) => matchesWordStarts(groupDisplayName(group), query));
  const addToTier =
    addTo?.tierId != null
      ? tiers.find((tier) => tier.id === addTo.tierId)
      : undefined;

  return (
    <ScreenShell
      back={BACK_TO_CHAPTER_SETTINGS}
      title={PEOPLE_SETTINGS_COPY.pageTitle}
      subtitle={canSeeRoles ? subtitle : undefined}
      refresh={() =>
        Promise.all([
          rolesQuery.refetch(),
          tiersQuery.refetch(),
          groupsQuery.refetch(),
        ])
      }
    >
      {searchable || filtering ? (
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={PEOPLE_SETTINGS_COPY.search}
          accessibilityLabel={PEOPLE_SETTINGS_COPY.search}
          searchGlyph
        />
      ) : null}
      {nothingMatches ? (
        <Text style={styles.note}>Nothing matches “{query.trim()}”.</Text>
      ) : null}
      {roleSections}
      <GroupsSection
        canManage={can("groups:manage", permissions)}
        query={query}
        filtering={filtering}
      />
      {filtering ? null : (
        <InvitesSection
          canViewConfig={can("chapter-config:view", permissions)}
          canManageConfig={can("chapter-config:manage", permissions)}
          isPresident={permissions.includes("*")}
        />
      )}

      <NewRoleSheet
        ref={newRoleRef}
        chapterRole={{
          placements: addToTier
            ? [{ value: addToTier.id, label: addToTier.name }]
            : [{ value: null, label: outsideTiersHeading(words.plural) }],
          tierLabel: words.Singular,
        }}
        onCreated={openRole}
      />
      <NewRoleSheet ref={newPickableRef} onCreated={openRole} />
      {canManage ? (
        <NameSheet
          ref={addTierRef}
          title={addTierLabel(words.singular)}
          submitLabel={addTierLabel(words.singular)}
          placeholder="Committee chairs"
          fieldLabel={`New ${words.singular} name`}
          maxLength={ROLE_TIER_NAME_MAX_LENGTH}
          onSubmit={async (name) => {
            try {
              await createTier.mutateAsync({ name, permissions: [] });
              return null;
            } catch (error) {
              return `Couldn't add the ${words.singular}. ${errorCopy(error, "Check the name isn't already used, then try again.", { serverWritesForMembers: true })}`;
            }
          }}
        />
      ) : null}
    </ScreenShell>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    skeleton: { gap: tokens.spacing.lg },
    note: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
      paddingHorizontal: tokens.spacing.xs,
    },
  });
}
