"use client";

import { describeLoadFailure } from "@repo/hooks/error-copy";
import { useKeptPanel } from "@repo/hooks/kept-drafts";
import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Download,
  Flag,
  Pencil,
  Plus,
  Trash2,
  Users,
  Wallpaper,
} from "lucide-react";
import {
  CHAT_REPORTS_NOTIFICATION_SCREEN,
  compareChannelOrder,
  groupChannelsByCategory,
  useCategories,
  useChannelAccessOptions,
  useChannels,
  useChapterChatBackground,
  useChatReports,
  useCreateCategory,
  useDeleteCategory,
  useDiscordImports,
  usePermissionList,
  useUpdateCategory,
} from "@repo/hooks";
import {
  describeChannelAccess,
  isEmptyChannelAccessChoice,
  matchesCategoryAccess,
  type ChannelAccessOption,
} from "@repo/hooks/channel-access";
import {
  canAll,
  CHANNEL_SETTINGS_COPY,
  CHAPTER_PROFILE_PERMISSIONS,
  CHAT_BACKGROUND_LABELS,
  CHAT_REPORT_QUEUE_PERMISSIONS,
  openReportsValue,
  sameChannelAccessList,
} from "@repo/validation";
import { Can } from "@/components/shared/can";
import { Button } from "@/components/ui/button";
import { NewButton } from "@/components/ui/new-button";
import { Input } from "@/components/ui/input";
import { FOCUS_RING } from "@/components/ui/focus";
import { SectionLabel } from "@/components/shared/section-label";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { RowMenu, type RowMenuEntry } from "@/components/shared/row-menu";
import {
  anyReadUncached,
  PermissionsOfflineSurface,
  pausedRead,
} from "@/components/shared/async-states";
import { NestedError, NestedOffline } from "@/components/shared/nested-states";
import { StaleReadNotice } from "@/components/shared/stale-read-notice";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineNote } from "@/components/shared/inline-note";
import { ChannelMark } from "@/components/chat/channel-start";
import { isSystemChannel } from "@repo/hooks/channel-start";
import { useNetwork } from "@/lib/providers/network-provider";
import { useToast } from "@/lib/hooks/use-toast";
import { asArray, cn, getErrorMessage } from "@/lib/utils";
import { ChatReportsCard } from "./chat-reports-card";
import { ChatBackgroundDefaultCard } from "./chat-background-default-card";
import {
  ChannelAccessField,
  channelAccessOptionsState,
  type ChannelAccessOptionsState,
} from "@/components/chat-admin/channel-access-field";
import { ChannelsSkeleton } from "@/components/chat-admin/chat-admin-skeleton";
import {
  isAdminChannel,
  takesAccessLists,
  type AdminCategory,
  type AdminChannel,
} from "@/components/chat-admin/admin-channel";
import { CreateChannelSheet, channelDraftName } from "./create-channel-sheet";
import {
  CHAT_SETTINGS_PATH,
  channelSettingsPath,
  chatSettingsPagePath,
  DISCORD_IMPORT_SETTINGS_PATH,
  type ChatSettingsPage,
} from "@/components/settings/settings-paths";
import { SettingsSubpage } from "@/components/settings/settings-subpage";
import { MarkScreensSeen } from "@/lib/notifications/mark-screens-seen";
import { discordImportSummary } from "@/components/discord-import/current-import";

/** The tree's key for channels in no category, as the chat rail splits them. */
const NO_CATEGORY = "__none__";
/** The tree's key for the System group (the audit log), as the rail splits it. */
const SYSTEM_GROUP = "__system__";

/** A category's two answers in one line, for its row in the tree. */
function categoryAccessSummary(
  category: AdminCategory,
  options: readonly ChannelAccessOption[],
): string {
  const see = category.who_can_see ?? null;
  const post = category.who_can_post ?? null;
  if (see === null && post === null) return "Everyone can see and post";
  const seen =
    see === null ? "everyone" : describeChannelAccess(see, "see", options);
  const posters =
    post === null
      ? "everyone who can see it"
      : describeChannelAccess(post, "post", options);
  return `Seen by ${seen}. Posts: ${posters}`;
}

