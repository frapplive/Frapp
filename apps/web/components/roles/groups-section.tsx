"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, Palette, Users, X } from "lucide-react";
import {
  groupFollowsLabel,
  useCreateGroup,
  useDeleteGroup,
  useGroups,
  useMembers,
  useChapterRoleColors,
  useSetGroupMembership,
  useUpdateGroup,
  useViewerDisplayName,
  type ChapterGroup,
  type UpdateChapterGroupBody,
  type MemberProfile,
} from "@repo/hooks";
import { matchesWordStarts, normalizeWords } from "@repo/hooks/fuzzy-match";
import { memberLabel } from "@repo/hooks/display-names";
import {
  AUTO_GROUP_FOOTNOTE,
  deleteGroupConfirm,
  deleteGroupFailed,
  GROUP_MEMBERS_MAX,
  GROUP_NAME_MAX_LENGTH,
  groupDisplayName,
  GROUPS_FOOTNOTE,
  GROUPS_MAX,
  memberCountLabel,
  PEOPLE_SETTINGS_COPY,
  roleColorLabel,
  roleColorOrNull,
} from "@repo/validation";
import { IconButton } from "@/components/ui/icon-button";
import { FOCUS_RING } from "@/components/ui/focus";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RoleColorPicker } from "@/components/roles/role-color-picker";
import { ColorDot } from "@/components/roles/roles-overview";
import {
  ErrorState,
  OfflineState,
  anyReadUncached,
  pausedRead,
} from "@/components/shared/async-states";
import {
  confirmWords,
  useConfirmDialog,
} from "@/components/shared/confirm-dialog";
import { InlineNote } from "@/components/shared/inline-note";
import { MemberSearchField } from "@/components/shared/member-search-field";
import {
  ActionMenuButton,
  type RowMenuEntry,
} from "@/components/shared/row-menu";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { SettingsListCardSkeleton } from "@/components/settings/settings-skeleton";
import { SettingsTextField } from "@/components/settings/settings-name-field";
import { usePendingSetting } from "@repo/hooks/use-pending-setting";
import {
  SettingsBackLink,
  SettingsSubpage,
} from "@/components/settings/settings-subpage";
import { useToast } from "@/lib/hooks/use-toast";
import { useToastedRun } from "@/lib/hooks/use-toasted-run";
import { SettingsAddRow } from "@/components/shared/settings-add-row";
import { useNetwork } from "@/lib/providers/network-provider";
import { cn, getErrorMessage } from "@/lib/utils";

/** Where a group row leads. */
export type GroupLinks = {
  group: (groupId: string) => string;
  /** The page listing the groups Frapp keeps from member details. */
  automatic: string;
};

/**
 * The Groups group of Settings → Roles and groups (#4076; one page with the
 * roles since Paul's 2026-11-19 call: "Why would we keep roles and groups in
 * 2 DIFFERENT PLACES?"; rows since #6029): named sets of members, such as
 * Third floor or Live-ins, that carry no permissions. A group can be
 * `@`-mentioned and picked in a channel's who-can-see and who-can-post lists.
 * Modeled on Slack's user groups (a name, a handle, its members, nothing
 * else) rather than on a Discord role, which is also a grant: here the grant
 * stays with roles and tiers. Behavior: `spec/behavior/members.md` § Groups.
 *
 * Each of the chapter's own groups is a row that opens its page; New group
 * names one and opens it. The groups Frapp keeps from member details (one
 * per pledge class, graduation year and major, #5778) are one row, since a
 * chapter with twenty classes and thirty majors would otherwise list fifty
 * groups here; a search shows them inline.
 *
 * Every write needs `groups:manage`, which also shows the Roles and groups
 * tab to a holder without `roles:manage` (`settings-access.ts`). A member's
 * groups are also set from their profile (`MemberAssignments`).
 */
