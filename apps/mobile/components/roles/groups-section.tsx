import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  groupFollowsLabel,
  useCreateGroup,
  useDeleteGroup,
  useGroups,
  useMembers,
  useSetGroupMembers,
  useUpdateGroup,
  type ChapterGroup,
  type MemberProfile,
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
import {
  ChapterTextField,
  FormCommitRow,
  FormFields,
  useFormSaveStatus,
} from "@/components/settings/chapter-form";
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
 * top, its color and ping switch, then its members, and nothing written
 * until Save (#6033 makes it save on its own, on both apps at once). A
 * manual group's members are replaced whole, so a member another officer
 * removed meanwhile fails the save rather than half of it. An automatic
 * group's name and members follow member details and read-only here.
 * Delete group sits in the header's ⋯, never beside Save (rulebook § 2).
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
  // Keyed by group, so a draft never carries over to the next one.
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
  const setMembers = useSetGroupMembers();
  const remove = useDeleteGroup();
  const status = useFormSaveStatus();
  const addSheetRef = useRef<BottomSheetModal>(null);
  const manual = group.kind === "manual";
  // The roster as it stood when the page opened, so rows don't shift under
  // the officer when a background read lands.
  const [members] = useState(liveMembers);
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState<string | null>(
    roleColorOrNull(group.color),
  );
  const [mentionable, setMentionable] = useState(group.mentionable);
  const [picked, setPicked] = useState<string[]>(group.member_ids);
  const [saving, setSaving] = useState(false);
  const busy = saving || remove.isPending;

  const byUser = useMemo(
    () => new Map(members.map((member) => [member.user_id, member])),
    [members],
  );
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const addable = useMemo(
    () =>
      members
        .filter((member) => !pickedSet.has(member.user_id))
        .sort((a, b) => rowName(a).localeCompare(rowName(b))),
    [members, pickedSet],
  );
  const rows = picked
    .map((userId) => ({
      userId,
      name: byUser.has(userId)
        ? rowName(byUser.get(userId)!)
        : "A former member",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const trimmed = name.trim();
  const nameChanged = manual && trimmed !== group.name;
  const colorChanged = color !== roleColorOrNull(group.color);
  const pingChanged = mentionable !== group.mentionable;
  const membersChanged =
    manual &&
    (picked.length !== group.member_ids.length ||
      picked.some((userId) => !group.member_ids.includes(userId)));
  const tooMany = picked.length > GROUP_MEMBERS_MAX;
  const dirty = nameChanged || colorChanged || pingChanged || membersChanged;

  const edited =
    <T,>(set: (next: T) => void) =>
    (next: T) => {
      status.clear();
      set(next);
    };

  async function handleSave() {
    if (!dirty || tooMany || (manual && !trimmed)) return;
    setSaving(true);
    try {
      if (nameChanged || colorChanged || pingChanged) {
        await update.mutateAsync({
          id: group.id,
          body: {
            name: nameChanged ? trimmed : undefined,
            color: colorChanged ? color : undefined,
            mentionable: pingChanged ? mentionable : undefined,
          },
        });
      }
      if (membersChanged) {
        await setMembers.mutateAsync({ id: group.id, memberIds: picked });
      }
      status.saved();
    } catch (error) {
      status.failed(
        error,
        "Nothing more was changed. Go back and try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
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
    try {
      await remove.mutateAsync(group.id);
      router.back();
    } catch (error) {
      status.failed(error, "Retry in a moment.");
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
      <FormFields>
        <ChapterTextField
          label={PEOPLE_SETTINGS_COPY.name}
          value={name}
          onChangeText={edited(setName)}
          editable={manual && canManage && !busy}
          maxLength={GROUP_NAME_MAX_LENGTH}
        />
      </FormFields>

      <ListSection
        footnote={
          group.kind === "manual" ? null : AUTO_GROUP_FOOTNOTE[group.kind]
        }
      >
        <RoleColorRow
          label={PEOPLE_SETTINGS_COPY.color}
          value={color}
          subject={group.id}
          name={trimmed || group.name}
          onChange={edited(setColor)}
          disabled={!canManage || busy}
        />
        <ListRow
          label={PEOPLE_SETTINGS_COPY.mentionGroup}
          trailing={
            <Toggle
              value={mentionable}
              disabled={!canManage || busy}
              onValueChange={edited(setMentionable)}
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
          tooMany
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
              trailing={
                manual && canManage ? (
                  <IconButton
                    label={`Remove ${row.name} from ${group.name}`}
                    disabled={busy}
                    onPress={() => {
                      status.clear();
                      setPicked((previous) =>
                        previous.filter((userId) => userId !== row.userId),
                      );
                    }}
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
            disabled={busy || addable.length === 0}
            description={
              addable.length === 0 ? "Everyone is already in it." : null
            }
            onPress={() => addSheetRef.current?.present()}
          />
        ) : null}
      </ListSection>

      {canManage ? (
        <FormCommitRow
          label="Save"
          canSave
          readOnlyLine=""
          disabled={!dirty || tooMany || (manual && !trimmed) || busy}
          busy={saving}
          status={status.status}
          onPress={() => void handleSave()}
        />
      ) : null}

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
            if (userId === null) return;
            status.clear();
            setPicked((previous) =>
              previous.includes(userId) ? previous : [...previous, userId],
            );
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