/** Who can see a channel, as its row in the tree says it. */
function channelSeenBy(
  channel: AdminChannel,
  options: readonly ChannelAccessOption[],
): string {
  if (channel.type === "PRIVATE") return CHANNEL_SETTINGS_COPY.privateSee;
  if (!takesAccessLists(channel)) return "";
  return describeChannelAccess(channel.who_can_see ?? null, "see", options);
}

/**
 * The body of Chapter settings' Chat page (#6031), under the module frame's
 * header, in the settings-row shape of Discord's server settings and iOS
 * Settings (Paul, 2026-11-20):
 *
 * - **Channels**: every channel under its category, each category a row that
 *   folds out (#5727) with its rename, access and delete in a ⋯ menu and on
 *   right-click, and New category as the group's last row. A channel row
 *   opens that channel's own page (`channel-settings-page.tsx`).
 * - **Look**: the chapter's chat background, a row with its current choice
 *   that opens the picker as a page of its own.
 * - **Moderation**: the report queue and Discord import, each a row with its
 *   state that opens its page, so the queue stays out of the way (Paul,
 *   2026-11-11) and still says when something is waiting.
 *
 * Each group carries its own gate: channels for `channels:manage`, the
 * background for whoever edits the chapter profile (#3973), the queue for
 * report reviewers.
 */
export function ChatAdminPage({
  holdsDiscordImport = false,
}: {
  /** The viewer holds Discord import (`SETTINGS_TOOLS`), so its row shows. */
  holdsDiscordImport?: boolean;
} = {}) {
  const permissions = usePermissionList();
  const canEditProfile = canAll(CHAPTER_PROFILE_PERMISSIONS, permissions);
  const canReviewReports = canAll(CHAT_REPORT_QUEUE_PERMISSIONS, permissions);
  return (
    <div className="space-y-8">
      <Can
        permission="channels:manage"
        fallback={<ChannelsSkeleton />}
        deniedFallback={
          <p className="text-sm text-muted-foreground">
            Your role can&apos;t manage channels. Ask your chapter president for
            access.
          </p>
        }
        offlineFallback={(retry) => (
          <PermissionsOfflineSurface
            description="Reconnect to check whether you can manage chat channels."
            onRetry={retry}
          />
        )}
      >
        <ChannelsGroup />
      </Can>
      {canEditProfile ? <LookGroup /> : null}
      {canReviewReports || holdsDiscordImport ? (
        <ModerationGroup
          reports={canReviewReports}
          discordImport={holdsDiscordImport}
        />
      ) : null}
    </div>
  );
}

function LookGroup() {
  const background = useChapterChatBackground();
  const value = background.data
    ? CHAT_BACKGROUND_LABELS[background.data.background]
    : undefined;
  return (
    <SettingsGroup
      heading="Look"
      footnote="Every channel shows this unless it has its own."
    >
      <SettingsRow
        icon={Wallpaper}
        label="Chat background"
        value={value}
        href={chatSettingsPagePath("background")}
      />
    </SettingsGroup>
  );
}

function ModerationGroup({
  reports,
  discordImport,
}: {
  reports: boolean;
  discordImport: boolean;
}) {
  const openReports = useChatReports("open", undefined, reports);
  const imports = useDiscordImports({ enabled: discordImport });
  const openCount = Array.isArray(openReports.data)
    ? openReports.data.length
    : null;
  const importValue = imports.data
    ? discordImportSummary(asArray(imports.data))
    : undefined;
  return (
    <SettingsGroup heading={CHANNEL_SETTINGS_COPY.moderation}>
      {reports ? (
        <SettingsRow
          icon={Flag}
          label={CHANNEL_SETTINGS_COPY.reports}
          value={openCount === null ? undefined : openReportsValue(openCount)}
          href={chatSettingsPagePath("reports")}
        />
      ) : null}
      {discordImport ? (
        <SettingsRow
          icon={Download}
          label="Discord import"
          value={importValue}
          href={DISCORD_IMPORT_SETTINGS_PATH}
        />
      ) : null}
    </SettingsGroup>
  );
}