export function GroupsGroup({
  canManage,
  query,
  links,
  onCreated,
}: {
  canManage: boolean;
  query: string;
  links: GroupLinks;
  /** Opens the new group's page, where its members are picked. */
  onCreated: (groupId: string) => void;
}) {
  const groupsQuery = useGroups();
  const { isOffline } = useNetwork();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  const remove = useDeleteGroup();

  const groups = groupsQuery.data ?? [];
  const manual = groups.filter((group) => group.kind === "manual");
  const automatic = groups.filter((group) => group.kind !== "manual");
  const filtering = normalizeWords(query).length > 0;
  const paused = pausedRead(groupsQuery);

  if (isOffline && anyReadUncached(groupsQuery)) {
    return (
      <OfflineState
        title="Groups are unavailable offline"
        description="Reconnect to load them and make changes."
        onRetry={() => void groupsQuery.refetch()}
      />
    );
  }
  if (groupsQuery.isLoading || paused) {
    return <SettingsListCardSkeleton label="Loading groups" />;
  }
  if (groupsQuery.isError && groupsQuery.data === undefined) {
    return (
      <ErrorState
        title="Couldn't load groups"
        description="Retry to fetch them again."
        onRetry={() => void groupsQuery.refetch()}
      />
    );
  }

  async function handleDelete(group: ChapterGroup) {
    const confirmed = await confirm({
      ...confirmWords(deleteGroupConfirm(group.name)),
      tone: "destructive",
    });
    if (!confirmed) return;
    try {
      await remove.mutateAsync(group.id);
      toast({ title: `${group.name} deleted` });
    } catch (error) {
      toast({
        title: deleteGroupFailed(group.name),
        description: getErrorMessage(error, "Retry in a moment."),
        variant: "destructive",
      });
    }
  }

  const row = (group: ChapterGroup) => (
    <SettingsRow
      key={group.id}
      id={`group-row-${group.id}`}
      leading={<ColorDot color={group.color} />}
      label={groupDisplayName(group)}
      description={
        filtering ? (groupFollowsLabel(group) ?? undefined) : undefined
      }
      value={memberCountLabel(group.member_ids.length)}
      href={links.group(group.id)}
      menu={
        canManage && group.kind === "manual"
          ? {
              label: `More for ${group.name}`,
              entries: [
                {
                  type: "item",
                  key: "delete",
                  label: PEOPLE_SETTINGS_COPY.deleteGroup,
                  destructive: true,
                  disabled: remove.isPending,
                  onSelect: () => void handleDelete(group),
                },
              ],
            }
          : undefined
      }
    />
  );

  const shownGroups = filtering
    ? groups.filter((group) =>
        matchesWordStarts(groupDisplayName(group), query),
      )
    : manual;
  if (filtering && shownGroups.length === 0) return null;

  return (
    <>
      {confirmDialog}
      <SettingsGroup
        // Settings search lands here (`settings-search.ts`).
        id="settings-groups"
        heading={PEOPLE_SETTINGS_COPY.groupsHeading}
        footnote={GROUPS_FOOTNOTE}
      >
        {shownGroups.map(row)}
        {canManage && !filtering ? (
          <NewGroupRow
            full={manual.length >= GROUPS_MAX}
            onCreated={onCreated}
          />
        ) : null}
        {!filtering && automatic.length > 0 ? (
          <SettingsRow
            id="group-row-automatic"
            icon={Users}
            label={PEOPLE_SETTINGS_COPY.autoGroupsRow}
            value={String(automatic.length)}
            href={links.automatic}
          />
        ) : null}
        {!filtering &&
        manual.length === 0 &&
        automatic.length === 0 &&
        !canManage ? (
          <li className="flex min-h-11 items-center px-4 py-2.5 text-sm text-muted-foreground">
            {PEOPLE_SETTINGS_COPY.noneYet}
          </li>
        ) : null}
      </SettingsGroup>
    </>
  );
}

/** New group: name it in place, then its page opens to pick who's in it. */
function NewGroupRow({
  full,
  onCreated,
}: {
  full: boolean;
  onCreated: (groupId: string) => void;
}) {
  const run = useToastedRun();
  const create = useCreateGroup();
  return (
    <SettingsAddRow
      label={PEOPLE_SETTINGS_COPY.newGroup}
      inputLabel="New group name"
      placeholder="Third floor"
      maxLength={GROUP_NAME_MAX_LENGTH}
      submitLabel="Add group"
      full={
        full
          ? `This chapter has ${GROUPS_MAX} groups, the most it can hold.`
          : null
      }
      onAdd={(name) =>
        run(
          async () => {
            const group = await create.mutateAsync({ name });
            if (group) onCreated(group.id);
          },
          `Couldn't add ${name}`,
          "Pick a name no role, tier or group already has, then try again.",
        )
      }
    />
  );
}

