import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  groupFollowsLabel,
  useCreateGroup,
  useDeleteGroup,
  useGroups,
  useMembers,
  useSetGroupMembership,
  useUpdateGroup,
  type ChapterGroup,
  type MemberProfile,
  type UpdateChapterGroupBody,
} from "@repo/hooks";
import { describeLoadFailure, errorCopy } from "@repo/hooks/error-copy";
import { matchesWordStarts } from "@repo/hooks/fuzzy-match";
import { memberLabel } from "@repo/hooks/display-names";
import {
  AUTO_GROUP_FOOTNOTE,
  deleteGroupConfirm,
  GROUP_MEMBERS_MAX,
  GROUP_NAME_MAX_LENGTH,
  GROUPS_FOOTNOTE,
  GROUPS_MAX,
  groupDisplayName,
  memberCountLabel,
  PEOPLE_SETTINGS_COPY,
  roleColorOrNull,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/screen-shell";
import { BACK_TO_ROLES } from "@/components/back-row";
import { HeaderButton } from "@/components/header-button";
import {
  itemMenuAccessibility,
  longPressOf,
  openItemMenu,
  type ItemMenu,
  type ItemMenuHandle,
} from "@/components/item-actions-menu";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { CloseGlyph, MoreGlyph, PlusGlyph } from "@/components/control-glyphs";
import { IconButton } from "@/components/icon-button";
import { OptionSheet } from "@/components/option-sheet";
import { Toggle } from "@/components/toggle";
import { NameSheet } from "@/components/roles/name-sheet";
import { RoleColorRow } from "@/components/roles/role-color-row";
import { SavedTextField } from "@/components/settings/saved-text-field";
import { usePendingSetting } from "@repo/hooks/use-pending-setting";
import { saveSetting } from "@/lib/settings/chapter-tab";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import { useFrappTheme } from "@/lib/theme";

/** The page of the groups Frapp keeps, on the Roles and groups route. */
export const AUTOMATIC_GROUPS = "automatic";

/** Pushes a group's page, or the automatic groups', on Roles and groups. */
function useGroupLinks() {
  const router = useRouter();
  return {
    group: (groupId: string) =>
      router.push({ pathname: "/chapter-roles", params: { group: groupId } }),
    automatic: () =>
      router.push({
        pathname: "/chapter-roles",
        params: { groups: AUTOMATIC_GROUPS },
      }),
  };
}

/** A group's color, as the dot that leads its row. */
export function ColorDot({ color }: { color: string | null | undefined }) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const hex = roleColorOrNull(color);
  return (
    <View
      style={[
        styles.dot,
        hex ? { backgroundColor: hex, borderColor: hex } : null,
      ]}
    />
  );
}

/** A menu the shared host draws, as a row's long press takes it. */
function hosted(menu: ItemMenu | null): ItemMenuHandle | null {
  if (!menu || menu.actions.length === 0) return null;
  return {
    ...menu,
    open: (pageY, trigger) => openItemMenu(menu, { pageY, trigger }),
  };
}

/**
 * The Groups group of Roles and groups on the phone (#6029), web's
 * `GroupsGroup` in the same rows, order and words: the chapter's own groups,
 * each opening its page (a long press offers Delete group to a
 * `groups:manage` holder); New group, which names one and opens its page;
 * then one row for the groups Frapp keeps from member details (pledge
 * classes, class years and majors, #5778), which opens their list. A search
 * shows every matching group inline, with what it follows.
 */