/**
 * One of the Chat page's own pages (`?page=`), in place of the page. Its row
 * shows only to a viewer who may use it; one who reaches the address anyway
 * (an old or shared link) gets the plain denied line, never a titled blank.
 */
export function ChatSettingsSubpage({ page }: { page: ChatSettingsPage }) {
  if (page === "background") {
    return (
      <SettingsSubpage
        backHref={CHAT_SETTINGS_PATH}
        backLabel="Chat"
        title="Chat background"
      >
        <Can
          allOf={CHAPTER_PROFILE_PERMISSIONS}
          deniedFallback={
            <p className="text-sm text-muted-foreground">
              Your role can&apos;t change the chat background. Ask your
              chapter president for access.
            </p>
          }
        >
          <ChatBackgroundDefaultCard />
        </Can>
      </SettingsSubpage>
    );
  }
  return (
    <SettingsSubpage
      backHref={CHAT_SETTINGS_PATH}
      backLabel="Chat"
      title={CHANNEL_SETTINGS_COPY.reports}
    >
      <Can
        allOf={CHAT_REPORT_QUEUE_PERMISSIONS}
        deniedFallback={
          <p className="text-sm text-muted-foreground">
            Your role can&apos;t review reported messages. Ask your chapter
            president for access.
          </p>
        }
      >
        {/* Opening the report queue reads the new-report notices. */}
        <MarkScreensSeen screens={[CHAT_REPORTS_NOTIFICATION_SCREEN]} />
        <ChatReportsCard />
      </Can>
    </SettingsSubpage>
  );
}

