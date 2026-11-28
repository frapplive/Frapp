"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Palette, Users, X } from "lucide-react";
import {
  groupFollowsLabel,
  useCreateGroup,
  useDeleteGroup,
  useGroups,
  useMembers,
  useChapterRoleColors,
  useSetGroupMembers,
  useUpdateGroup,
  useViewerDisplayName,
  type ChapterGroup,
  type MemberProfile,
} from "@repo/hooks";
import { matchesWordStarts, normalizeWords } from "@repo/hooks/fuzzy-match";
import { memberLabel } from "@repo/hooks/display-names";
import {
  AUTO_GROUP_FOOTNOTE,
  deleteGroupConfirm,
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
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        title: `Couldn't delete ${group.name}`,
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
 * its color and ping switch, then its members. Nothing is written until Save
 * (#6033 makes it save on its own, with every settings page at once). A
 * manual group's members are replaced whole, all or none, so a member another
 * officer removed from the chapter meanwhile fails the save rather than half
 * of it. An automatic group's name and members follow member details and
 * read-only here.
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
  /** Back to where the page was opened from, after Save, Cancel or Delete. */
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
  const update = useUpdateGroup();
  const setMembers = useSetGroupMembers();
  const remove = useDeleteGroup();
  const manual = group.kind === "manual";
  // The roster as it stood when the page opened, so the rows don't shift
  // under the officer when a background read lands.
  const [members] = useState(liveMembers);
  const [name, setName] = useState(group.name);
  const chapterColors = useChapterRoleColors();
  const viewerName = useViewerDisplayName();
  const [color, setColor] = useState<string | null>(
    roleColorOrNull(group.color),
  );
  const [mentionable, setMentionable] = useState(group.mentionable);
  const [picked, setPicked] = useState<string[]>(group.member_ids);
  const busy = update.isPending || setMembers.isPending || remove.isPending;

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
  const editable = canManage;

  async function handleSave() {
    if (!dirty || tooMany || (manual && !trimmed)) return;
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
      toast({ title: `${trimmed || group.name} saved` });
      onDone();
    } catch (error) {
      toast({
        title: `Couldn't save ${group.name}`,
        description: getErrorMessage(
          error,
          "Nothing more was changed. Reload the page and try again.",
        ),
        variant: "destructive",
      });
    }
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
        title: `Couldn't delete ${group.name}`,
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
      <div className="grid max-w-md gap-1.5">
        <Label htmlFor="group-edit-name">{PEOPLE_SETTINGS_COPY.name}</Label>
        <Input
          id="group-edit-name"
          value={name}
          maxLength={GROUP_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          disabled={!manual || !editable || busy}
        />
      </div>

      <SettingsGroup label={group.name} footnote={autoFootnote}>
        <SettingsRow
          icon={Palette}
          label={PEOPLE_SETTINGS_COPY.color}
          control={
            <Popover>
              <PopoverTrigger
                disabled={!editable || busy}
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
                <span id="group-edit-color-label" className="sr-only">
                  {PEOPLE_SETTINGS_COPY.color}
                </span>
                <RoleColorPicker
                  labelId="group-edit-color-label"
                  value={color}
                  onChange={setColor}
                  disabled={busy}
                  previewName={name}
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
          onCheckedChange={setMentionable}
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
                    disabled={busy}
                    onClick={() =>
                      setPicked((previous) =>
                        previous.filter((userId) => userId !== row.userId),
                      )
                    }
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
              onAdd={(member) =>
                setPicked((previous) => [...previous, member.user_id])
              }
              emptyText="Everyone is already in it."
              disabled={busy}
            />
          </div>
        ) : null}
        {tooMany ? (
          <p role="alert" className="text-caption text-destructive-text">
            A group can hold at most {GROUP_MEMBERS_MAX} members.
          </p>
        ) : null}
      </div>

      {editable ? (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onDone} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={!dirty || tooMany || (manual && !trimmed) || busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      ) : null}
    </SettingsSubpage>
  );
}