/**
 * The groups Frapp keeps from member details (#5778), one per pledge class,
 * graduation year and major: who's in them follows each member's own data, so
 * only their color and ping switch change, on each one's page.
 */
export function AutomaticGroupsPage({
  backHref,
  groupHref,
}: {
  backHref: string;
  groupHref: (groupId: string) => string;
}) {
  const groupsQuery = useGroups();
  const { isOffline } = useNetwork();
  const automatic = (groupsQuery.data ?? []).filter(
    (group) => group.kind !== "manual",
  );
  return (
    <SettingsSubpage
      backHref={backHref}
      backLabel={PEOPLE_SETTINGS_COPY.pageTitle}
      title={PEOPLE_SETTINGS_COPY.autoGroupsRow}
    >
      {isOffline && anyReadUncached(groupsQuery) ? (
        <OfflineState
          title="Groups are unavailable offline"
          description="Reconnect to load them."
          onRetry={() => void groupsQuery.refetch()}
        />
      ) : groupsQuery.isLoading || pausedRead(groupsQuery) ? (
        <SettingsListCardSkeleton label="Loading groups" />
      ) : groupsQuery.isError && groupsQuery.data === undefined ? (
        <ErrorState
          title="Couldn't load groups"
          description="Retry to fetch them again."
          onRetry={() => void groupsQuery.refetch()}
        />
      ) : automatic.length === 0 ? (
        <InlineNote>{PEOPLE_SETTINGS_COPY.noneYet}</InlineNote>
      ) : (
        <SettingsGroup label={PEOPLE_SETTINGS_COPY.autoGroupsRow}>
          {automatic.map((group) => (
            <SettingsRow
              key={group.id}
              id={`group-row-${group.id}`}
              leading={<ColorDot color={group.color} />}
              label={groupDisplayName(group)}
              description={groupFollowsLabel(group) ?? undefined}
              value={memberCountLabel(group.member_ids.length)}
              href={groupHref(group.id)}
            />
          ))}
        </SettingsGroup>
      )}
    </SettingsSubpage>
  );
}

function rowName(member: MemberProfile): string {
  return memberLabel(member.display_name, member.user_id);
}

/**
 * One group's page (#6029; the docked editor until then): its name on top,
 * its color and ping switch, then its members. Each saves on its own the
 * moment it changes (#6033): a manual group's members are added and taken
 * out one at a time, as Discord's role members are. An automatic group's
 * name and members follow member details and read-only here.
 */
export function GroupPage({
  groupId,
  canManage,
  backHref,
  backLabel,
  onDone,
}: {
  groupId: string;
  canManage: boolean;
  backHref: string;
  backLabel: string;
  /** Back to where the page was opened from, after Delete. */
  onDone: () => void;
}) {
  const groupsQuery = useGroups();
  const membersQuery = useMembers();
  const group = (groupsQuery.data ?? []).find((g) => g.id === groupId) ?? null;
  const members = membersQuery.data;
  const { isOffline } = useNetwork();

  if (isOffline && anyReadUncached(groupsQuery, membersQuery)) {
    return (
      <div className="space-y-4">
        <SettingsBackLink href={backHref} label={backLabel} />
        <OfflineState
          title="This group is unavailable offline"
          description="Reconnect to load it and make changes."
          onRetry={() => {
            void groupsQuery.refetch();
            void membersQuery.refetch();
          }}
        />
      </div>
    );
  }
  if (
    groupsQuery.isLoading ||
    pausedRead(groupsQuery) ||
    (group && members === undefined && pausedRead(membersQuery)) ||
    (group && members === undefined && membersQuery.isLoading)
  ) {
    return (
      <div className="space-y-4">
        <SettingsBackLink href={backHref} label={backLabel} />
        <SettingsListCardSkeleton label="Loading group" />
      </div>
    );
  }
  if (!group || !members) {
    return (
      <div className="space-y-4">
        <SettingsBackLink href={backHref} label={backLabel} />
        <ErrorState
          title={
            groupsQuery.isError || membersQuery.isError
              ? "Couldn't load this group"
              : "This group is gone"
          }
          description={
            groupsQuery.isError || membersQuery.isError
              ? `Retry, or go back to ${backLabel}.`
              : `Someone may have deleted it. Go back to ${backLabel} to see the groups as they are now.`
          }
          onRetry={
            groupsQuery.isError || membersQuery.isError
              ? () => {
                  void groupsQuery.refetch();
                  void membersQuery.refetch();
                }
              : undefined
          }
        />
      </div>
    );
  }
  return (
    <GroupBody
      // Keyed by group, so a draft never carries over to the next one.
      key={group.id}
      group={group}
      members={members}
      canManage={canManage}
      backHref={backHref}
      backLabel={backLabel}
      onDone={onDone}
    />
  );
}