function ChannelsGroup() {
  const { isOffline } = useNetwork();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();

  const channelsQuery = useChannels();
  const categoriesQuery = useCategories();
  const accessOptionsQuery = useChannelAccessOptions();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const channels = useMemo(
    () => asArray<AdminChannel>(channelsQuery.data).filter(isAdminChannel),
    [channelsQuery.data],
  );
  const categories = useMemo(
    () => asArray<AdminCategory>(categoriesQuery.data),
    [categoriesQuery.data],
  );
  // What the access lists can name (#3722). Its own read, so a failure
  // degrades only the Add menus: the lists still show what they hold.
  const accessOptions = useMemo(
    () => asArray<ChannelAccessOption>(accessOptionsQuery.data),
    [accessOptionsQuery.data],
  );
  const accessOptionsState = channelAccessOptionsState(accessOptionsQuery);

  // Every channel under its category, sectioned the way the chat rail
  // sections them: channels in no category first, then the categories in the
  // server's order, then System; inside each, the chapter's drag order, then
  // A to Z (`groupChannelsByCategory`, `compareChannelOrder`).
  const channelTree = useMemo(() => {
    const system = channels.filter((c) => isSystemChannel(c));
    const rest = channels.filter((c) => !isSystemChannel(c));
    const grouped = groupChannelsByCategory(rest, categories);
    const byOrder = compareChannelOrder<AdminChannel>((c) => c.name);
    return {
      uncategorized: [...grouped.uncategorized].sort(byOrder),
      categories: grouped.categories.map(({ category, channels: inIt }) => ({
        category,
        channels: [...inIt].sort(byOrder),
      })),
      system: [...system].sort(byOrder),
    };
  }, [channels, categories]);

  // Open or closed, as the officer chose for each group. Untouched, a group
  // starts closed, except channels in no category when the chapter has no
  // categories, which is then the only way to a channel.
  const [groupChoices, setGroupChoices] = useState<
    ReadonlyMap<string, boolean>
  >(() => new Map());
  function isGroupOpen(key: string) {
    return (
      groupChoices.get(key) ?? (key === NO_CATEGORY && categories.length === 0)
    );
  }
  function toggleGroup(key: string) {
    const open = isGroupOpen(key);
    setGroupChoices((current) => new Map(current).set(key, !open));
  }

  // ── New category: the group's last row, a name field once pressed ───────
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      // Max + 1, not `categories.length`: after a deletion the length no
      // longer equals one past the highest order, and two categories tie.
      const nextOrder =
        categories.reduce((max, c) => Math.max(max, c.display_order), -1) + 1;
      await createCategory.mutateAsync({ name, display_order: nextOrder });
      toast({ description: `Category "${name}" created.` });
      setNewCategoryName("");
      setAddingCategory(false);
    } catch (error) {
      toast({
        variant: "destructive",
        description: getErrorMessage(error, "Couldn't create the category."),
      });
    }
  }

  // ── A category's rename, in place of its row ───────────────────────────
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [categoryNameDraft, setCategoryNameDraft] = useState("");
  async function handleSaveCategory(category: AdminCategory) {
    const name = categoryNameDraft.trim();
    if (!name) return;
    try {
      await updateCategory.mutateAsync({ id: category.id, body: { name } });
      toast({ description: "Category renamed." });
      setEditingCategoryId(null);
    } catch (error) {
      toast({
        variant: "destructive",
        description: getErrorMessage(error, "Couldn't rename the category."),
      });
    }
  }

  // ── A category's access, edited under its row ──────────────────────────
  const [accessCategoryId, setAccessCategoryId] = useState<string | null>(null);
  const [categorySeeDraft, setCategorySeeDraft] = useState<string[] | null>(
    null,
  );
  const [categoryPostDraft, setCategoryPostDraft] = useState<string[] | null>(
    null,
  );
  function startEditCategoryAccess(category: AdminCategory) {
    setAccessCategoryId(category.id);
    setCategorySeeDraft(category.who_can_see ?? null);
    setCategoryPostDraft(category.who_can_post ?? null);
  }
  async function handleSaveCategoryAccess(category: AdminCategory) {
    if (
      isEmptyChannelAccessChoice(categorySeeDraft) ||
      isEmptyChannelAccessChoice(categoryPostDraft)
    ) {
      return;
    }
    // Only the lists the officer changed go out, so a list another officer
    // changed meanwhile isn't written back.
    const seeChanged = !sameChannelAccessList(
      categorySeeDraft,
      category.who_can_see ?? null,
    );
    const postChanged = !sameChannelAccessList(
      categoryPostDraft,
      category.who_can_post ?? null,
    );
    if (!seeChanged && !postChanged) {
      setAccessCategoryId(null);
      return;
    }
    try {
      await updateCategory.mutateAsync({
        id: category.id,
        body: {
          ...(seeChanged ? { who_can_see: categorySeeDraft } : {}),
          ...(postChanged ? { who_can_post: categoryPostDraft } : {}),
        },
      });
      toast({ description: `${category.name} access saved.` });
      setAccessCategoryId(null);
    } catch (error) {
      toast({
        variant: "destructive",
        description: getErrorMessage(error, "Couldn't save the access."),
      });
    }
  }

  async function handleDeleteCategory(category: AdminCategory) {
    const confirmed = await confirm({
      title: `Delete "${category.name}"?`,
      description: `Its channels move to ${CHANNEL_SETTINGS_COPY.noCategory}. This cannot be undone.`,
      confirmLabel: "Delete category",
    });
    if (!confirmed) return;
    try {
      await deleteCategory.mutateAsync(category.id);
      toast({ description: `Category "${category.name}" deleted.` });
    } catch (error) {
      toast({
        variant: "destructive",
        description: getErrorMessage(error, "Couldn't delete the category."),
      });
    }
  }

  // ── New channel (`create-channel-sheet.tsx`, shared with the rail) ──────
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  // Left with New channel open, the page reopens it on its draft (#4593).
  useKeptPanel({
    page: "chat-admin",
    form: channelDraftName(null, true),
    open: createDialogOpen,
    setOpen: setCreateDialogOpen,
  });

  function retryQueries() {
    void channelsQuery.refetch();
    void categoriesQuery.refetch();
    void accessOptionsQuery.refetch();
  }

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <SectionLabel id="ca-channels-label">Channels</SectionLabel>
      <CreateChannelSheet
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        docked
        backLabel="Back to Chat"
        trigger={<NewButton thing="channel" />}
      />
    </div>
  );

  // The nested family, not `async-states.tsx`'s, which paints `--card` and
  // would redraw a card on this flush page. `sole`: it stands where the whole
  // group would be.
  let body: ReactNode;
  if (isOffline && anyReadUncached(channelsQuery, categoriesQuery)) {
    body = (
      <NestedOffline
        sole
        title="Channels unavailable offline"
        description="Reconnect to manage channels and categories."
        onRetry={retryQueries}
      />
    );
  } else if (
    channelsQuery.isLoading ||
    categoriesQuery.isLoading ||
    pausedRead(channelsQuery) ||
    pausedRead(categoriesQuery)
  ) {
    body = <ChannelsSkeleton />;
  } else if (
    // `data === undefined`, not `isError` alone: a failed background refetch
    // keeps the rows TanStack already holds.
    (channelsQuery.isError && channelsQuery.data === undefined) ||
    (categoriesQuery.isError && categoriesQuery.data === undefined)
  ) {
    body = (
      <NestedError
        sole
        title="Couldn't load channels"
        description={describeLoadFailure(
          channelsQuery.error ?? categoriesQuery.error,
        )}
        onRetry={retryQueries}
      />
    );
  } else {
    body = (
      <>
        <StaleReadNotice
          stale={channelsQuery.isError || categoriesQuery.isError}
          message="Couldn't refresh the channels. These are the last ones that loaded."
          onRetry={retryQueries}
        />
        <ul
          aria-labelledby="ca-channels-label"
          className="divide-y divide-border rounded-[14px] border border-border bg-card"
        >
          {channelTree.uncategorized.length > 0 ? (
            <ChannelGroup
              groupKey={NO_CATEGORY}
              name={CHANNEL_SETTINGS_COPY.noCategory}
              channels={channelTree.uncategorized}
              options={accessOptions}
              open={isGroupOpen(NO_CATEGORY)}
              onToggle={() => toggleGroup(NO_CATEGORY)}
            />
          ) : null}
          {channelTree.categories.map(
            ({ category, channels: categoryChannels }) => {
              const menu: RowMenuEntry[] = [
                {
                  type: "item",
                  key: "access",
                  label: "Who can see and post",
                  icon: Users,
                  onSelect: () => startEditCategoryAccess(category),
                },
                {
                  type: "item",
                  key: "rename",
                  label: "Rename",
                  icon: Pencil,
                  onSelect: () => {
                    setEditingCategoryId(category.id);
                    setCategoryNameDraft(category.name);
                  },
                },
                { type: "separator", key: "sep" },
                {
                  type: "item",
                  key: "delete",
                  label: "Delete category",
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => void handleDeleteCategory(category),
                },
              ];
              if (editingCategoryId === category.id) {
                return (
                  <li key={category.id} className="group">
                    <form
                      className="flex min-h-11 items-center gap-2 px-4 py-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleSaveCategory(category);
                      }}
                    >
                      <Input
                        aria-label={`Rename ${category.name}`}
                        value={categoryNameDraft}
                        onChange={(event) =>
                          setCategoryNameDraft(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setEditingCategoryId(null);
                          }
                        }}
                        className="h-8"
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingCategoryId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={
                          updateCategory.isPending || !categoryNameDraft.trim()
                        }
                      >
                        Save
                      </Button>
                    </form>
                  </li>
                );
              }
              return (
                <ChannelGroup
                  key={category.id}
                  groupKey={category.id}
                  name={category.name}
                  summary={categoryAccessSummary(category, accessOptions)}
                  channels={categoryChannels}
                  options={accessOptions}
                  open={isGroupOpen(category.id)}
                  onToggle={() => toggleGroup(category.id)}
                  menu={menu}
                  below={
                    accessCategoryId === category.id ? (
                      <CategoryAccessEditor
                        category={category}
                        channels={channels}
                        see={categorySeeDraft}
                        post={categoryPostDraft}
                        onSeeChange={setCategorySeeDraft}
                        onPostChange={setCategoryPostDraft}
                        options={accessOptions}
                        optionsState={accessOptionsState}
                        saving={updateCategory.isPending}
                        onCancel={() => setAccessCategoryId(null)}
                        onSave={() => void handleSaveCategoryAccess(category)}
                      />
                    ) : null
                  }
                />
              );
            },
          )}
          {channelTree.system.length > 0 ? (
            <ChannelGroup
              groupKey={SYSTEM_GROUP}
              name="System"
              channels={channelTree.system}
              options={accessOptions}
              open={isGroupOpen(SYSTEM_GROUP)}
              onToggle={() => toggleGroup(SYSTEM_GROUP)}
            />
          ) : null}
          <li className="group">
            {addingCategory ? (
              <form
                onSubmit={(event) => void handleCreateCategory(event)}
                className="flex min-h-11 items-center gap-2 px-4 py-2"
              >
                <Input
                  aria-label="New category name"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setAddingCategory(false);
                  }}
                  className="h-8"
                  autoFocus
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setAddingCategory(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={createCategory.isPending || !newCategoryName.trim()}
                >
                  Add
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingCategory(true)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-4 px-4 py-2.5 text-left text-sm font-medium text-muted-foreground transition hover:bg-card-hover hover:text-foreground group-first:rounded-t-[13px] group-last:rounded-b-[13px]",
                  FOCUS_RING,
                )}
              >
                <Plus className="h-[18px] w-[18px] shrink-0" aria-hidden />
                New category
              </button>
            )}
          </li>
        </ul>
        {channels.length === 0 ? (
          <InlineNote>No channels yet.</InlineNote>
        ) : null}
      </>
    );
  }

  return (
    <section aria-labelledby="ca-channels-label" className="space-y-2">
      {confirmDialog}
      {heading}
      {body}
    </section>
  );
}