export function GroupsSection({
  canManage,
  query,
  filtering,
}: {
  canManage: boolean;
  query: string;
  filtering: boolean;
}) {
  const groupsQuery = useGroups();
  const create = useCreateGroup();
  const remove = useDeleteGroup();
  const links = useGroupLinks();
  const { tokens } = useFrappTheme();
  const newGroupRef = useRef<BottomSheetModal>(null);
  const [failure, setFailure] = useState<{
    groupId: string;
    message: string;
  } | null>(null);

  const groups = groupsQuery.data;
  if (!groups) {
    if (groupsQuery.isError) {
      return (
        <>
          <SectionHeader>{PEOPLE_SETTINGS_COPY.groupsHeading}</SectionHeader>
          <ErrorState
            title="Couldn't load groups"
            body={describeLoadFailure(groupsQuery.error)}
            onRetry={() => void groupsQuery.refetch()}
            isRetrying={groupsQuery.isFetching}
          />
        </>
      );
    }
    return null;
  }
  const manual = groups.filter((group) => group.kind === "manual");
  const automatic = groups.filter((group) => group.kind !== "manual");
  const shown = filtering
    ? groups.filter((group) =>
        matchesWordStarts(groupDisplayName(group), query),
      )
    : manual;
  if (filtering && shown.length === 0) return null;

  async function handleDelete(group: ChapterGroup) {
    const words = deleteGroupConfirm(group.name);
    const ok = await confirmAlert({
      title: words.title,
      body: words.body,
      confirmLabel: words.action,
      destructive: true,
    });
    if (!ok) return;
    setFailure(null);
    try {
      await remove.mutateAsync(group.id);
    } catch (error) {
      setFailure({
        groupId: group.id,
        message: `Couldn't delete ${group.name}. ${errorCopy(error, "Retry in a moment.", { serverWritesForMembers: true })}`,
      });
    }
  }

  return (
    <>
      <SectionHeader>{PEOPLE_SETTINGS_COPY.groupsHeading}</SectionHeader>
      <ListSection footnote={GROUPS_FOOTNOTE}>
        {shown.map((group) => {
          const menu = hosted(
            canManage && group.kind === "manual"
              ? {
                  title: group.name,
                  actions: [
                    {
                      key: "delete",
                      label: PEOPLE_SETTINGS_COPY.deleteGroup,
                      destructive: true,
                      run: () => void handleDelete(group),
                    },
                  ],
                }
              : null,
          );
          const failed = failure?.groupId === group.id ? failure.message : null;
          return (
            <ListRow
              key={group.id}
              leading={<ColorDot color={group.color} />}
              label={groupDisplayName(group)}
              description={
                failed ?? (filtering ? groupFollowsLabel(group) : null)
              }
              descriptionTone={failed ? "destructive" : "default"}
              value={memberCountLabel(group.member_ids.length)}
              accessibilityHint="Opens the group."
              onPress={() => links.group(group.id)}
              onLongPress={longPressOf(menu)}
              {...itemMenuAccessibility(menu)}
            />
          );
        })}
        {canManage && !filtering && manual.length < GROUPS_MAX ? (
          <ListRow
            label={PEOPLE_SETTINGS_COPY.newGroup}
            leading={<PlusGlyph color={tokens.color.text.mutedForeground} />}
            action
            accessibilityHint="Names a group, then opens it to pick who's in it."
            onPress={() => newGroupRef.current?.present()}
          />
        ) : null}
        {!filtering && automatic.length > 0 ? (
          <ListRow
            label={PEOPLE_SETTINGS_COPY.autoGroupsRow}
            value={String(automatic.length)}
            onPress={links.automatic}
          />
        ) : null}
        {!filtering &&
        manual.length === 0 &&
        automatic.length === 0 &&
        !canManage ? (
          <ListRow label={PEOPLE_SETTINGS_COPY.noneYet} variant="detail" />
        ) : null}
      </ListSection>
      {canManage ? (
        <NameSheet
          ref={newGroupRef}
          title={PEOPLE_SETTINGS_COPY.newGroup}
          submitLabel="Add group"
          placeholder="Third floor"
          fieldLabel="New group name"
          maxLength={GROUP_NAME_MAX_LENGTH}
          onSubmit={async (name) => {
            try {
              const group = await create.mutateAsync({ name });
              if (group) links.group(group.id);
              return null;
            } catch (error) {
              return `Couldn't add the group. ${errorCopy(error, "Check the name isn't already used, then try again.", { serverWritesForMembers: true })}`;
            }
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The groups Frapp keeps from member details (#5778), web's
 * `AutomaticGroupsPage`: one per pledge class, graduation year and major,
 * each with what it follows. Who's in them follows each member's own data,
 * so only their color and ping switch change, on each one's page.
 */
export function AutomaticGroupsPage() {
  const groupsQuery = useGroups();
  const links = useGroupLinks();
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const automatic = (groupsQuery.data ?? []).filter(
    (group) => group.kind !== "manual",
  );
  let body: React.ReactNode;
  if (groupsQuery.isError && groupsQuery.data === undefined) {
    body = (
      <ErrorState
        title="Couldn't load groups"
        body={describeLoadFailure(groupsQuery.error)}
        onRetry={() => void groupsQuery.refetch()}
        isRetrying={groupsQuery.isFetching}
      />
    );
  } else if (!groupsQuery.data) {
    body = (
      <SkeletonRegion label="Loading groups" style={styles.skeleton}>
        <ListSection>
          {[0, 1, 2].map((index) => (
            <ListRowSkeleton key={index} index={index} />
          ))}
        </ListSection>
      </SkeletonRegion>
    );
  } else {
    body = (
      <ListSection>
        {automatic.length === 0 ? (
          <ListRow label={PEOPLE_SETTINGS_COPY.noneYet} variant="detail" />
        ) : (
          automatic.map((group) => (
            <ListRow
              key={group.id}
              leading={<ColorDot color={group.color} />}
              label={groupDisplayName(group)}
              description={groupFollowsLabel(group)}
              value={memberCountLabel(group.member_ids.length)}
              accessibilityHint="Opens the group."
              onPress={() => links.group(group.id)}
            />
          ))
        )}
      </ListSection>
    );
  }
  return (
    <ScreenShell
      back={BACK_TO_ROLES}
      title={PEOPLE_SETTINGS_COPY.autoGroupsRow}
      refresh={() => groupsQuery.refetch()}
    >
      {body}
    </ScreenShell>
  );
}

function rowName(member: MemberProfile): string {
  return memberLabel(member.display_name, member.user_id);
}

/**
 * One group's page on the phone (#6029), web's `GroupPage`: its name on
 * top, its color and ping switch, then its members. Each saves on its own
 * the moment it changes (#6033), as on web: a manual group's members are
 * added and taken out one at a time, as Discord's role members are, and a
 * refusal is said on the row that made it (the phone has no toast). An
 * automatic group's name and members follow member details and read-only
 * here. Delete group sits in the header's ⋯ (rulebook § 2).
 */
export function GroupPage({
  groupId,
  canManage,
}: {
  groupId: string;
  canManage: boolean;
}) {
  const groupsQuery = useGroups();
  const membersQuery = useMembers();
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const group = (groupsQuery.data ?? []).find((g) => g.id === groupId) ?? null;
  const members = membersQuery.data;
  const failed =
    (groupsQuery.isError && groupsQuery.data === undefined) ||
    (membersQuery.isError && members === undefined);

  if (failed) {
    return (
      <ScreenShell back={BACK_TO_ROLES} title="Group">
        <ErrorState
          title="Couldn't load this group"
          body={describeLoadFailure(groupsQuery.error ?? membersQuery.error)}
          onRetry={() => {
            void groupsQuery.refetch();
            void membersQuery.refetch();
          }}
          isRetrying={groupsQuery.isFetching || membersQuery.isFetching}
        />
      </ScreenShell>
    );
  }
  if (!groupsQuery.data || !members) {
    return (
      <ScreenShell back={BACK_TO_ROLES} title="Group">
        <SkeletonRegion label="Loading group" style={styles.skeleton}>
          <ListSection>
            {[0, 1, 2].map((index) => (
              <ListRowSkeleton key={index} index={index} />
            ))}
          </ListSection>
        </SkeletonRegion>
      </ScreenShell>
    );
  }
  if (!group) {
    return (
      <ScreenShell back={BACK_TO_ROLES} title="Group">
        <ErrorState
          title="This group is gone"
          body={`Someone may have deleted it. Go back to ${PEOPLE_SETTINGS_COPY.pageTitle} to see the groups as they are now.`}
        />
      </ScreenShell>
    );
  }
  // Keyed by group, so a pending change never carries over to the next one.
  return (
    <GroupBody
      key={group.id}
      group={group}
      members={members}
      canManage={canManage}
    />
  );
}

function GroupBody({
  group,
  members: liveMembers,
  canManage,
}: {
  group: ChapterGroup;
  members: readonly MemberProfile[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const update = useUpdateGroup();
  const membership = useSetGroupMembership();
  const remove = useDeleteGroup();
  const addSheetRef = useRef<BottomSheetModal>(null);
  const manual = group.kind === "manual";
  // The roster as it stood when the page opened, so rows don't shift under
  // the officer when a background read lands.
  const [members] = useState(liveMembers);
  const busy = remove.isPending;

  // Each setting saves on its own the moment it changes (#6033), sending
  // only its own key. A refusal is said on the row that made it: `name`
  // under the field, a member's on their row, `add` on Add member.
  const [failure, setFailure] = useState<{
    key: string;
    words: string;
  } | null>(null);
  const failureOf = (key: string) =>
    failure?.key === key ? failure.words : null;
  const saveGroup = useCallback(
    async (body: UpdateChapterGroupBody): Promise<true | string> => {
      const key = Object.keys(body)[0] ?? "";
      setFailure(null);
      const result = await saveSetting(
        () => update.mutateAsync({ id: group.id, body }),
        PEOPLE_SETTINGS_COPY.saveFallback,
      );
      if (result === true) return true;
      const words = `${PEOPLE_SETTINGS_COPY.saveGroupFailed}. ${result}`;
      setFailure({ key, words });
      return words;
    },
    [update, group.id],
  );
  // A stored value that may not paint reads as none, as every client paints it.
  const [color, changeColor] = usePendingSetting<string | null>(
    roleColorOrNull(group.color),
    useCallback(
      async (next) => (await saveGroup({ color: next })) === true,
      [saveGroup],
    ),
  );
  const [mentionable, changeMentionable] = usePendingSetting(
    group.mentionable,
    useCallback(
      async (next) => (await saveGroup({ mentionable: next })) === true,
      [saveGroup],
    ),
  );
  // Members are added and taken out one at a time, each saving at once:
  // one member's change never re-sends the whole list from a page another
  // officer has changed since. A row is held while its change is out.
  const [moving, setMoving] = useState<ReadonlySet<string>>(new Set());

  const byUser = useMemo(
    () => new Map(members.map((member) => [member.user_id, member])),
    [members],
  );
  const pickedSet = useMemo(
    () => new Set(group.member_ids),
    [group.member_ids],
  );
  const addable = useMemo(
    () =>
      members
        .filter((member) => !pickedSet.has(member.user_id))
        .sort((a, b) => rowName(a).localeCompare(rowName(b))),
    [members, pickedSet],
  );
  const rows = group.member_ids
    .map((userId) => ({
      userId,
      name: byUser.has(userId)
        ? rowName(byUser.get(userId)!)
        : "A former member",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // The cap stays as a guard: a full group takes no one else.
  const full = group.member_ids.length >= GROUP_MEMBERS_MAX;

  async function moveMember(userId: string, into: boolean) {
    setFailure(null);
    setMoving((previous) => new Set(previous).add(userId));
    const result = await saveSetting(
      () => membership.mutateAsync({ groupId: group.id, userId, in: into }),
      PEOPLE_SETTINGS_COPY.saveFallback,
    );
    if (result !== true) {
      setFailure({
        key: into ? "add" : `member:${userId}`,
        words: `${PEOPLE_SETTINGS_COPY.saveGroupFailed}. ${result}`,
      });
    }
    setMoving((previous) => {
      const next = new Set(previous);
      next.delete(userId);
      return next;
    });
  }

  async function handleDelete() {
    const words = deleteGroupConfirm(group.name);
    const ok = await confirmAlert({
      title: words.title,
      body: words.body,
      confirmLabel: words.action,
      destructive: true,
    });
    if (!ok) return;
    setFailure(null);
    try {
      await remove.mutateAsync(group.id);
      router.back();
    } catch (error) {
      // Said under the name, the page's first row, as the role page does.
      setFailure({
        key: "name",
        words: `Couldn't delete ${group.name}. ${errorCopy(error, "Retry in a moment.", { serverWritesForMembers: true })}`,
      });
    }
  }

  return (
    <ScreenShell
      back={BACK_TO_ROLES}
      title={groupDisplayName(group)}
      headerAction={
        canManage && manual ? (
          <HeaderButton
            label={`More for ${group.name}`}
            disabled={busy}
            onPress={() =>
              openItemMenu({
                title: group.name,
                actions: [
                  {
                    key: "delete",
                    label: PEOPLE_SETTINGS_COPY.deleteGroup,
                    destructive: true,
                    run: () => void handleDelete(),
                  },
                ],
              })
            }
          >
            <MoreGlyph color={tokens.color.text.foreground} />
          </HeaderButton>
        ) : undefined
      }
    >
      <SavedTextField
        label={PEOPLE_SETTINGS_COPY.name}
        value={group.name}
        editable={manual && canManage && !busy}
        maxLength={GROUP_NAME_MAX_LENGTH}
        failure={failureOf("name")}
        onSave={(next) => saveGroup({ name: next })}
      />

      <ListSection
        footnote={
          group.kind === "manual" ? null : AUTO_GROUP_FOOTNOTE[group.kind]
        }
      >
        <RoleColorRow
          label={PEOPLE_SETTINGS_COPY.color}
          value={color}
          subject={group.id}
          name={group.name}
          onChange={(next) => void changeColor(next)}
          failure={failureOf("color")}
          disabled={!canManage || busy}
        />
        <ListRow
          label={PEOPLE_SETTINGS_COPY.mentionGroup}
          description={failureOf("mentionable")}
          descriptionTone="destructive"
          trailing={
            <Toggle
              value={mentionable}
              disabled={!canManage || busy}
              onValueChange={(next) => void changeMentionable(next)}
              accessibilityLabel={PEOPLE_SETTINGS_COPY.mentionGroup}
            />
          }
        />
      </ListSection>

      <SectionHeader count={rows.length}>
        {PEOPLE_SETTINGS_COPY.members}
      </SectionHeader>
      <ListSection
        footnote={
          manual && canManage && full
            ? `A group can hold at most ${GROUP_MEMBERS_MAX} members.`
            : null
        }
      >
        {rows.length === 0 ? (
          <ListRow label={PEOPLE_SETTINGS_COPY.noneYet} variant="detail" />
        ) : (
          rows.map((row) => (
            <ListRow
              key={row.userId}
              label={row.name}
              disabled={moving.has(row.userId)}
              description={failureOf(`member:${row.userId}`)}
              descriptionTone="destructive"
              trailing={
                manual && canManage ? (
                  <IconButton
                    label={`Remove ${row.name} from ${group.name}`}
                    disabled={busy || moving.has(row.userId)}
                    onPress={() => void moveMember(row.userId, false)}
                  >
                    <CloseGlyph color={tokens.color.text.mutedForeground} />
                  </IconButton>
                ) : undefined
              }
            />
          ))
        )}
        {manual && canManage ? (
          <ListRow
            label={PEOPLE_SETTINGS_COPY.addMember}
            leading={<PlusGlyph color={tokens.color.text.mutedForeground} />}
            action
            disabled={busy || full || addable.length === 0}
            description={
              failureOf("add") ??
              (addable.length === 0 ? "Everyone is already in it." : null)
            }
            descriptionTone={failureOf("add") ? "destructive" : "default"}
            onPress={() => addSheetRef.current?.present()}
          />
        ) : null}
      </ListSection>

      {manual && canManage ? (
        <OptionSheet
          ref={addSheetRef}
          title={PEOPLE_SETTINGS_COPY.addMember}
          searchPlaceholder="Find a member"
          options={addable.map((member) => ({
            value: member.user_id,
            label: rowName(member),
          }))}
          selected={null}
          onSelect={(userId) => {
            if (userId === null || pickedSet.has(userId) || full) return;
            void moveMember(userId, true);
          }}
        />
      ) : null}
    </ScreenShell>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    skeleton: { gap: tokens.spacing.lg },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: tokens.color.border.input,
    },
  });
}