function GroupBody({
  group,
  members: liveMembers,
  canManage,
  backHref,
  backLabel,
  onDone,
}: {
  group: ChapterGroup;
  /** The loaded roster; the page never mounts without it. */
  members: readonly MemberProfile[];
  canManage: boolean;
  backHref: string;
  backLabel: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  const run = useToastedRun();
  const update = useUpdateGroup();
  const membership = useSetGroupMembership();
  const remove = useDeleteGroup();
  const manual = group.kind === "manual";
  // The roster as it stood when the page opened, so the rows don't shift
  // under the officer when a background read lands.
  const [members] = useState(liveMembers);
  const chapterColors = useChapterRoleColors();
  const viewerName = useViewerDisplayName();
  const editable = canManage;
  // Each setting saves on its own the moment it changes (#6033), sending
  // only its own key.
  const saveGroup = useCallback(
    (body: UpdateChapterGroupBody) =>
      run(
        () => update.mutateAsync({ id: group.id, body }),
        PEOPLE_SETTINGS_COPY.saveGroupFailed,
        PEOPLE_SETTINGS_COPY.saveFallback,
      ),
    [run, update, group.id],
  );
  const [color, changeColor] = usePendingSetting<string | null>(
    roleColorOrNull(group.color),
    useCallback((next) => saveGroup({ color: next }), [saveGroup]),
  );
  // The picker's draft while it is open: a Custom drag picks on every move,
  // so the color saves once, when the picker closes, as the phone's sheet
  // does.
  const [colorDraft, setColorDraft] = useState<string | null | undefined>(
    undefined,
  );
  const shownColor = colorDraft === undefined ? color : colorDraft;
  function commitColor() {
    if (colorDraft === undefined) return;
    setColorDraft(undefined);
    if (colorDraft !== color) void changeColor(colorDraft);
  }
  const [mentionable, changeMentionable] = usePendingSetting(
    group.mentionable,
    useCallback((next) => saveGroup({ mentionable: next }), [saveGroup]),
  );
  // What the name field holds, for the color picker's preview.
  const [draftName, setDraftName] = useState(group.name);
  // Members are added and taken out one at a time, each saving at once, the
  // way Discord's role members do: one member's change never re-sends the
  // whole list from a page another officer has changed since.
  const [moving, setMoving] = useState<ReadonlySet<string>>(new Set());
  const busy = remove.isPending;

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
        // Anyone whose add is in flight is left out, so a second click
        // never sends it twice.
        .filter(
          (member) =>
            !pickedSet.has(member.user_id) && !moving.has(member.user_id),
        )
        .sort((a, b) => rowName(a).localeCompare(rowName(b))),
    [members, pickedSet, moving],
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
    setMoving((previous) => new Set(previous).add(userId));
    await run(
      () => membership.mutateAsync({ groupId: group.id, userId, in: into }),
      PEOPLE_SETTINGS_COPY.saveGroupFailed,
      PEOPLE_SETTINGS_COPY.saveFallback,
    );
    setMoving((previous) => {
      const next = new Set(previous);
      next.delete(userId);
      return next;
    });
  }

  async function handleDelete() {
    const confirmed = await confirm({
      ...confirmWords(deleteGroupConfirm(group.name)),
      tone: "destructive",
    });
    if (!confirmed) return;
    try {
      await remove.mutateAsync(group.id);
      toast({ title: `${group.name} deleted` });
      onDone();
    } catch (error) {
      toast({
        title: deleteGroupFailed(group.name),
        description: getErrorMessage(error, "Retry in a moment."),
        variant: "destructive",
      });
    }
  }

  const entries: RowMenuEntry[] = [
    {
      type: "item",
      key: "delete",
      label: PEOPLE_SETTINGS_COPY.deleteGroup,
      destructive: true,
      disabled: busy,
      onSelect: () => void handleDelete(),
    },
  ];
  const autoFootnote =
    [
      group.kind === "manual" ? null : AUTO_GROUP_FOOTNOTE[group.kind],
      // Disabled with the reason (rulebook): a viewer who can open the page
      // but not change it is told why.
      editable ? null : "Only officers who manage groups can change these.",
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <SettingsSubpage
      backHref={backHref}
      backLabel={backLabel}
      title={groupDisplayName(group)}
      titleLeading={<ColorDot color={group.color} />}
      actions={
        editable && manual ? (
          <ActionMenuButton
            entries={entries}
            label={`More for ${group.name}`}
          />
        ) : null
      }
    >
      {confirmDialog}
      <div className="max-w-md">
        <SettingsTextField
          id="group-edit-name"
          label={PEOPLE_SETTINGS_COPY.name}
          value={group.name}
          maxLength={GROUP_NAME_MAX_LENGTH}
          disabled={!manual || !editable || busy}
          onTextChange={setDraftName}
          onSave={(next) => saveGroup({ name: next })}
        />
      </div>

      <SettingsGroup label={group.name} footnote={autoFootnote}>
        <SettingsRow
          icon={Palette}
          label={PEOPLE_SETTINGS_COPY.color}
          control={
            <Popover onOpenChange={(open) => (open ? null : commitColor())}>
              <PopoverTrigger
                disabled={!editable || busy}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition hover:bg-card-hover disabled:opacity-50",
                  FOCUS_RING,
                )}
              >
                <ColorDot color={shownColor} />
                {roleColorLabel(shownColor)}
                <ChevronDown className="h-4 w-4 opacity-50" aria-hidden />
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-auto max-w-[min(30rem,calc(100vw-2rem))]"
              >
                <span id="group-edit-color-label" className="sr-only">
                  {PEOPLE_SETTINGS_COPY.color}
                </span>
                <RoleColorPicker
                  labelId="group-edit-color-label"
                  value={shownColor}
                  onChange={setColorDraft}
                  disabled={busy}
                  previewName={draftName || group.name}
                  memberName={viewerName}
                  chapterColors={chapterColors}
                />
              </PopoverContent>
            </Popover>
          }
        />
        <SettingsRow
          label={PEOPLE_SETTINGS_COPY.mentionGroup}
          checked={mentionable}
          disabled={!editable || busy}
          onCheckedChange={(next) => void changeMentionable(next)}
        />
      </SettingsGroup>

      <div className="space-y-2">
        <SettingsGroup
          heading={`${PEOPLE_SETTINGS_COPY.members} · ${rows.length}`}
        >
          {rows.length === 0 ? (
            <li className="flex min-h-11 items-center px-4 py-2.5 text-sm text-muted-foreground">
              {PEOPLE_SETTINGS_COPY.noneYet}
            </li>
          ) : (
            rows.map((row) => (
              <li
                key={row.userId}
                className="flex min-h-11 items-center gap-2 px-4 py-1.5"
              >
                <span className="min-w-0 flex-1 break-words text-sm">
                  {row.name}
                </span>
                {manual && editable ? (
                  <IconButton
                    label={`Remove ${row.name} from ${group.name}`}
                    disabled={busy || moving.has(row.userId)}
                    onClick={() => void moveMember(row.userId, false)}
                  >
                    <X className="h-4 w-4" />
                  </IconButton>
                ) : null}
              </li>
            ))
          )}
        </SettingsGroup>
        {manual && editable ? (
          <div className="max-w-md">
            <MemberSearchField
              label={PEOPLE_SETTINGS_COPY.addMember}
              items={addable}
              nameOf={rowName}
              keyOf={(member) => member.user_id}
              onAdd={(member) => void moveMember(member.user_id, true)}
              emptyText="Everyone is already in it."
              disabled={busy || full}
            />
          </div>
        ) : null}
        {manual && editable && full ? (
          <p role="alert" className="text-caption text-destructive-text">
            {PEOPLE_SETTINGS_COPY.groupFull}
          </p>
        ) : null}
      </div>
    </SettingsSubpage>
  );
}