/** The id the toggle's `aria-controls` names, for one group's channel list. */
function groupListId(groupKey: string) {
  return `ca-category-channels-${groupKey}`;
}

/**
 * One group of the tree (#5727): its row folds out to its channels, the way
 * Discord's server settings list channels under their categories. A category
 * carries a ⋯ menu (and right-click) for its access, rename and delete; the
 * channels in no category and System have nothing to rename or delete.
 */
function ChannelGroup({
  groupKey,
  name,
  summary,
  channels,
  options,
  open,
  onToggle,
  menu,
  below,
}: {
  groupKey: string;
  name: string;
  summary?: string;
  channels: readonly AdminChannel[];
  options: readonly ChannelAccessOption[];
  open: boolean;
  onToggle: () => void;
  menu?: readonly RowMenuEntry[];
  below?: ReactNode;
}) {
  const count = `${channels.length} channel${channels.length === 1 ? "" : "s"}`;
  const toggle = (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={open ? groupListId(groupKey) : undefined}
      onClick={onToggle}
      className={cn(
        "flex min-h-11 min-w-0 flex-1 items-center gap-4 py-2.5 pl-4 pr-2 text-left",
        FOCUS_RING,
      )}
    >
      <ChevronRight
        aria-hidden="true"
        className={cn(
          "h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
          open && "rotate-90",
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">
          {name}
        </span>
        {/*
          The access answers in one line, so an officer scanning the list
          sees which categories are private without opening each.
        */}
        {summary ? (
          <span className="truncate text-caption text-muted-foreground">
            {summary}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-sm text-muted-foreground">{count}</span>
    </button>
  );
  const rows = open ? (
    channels.length === 0 ? (
      <p
        id={groupListId(groupKey)}
        className="pb-3 pl-14 text-sm text-muted-foreground"
      >
        No channels in this category.
      </p>
    ) : (
      <ul id={groupListId(groupKey)} className="pb-1">
        {channels.map((channel) => (
          <li key={channel.id}>
            <Link
              href={channelSettingsPath(channel.id)}
              className={cn(
                "flex min-h-10 items-center gap-4 py-2 pl-14 pr-4 text-sm transition hover:bg-card-hover",
                FOCUS_RING,
              )}
            >
              <span className="flex w-[18px] shrink-0 justify-center text-muted-foreground">
                <ChannelMark channel={channel} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">
                {channel.name}
              </span>
              <span className="max-w-[45%] truncate text-muted-foreground">
                {channelSeenBy(channel, options)}
              </span>
              <ChevronRight
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-muted-foreground"
              />
            </Link>
          </li>
        ))}
      </ul>
    )
  ) : null;

  if (!menu) {
    return (
      <li className="group">
        <div className="transition hover:bg-card-hover group-first:rounded-t-[13px]">
          {toggle}
        </div>
        {rows}
      </li>
    );
  }
  return (
    <RowMenu entries={menu} label={`More for ${name}`}>
      {(menuButton) => (
        <li className="group">
          <div className="flex items-center gap-1 pr-2 transition hover:bg-card-hover group-first:rounded-t-[13px]">
            {toggle}
            {menuButton}
          </div>
          {below}
          {rows}
        </li>
      )}
    </RowMenu>
  );
}

/**
 * A category's two answers, edited under its row. Saving moves every channel
 * in it that matched (the server does it in one transaction), so the editor
 * names them first: an officer locking down Exec sees which channels follow.
 */
function CategoryAccessEditor({
  category,
  channels,
  see,
  post,
  onSeeChange,
  onPostChange,
  options,
  optionsState,
  saving,
  onCancel,
  onSave,
}: {
  category: AdminCategory;
  channels: readonly AdminChannel[];
  see: string[] | null;
  post: string[] | null;
  onSeeChange: (next: string[] | null) => void;
  onPostChange: (next: string[] | null) => void;
  options: readonly ChannelAccessOption[];
  optionsState: ChannelAccessOptionsState;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const inCategory = channels.filter(
    (channel) =>
      channel.category_id === category.id && takesAccessLists(channel),
  );
  const following = inCategory.filter((channel) =>
    matchesCategoryAccess(
      channel.who_can_see ?? null,
      channel.who_can_post ?? null,
      category,
    ),
  );
  const custom = inCategory.length - following.length;
  const incomplete =
    isEmptyChannelAccessChoice(see) || isEmptyChannelAccessChoice(post);
  return (
    <div className="mx-4 mb-3 mt-1 grid gap-4 rounded-md border border-border p-3">
      <ChannelAccessField
        id={`ca-cat-${category.id}-see`}
        question="see"
        value={see}
        onChange={onSeeChange}
        options={options}
        optionsState={optionsState}
      />
      <ChannelAccessField
        id={`ca-cat-${category.id}-post`}
        question="post"
        value={post}
        onChange={onPostChange}
        options={options}
        optionsState={optionsState}
      />
      <p className="text-caption text-muted-foreground">
        {following.length === 0
          ? "No channel here matches it now, so saving changes only what new channels start with."
          : `Saving also changes ${following
              .map((channel) => `#${channel.name}`)
              .join(
                ", ",
              )}, which ${following.length === 1 ? "matches" : "match"} it now.`}
        {custom > 0
          ? ` ${custom === 1 ? "One channel has" : `${custom} channels have`} custom access and keep${custom === 1 ? "s" : ""} it.`
          : ""}
      </p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving || incomplete}>
          Save access
        </Button>
      </div>
    </div>
  );
}
