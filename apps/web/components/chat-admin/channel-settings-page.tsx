"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Eye,
  Flag,
  Folder,
  Loader2,
  MessageSquare,
  Pin,
  PinOff,
} from "lucide-react";
import { describeLoadFailure } from "@repo/hooks/error-copy";
import { AUDIT_LOG_SETTINGS_NOTE } from "@repo/chat-core/audit-log-copy";
import {
  resolveAuthorLabel,
  useCategories,
  useChannelAccessOptions,
  useChannels,
  useChatReports,
  useMemberDisplayNames,
  useHeldRowSaves,
  usePermissionList,
  usePinnedMessages,
  useUnpinMessage,
  useUpdateChannel,
} from "@repo/hooks";
import {
  describeChannelAccess,
  isEmptyChannelAccessChoice,
  matchesCategoryAccess,
  type ChannelAccessOption,
  type ChannelAccessQuestion,
} from "@repo/hooks/channel-access";
import { formatClock } from "@repo/formatting";
import {
  builtInChannelDefault,
  canAll,
  CHANNEL_DEFAULT_LEVEL_LABELS,
  CHANNEL_SETTINGS_COPY as copy,
  channelAccessFootnote,
  CHAT_REPORT_QUEUE_PERMISSIONS,
  matchCategoryLabel,
  openReportsValue,
  pinnedMessagesValue,
  sameChannelAccessList,
  standardLevelLabel,
  type ChatNotificationLevel,
} from "@repo/validation";
import { DELETE_CHANNEL_LABEL } from "@repo/hooks";
import { Can } from "@/components/shared/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import {
  anyReadUncached,
  pausedRead,
  PermissionsOfflineSurface,
  readIsOffline,
} from "@/components/shared/async-states";
import { NestedError, NestedOffline } from "@/components/shared/nested-states";
import { InlineNote } from "@/components/shared/inline-note";
import { StaleReadNotice } from "@/components/shared/stale-read-notice";
import {
  compactControlClassName,
  denseListClassName,
} from "@/components/shared/table-controls";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { useDeleteChannelFlow } from "@/components/chat/use-delete-channel-flow";
import {
  ChannelAccessField,
  channelAccessOptionsState,
} from "@/components/chat-admin/channel-access-field";
import { ChannelsSkeleton } from "@/components/chat-admin/chat-admin-skeleton";
import { ChatReportsCard } from "@/components/chat-admin/chat-reports-card";
import {
  isAdminChannel,
  takesAccessLists,
  type AdminCategory,
  type AdminChannel,
} from "@/components/chat-admin/admin-channel";
import {
  SettingsBackLink,
  SettingsSubpage,
} from "@/components/settings/settings-subpage";
import {
  CHAT_SETTINGS_PATH,
  channelSettingsPath,
  FOCUS_DESCRIPTION_PARAM,
  type ChannelSettingsPage,
} from "@/components/settings/settings-paths";
import { useNetwork } from "@/lib/providers/network-provider";
import { useToast } from "@/lib/hooks/use-toast";
import { asArray, cn, getErrorMessage } from "@/lib/utils";

/**
 * A row's picker drawn as the row's value (a muted word and its chevron), as
 * the rows that open a page show theirs, rather than a field box in a row.
 */
const ROW_PICKER =
  "h-8 w-auto gap-1.5 border-transparent bg-transparent px-2 text-sm text-muted-foreground shadow-none hover:text-foreground";

/** Sentinel for "no category": Radix `Select` rejects an empty-string value. */
const NO_CATEGORY = "__none__";
/** Sentinel for "no officer default": the channel uses its built-in level. */
const BUILT_IN_LEVEL = "__built_in__";

interface PinnedMessageRow {
  id: string;
  content: string;
  sender_id: string | null;
  author_name?: string | null;
  created_at: string;
  pinned_at: string | null;
}

/**
 * One channel's settings (#6031), drawn in place of Chapter settings' Chat
 * page at `/settings?tab=chat&channel=<id>`, in the shape of Discord's
 * channel settings (Paul, 2026-11-20): the name and description on top, then
 * three groups of rows (Access, Defaults, Moderation), then Delete channel,
 * red and alone, last. The phone's Channel settings screen draws the same
 * groups in the same words (`@repo/validation`'s `CHANNEL_SETTINGS_COPY`).
 *
 * Every row saves on its own, the moment it changes (rulebook § 9): a
 * category or a default level when picked, a switch when flipped, Match
 * <category> when pressed. Save channel covers only the two typed fields,
 * until #6033 has those save on their own too.
 *
 * A row whose answer is a form of its own opens a page with a way back to
 * the channel (`?page=`): each access question, the pins, the reports. The
 * channel page stays mounted while one is open (keyed by channel, not by
 * page), so a half-made access list survives going back and coming again.
 */
export function ChannelSettingsPage({
  channelId,
  page,
}: {
  channelId: string;
  page: ChannelSettingsPage | null;
}) {
  return (
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
          description="Reconnect to check whether you can change this channel's settings."
          onRetry={retry}
        />
      )}
    >
      <ChannelSettingsBody key={channelId} channelId={channelId} page={page} />
    </Can>
  );
}

function ChannelSettingsBody({
  channelId,
  page,
}: {
  channelId: string;
  page: ChannelSettingsPage | null;
}) {
  const { isOffline } = useNetwork();
  const channelsQuery = useChannels();
  const categoriesQuery = useCategories();

  const channel = useMemo(
    () =>
      asArray<AdminChannel>(channelsQuery.data).find(
        (c) => c.id === channelId && isAdminChannel(c),
      ) ?? null,
    [channelsQuery.data, channelId],
  );
  const categories = useMemo(
    () => asArray<AdminCategory>(categoriesQuery.data),
    [categoriesQuery.data],
  );

  function retry() {
    void channelsQuery.refetch();
    void categoriesQuery.refetch();
  }

  if (isOffline && anyReadUncached(channelsQuery, categoriesQuery)) {
    return (
      <NestedOffline
        sole
        title="Channels unavailable offline"
        description="Reconnect to change this channel's settings."
        onRetry={retry}
      />
    );
  }
  if (
    channelsQuery.isLoading ||
    categoriesQuery.isLoading ||
    pausedRead(channelsQuery) ||
    pausedRead(categoriesQuery)
  ) {
    return <ChannelsSkeleton />;
  }
  if (
    (channelsQuery.isError && channelsQuery.data === undefined) ||
    (categoriesQuery.isError && categoriesQuery.data === undefined)
  ) {
    return (
      <NestedError
        sole
        title="Couldn't load the channel"
        description={describeLoadFailure(
          channelsQuery.error ?? categoriesQuery.error,
        )}
        onRetry={retry}
      />
    );
  }
  if (!channel) {
    return (
      <div className="space-y-3">
        <InlineNote>
          This channel isn&apos;t here anymore. It may have been deleted.
        </InlineNote>
        <Button asChild variant="secondary" size="sm" className="gap-1.5">
          <Link href={CHAT_SETTINGS_PATH}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Chat
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <>
      <StaleReadNotice
        stale={channelsQuery.isError || categoriesQuery.isError}
        message="Couldn't refresh the channel. This is the last that loaded."
        onRetry={retry}
      />
      <ChannelSettings channel={channel} categories={categories} page={page} />
    </>
  );
}

function ChannelSettings({
  channel,
  categories,
  page,
}: {
  channel: AdminChannel;
  categories: readonly AdminCategory[];
  page: ChannelSettingsPage | null;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirmDialog();
  const deleteChannelFlow = useDeleteChannelFlow(confirm);
  const updateChannel = useUpdateChannel();
  const accessOptionsQuery = useChannelAccessOptions();
  const accessOptions = useMemo(
    () => asArray<ChannelAccessOption>(accessOptionsQuery.data),
    [accessOptionsQuery.data],
  );
  const optionsState = channelAccessOptionsState(accessOptionsQuery);
  const canReviewReports = canAll(
    CHAT_REPORT_QUEUE_PERMISSIONS,
    usePermissionList(),
  );
  const openReports = useChatReports("open", channel.id, canReviewReports);
  const pins = usePinnedMessages(channel.id);

  const category = categories.find((c) => c.id === channel.category_id) ?? null;
  const takesLists = takesAccessLists(channel);
  const audit = channel.is_audit_log === true;
  // Each row shows what it was set to from the moment it changes until the
  // refetched channel agrees (`useHeldRowSaves`).
  const rows = useHeldRowSaves({
    category_id: channel.category_id ?? null,
    who_can_see: channel.who_can_see ?? null,
    who_can_post: channel.who_can_post ?? null,
    default_notification_level: channel.default_notification_level ?? null,
    is_default: channel.is_default === true,
    activity_excluded: channel.activity_excluded === true,
  });
  const see = rows.shown<string[] | null>("who_can_see");
  const post = rows.shown<string[] | null>("who_can_post");
  const matches = takesLists && matchesCategoryAccess(see, post, category);

  // ── The typed fields: Save channel covers these two only ────────────────
  // Seeded from the row when the page opened; a refetch that moves the live
  // name (a rename in the chat header) moves an untouched draft with it, and
  // only a field the officer changed goes out (#4542).
  const [nameSeed, setNameSeed] = useState(channel.name);
  const [nameDraft, setNameDraft] = useState(channel.name);
  const [descriptionSeed, setDescriptionSeed] = useState(
    (channel.description ?? "").trim(),
  );
  const [descriptionDraft, setDescriptionDraft] = useState(
    channel.description ?? "",
  );
  if (channel.name !== nameSeed) {
    setNameSeed(channel.name);
    if (nameDraft === nameSeed) setNameDraft(channel.name);
  }
  const liveDescription = (channel.description ?? "").trim();
  if (liveDescription !== descriptionSeed) {
    setDescriptionSeed(liveDescription);
    if (descriptionDraft.trim() === descriptionSeed) {
      setDescriptionDraft(channel.description ?? "");
    }
  }
  // "Add a description" on the channel's start sends the officer here to
  // type one: the field takes focus once, on that way in only.
  const focusDescription =
    useSearchParams().get(FOCUS_DESCRIPTION_PARAM) === "description";
  const nameChanged = nameDraft.trim() !== channel.name;
  const descriptionChanged = descriptionDraft.trim() !== descriptionSeed;
  const fieldsDirty = nameChanged || descriptionChanged;
  const [savingFields, setSavingFields] = useState(false);

  async function saveFields(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = nameDraft.trim();
    if (!name) {
      toast({ variant: "destructive", description: copy.nameRequired });
      return;
    }
    const description = descriptionDraft.trim();
    setSavingFields(true);
    try {
      await updateChannel.mutateAsync({
        id: channel.id,
        body: {
          ...(nameChanged ? { name } : {}),
          // Only a changed description goes out: sending the blank draft
          // turned a never-set one (null) into '', which the default
          // description backfill reads as a deliberate clear.
          ...(descriptionChanged ? { description } : {}),
        },
      });
      toast({ description: copy.saved(name) });
    } catch (error) {
      toast({
        variant: "destructive",
        description: getErrorMessage(error, copy.saveFailed),
      });
    } finally {
      setSavingFields(false);
    }
  }

  function revertFields() {
    setNameDraft(channel.name);
    setDescriptionDraft(channel.description ?? "");
  }

  // ── A row's own save ────────────────────────────────────────────────────
  // One change at a time, the moment it's made: `values` are what the rows
  // show meanwhile, `body` what the request sends.
  async function saveRow(
    values: Record<string, unknown>,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    const error = await rows.save(values, () =>
      updateChannel.mutateAsync({ id: channel.id, body }),
    );
    if (!error) return true;
    toast({
      variant: "destructive",
      description: getErrorMessage(error, copy.saveFailed),
    });
    return false;
  }

  // ── Who can see and who can post: one page each, with its own Save ─────
  // The draft lives here, above the page, so it outlives going back to the
  // channel and coming again. Saved, it is dropped: the row reads the live
  // channel again.
  const [accessDrafts, setAccessDrafts] = useState<
    Partial<Record<ChannelAccessQuestion, string[] | null>>
  >({});
  const liveList = (question: ChannelAccessQuestion) =>
    question === "see" ? see : post;

  async function saveAccess(question: ChannelAccessQuestion) {
    const draft = accessDrafts[question];
    if (draft === undefined) return;
    if (isEmptyChannelAccessChoice(draft)) {
      toast({ variant: "destructive", description: copy.accessIncomplete });
      return;
    }
    const key = question === "see" ? "who_can_see" : "who_can_post";
    const saved = sameChannelAccessList(draft, liveList(question))
      ? true
      : await saveRow({ [key]: draft }, { [key]: draft });
    if (!saved) return;
    setAccessDrafts((current) => {
      const next = { ...current };
      delete next[question];
      return next;
    });
    router.push(channelSettingsPath(channel.id));
  }

  const backToChannel = channelSettingsPath(channel.id);
  const channelTitle = `#${channel.name}`;

  // A private channel or the audit log has no lists to set, so an access
  // page's address opens the channel's own.
  if ((page === "see" || page === "post") && takesLists) {
    const question = page;
    const draft = accessDrafts[question];
    const value = draft === undefined ? liveList(question) : draft;
    const changed =
      draft !== undefined && !sameChannelAccessList(draft, liveList(question));
    return (
      <SettingsSubpage
        backHref={backToChannel}
        backLabel={channelTitle}
        title={question === "see" ? copy.whoCanSee : copy.whoCanPost}
      >
        <div className="space-y-4">
          <ChannelAccessField
            id={`channel-${question}`}
            question={question}
            value={value}
            onChange={(next) =>
              setAccessDrafts((current) => ({ ...current, [question]: next }))
            }
            options={accessOptions}
            optionsState={optionsState}
            labelHidden
          />
          <div className="flex justify-end">
            <Button
              onClick={() => void saveAccess(question)}
              disabled={!changed || rows.busy}
            >
              {rows.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      </SettingsSubpage>
    );
  }

  if (page === "pins") {
    return (
      <SettingsSubpage
        backHref={backToChannel}
        backLabel={channelTitle}
        title={copy.pinnedMessages}
      >
        <PinnedMessages channelId={channel.id} />
      </SettingsSubpage>
    );
  }

  if (page === "reports") {
    return (
      <SettingsSubpage
        backHref={backToChannel}
        backLabel={channelTitle}
        title={copy.reports}
      >
        <ChatReportsCard channelId={channel.id} />
      </SettingsSubpage>
    );
  }

  const categoryValue = rows.shown<string | null>("category_id") ?? NO_CATEGORY;
  const levelValue =
    rows.shown<string | null>("default_notification_level") ?? BUILT_IN_LEVEL;
  const builtIn = builtInChannelDefault({
    name: channel.name,
    type: channel.type,
    is_read_only: channel.is_read_only,
  });
  const pinCount = Array.isArray(pins.data) ? pins.data.length : null;
  const openCount = Array.isArray(openReports.data)
    ? openReports.data.length
    : null;

  return (
    <div className="@container space-y-8">
      {confirmDialog}
      <header className="space-y-1 border-b border-border pb-6">
        <SettingsBackLink href={CHAT_SETTINGS_PATH} label="Chat" />
        <h2 className="min-w-0 truncate text-title text-foreground">
          {channelTitle}
        </h2>
      </header>

      <form onSubmit={(event) => void saveFields(event)} className="space-y-4">
        <div className="grid gap-1">
          <Label htmlFor="channel-name">{copy.name}</Label>
          <Input
            id="channel-name"
            value={nameDraft}
            disabled={audit}
            maxLength={80}
            onChange={(event) => setNameDraft(event.target.value)}
          />
          {audit ? (
            <p className="text-caption text-muted-foreground">
              {AUDIT_LOG_SETTINGS_NOTE}
            </p>
          ) : null}
        </div>
        <div className="grid gap-1">
          <Label htmlFor="channel-description">{copy.description}</Label>
          <Textarea
            id="channel-description"
            autoFocus={focusDescription}
            value={descriptionDraft}
            maxLength={500}
            rows={2}
            onChange={(event) => setDescriptionDraft(event.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          {fieldsDirty ? (
            <Button
              type="button"
              variant="secondary"
              onClick={revertFields}
              disabled={savingFields}
            >
              {copy.revert}
            </Button>
          ) : null}
          <Button
            type="submit"
            disabled={!fieldsDirty || savingFields || !nameDraft.trim()}
          >
            {savingFields ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {copy.save}
          </Button>
        </div>
      </form>

      <SettingsGroup
        heading={copy.access}
        footnote={
          takesLists
            ? channelAccessFootnote(category?.name ?? null, matches)
            : null
        }
      >
        <SettingsRow
          icon={Folder}
          label={copy.category}
          control={
            <Select
              value={categoryValue}
              disabled={rows.busy}
              onValueChange={(next) =>
                void saveRow(
                  { category_id: next === NO_CATEGORY ? null : next },
                  { category_id: next === NO_CATEGORY ? null : next },
                )
              }
            >
              <SelectTrigger
                aria-label={copy.category}
                className={cn(ROW_PICKER, "max-w-[16rem]")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={NO_CATEGORY}>{copy.noCategory}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        {takesLists ? (
          <>
            <SettingsRow
              icon={Eye}
              label={copy.whoCanSee}
              value={describeChannelAccess(see, "see", accessOptions)}
              href={channelSettingsPath(channel.id, "see")}
            />
            <SettingsRow
              icon={MessageSquare}
              label={copy.whoCanPost}
              value={describeChannelAccess(post, "post", accessOptions)}
              href={channelSettingsPath(channel.id, "post")}
            />
            {category && !matches ? (
              <SettingsRow
                label={matchCategoryLabel(category.name)}
                value=""
                disabled={rows.busy}
                onClick={() =>
                  void saveRow(
                    {
                      who_can_see: category.who_can_see ?? null,
                      who_can_post: category.who_can_post ?? null,
                    },
                    { match_category_access: true },
                  )
                }
              />
            ) : null}
          </>
        ) : channel.type !== "PRIVATE" ? null : (
          <>
            <SettingsRow
              icon={Eye}
              label={copy.whoCanSee}
              control={
                <span className="text-sm text-muted-foreground">
                  {copy.privateSee}
                </span>
              }
            />
            <SettingsRow
              icon={MessageSquare}
              label={copy.whoCanPost}
              control={
                <span className="text-sm text-muted-foreground">
                  {post === null
                    ? copy.privatePost
                    : describeChannelAccess(post, "post", accessOptions)}
                </span>
              }
            />
            {/*
              A private channel made read-only before #3722 kept the roles
              that could post there. It can be opened to everyone in it, not
              narrowed.
            */}
            {post !== null ? (
              <SettingsRow
                label={copy.letEveryonePost}
                value=""
                disabled={rows.busy}
                onClick={() =>
                  void saveRow({ who_can_post: null }, { who_can_post: null })
                }
              />
            ) : null}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup heading={copy.defaults} footnote={copy.defaultsFootnote}>
        <SettingsRow
          icon={Bell}
          label={copy.defaultNotifications}
          control={
            <Select
              value={levelValue}
              disabled={rows.busy}
              onValueChange={(next) =>
                void saveRow(
                  {
                    default_notification_level:
                      next === BUILT_IN_LEVEL ? null : next,
                  },
                  {
                    default_notification_level:
                      next === BUILT_IN_LEVEL
                        ? null
                        : (next as ChatNotificationLevel),
                  },
                )
              }
            >
              <SelectTrigger
                aria-label={copy.defaultNotifications}
                className={ROW_PICKER}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={BUILT_IN_LEVEL}>
                  {standardLevelLabel(builtIn)}
                </SelectItem>
                {(
                  Object.keys(
                    CHANNEL_DEFAULT_LEVEL_LABELS,
                  ) as ChatNotificationLevel[]
                ).map((level) => (
                  <SelectItem key={level} value={level}>
                    {CHANNEL_DEFAULT_LEVEL_LABELS[level]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingsRow
          label={copy.defaultChannel}
          description={copy.defaultChannelLine}
          checked={rows.shown<boolean>("is_default")}
          disabled={rows.busy}
          onCheckedChange={(next) =>
            void saveRow({ is_default: next }, { is_default: next })
          }
        />
        <SettingsRow
          label={copy.leaveOutOfActivity}
          description={copy.leaveOutOfActivityLine}
          checked={rows.shown<boolean>("activity_excluded")}
          disabled={rows.busy}
          onCheckedChange={(next) =>
            void saveRow(
              { activity_excluded: next },
              { activity_excluded: next },
            )
          }
        />
      </SettingsGroup>

      <SettingsGroup heading={copy.moderation}>
        <SettingsRow
          icon={Pin}
          label={copy.pinnedMessages}
          value={pinCount === null ? undefined : pinnedMessagesValue(pinCount)}
          href={channelSettingsPath(channel.id, "pins")}
        />
        {canReviewReports ? (
          <SettingsRow
            icon={Flag}
            label={copy.reports}
            value={openCount === null ? undefined : openReportsValue(openCount)}
            href={channelSettingsPath(channel.id, "reports")}
          />
        ) : null}
      </SettingsGroup>

      {/* The server refuses deleting the audit log (#3909). */}
      {audit ? null : (
        <SettingsGroup label={DELETE_CHANNEL_LABEL}>
          <SettingsRow
            label={DELETE_CHANNEL_LABEL}
            destructive
            value=""
            onClick={() =>
              void deleteChannelFlow(channel, () =>
                router.replace(CHAT_SETTINGS_PATH),
              )
            }
          />
        </SettingsGroup>
      )}
    </div>
  );
}

/** A channel's pins, newest pin first, each with Unpin (`?page=pins`). */
function PinnedMessages({ channelId }: { channelId: string }) {
  const { isOffline } = useNetwork();
  const { toast } = useToast();
  const pinsQuery = usePinnedMessages(channelId);
  const pins = useMemo(
    () => asArray<PinnedMessageRow>(pinsQuery.data),
    [pinsQuery.data],
  );
  const unpinMessage = useUnpinMessage();
  const { nameFor } = useMemberDisplayNames();

  async function handleUnpin(messageId: string) {
    try {
      await unpinMessage.mutateAsync(messageId);
      toast({ description: "Message unpinned." });
    } catch (error) {
      toast({
        variant: "destructive",
        description: getErrorMessage(error, "Couldn't unpin the message."),
      });
    }
  }

  return (
    <div className="space-y-2">
      <StaleReadNotice
        stale={pinsQuery.isError && pinsQuery.data !== undefined}
        message="Couldn't refresh the pins. These are the last ones that loaded."
        onRetry={() => void pinsQuery.refetch()}
      />
      {/*
        A failed or paused read is not an empty list: `pins` is `[]` whenever
        there is no data, so an officer offline or behind a failed read would
        be told the channel had no pins.
      */}
      {readIsOffline(isOffline, pinsQuery) ? (
        <NestedOffline
          title="Pins unavailable offline"
          description="Reconnect to load this channel's pins."
          onRetry={() => void pinsQuery.refetch()}
        />
      ) : pinsQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading pins...</p>
      ) : pinsQuery.isError && pinsQuery.data === undefined ? (
        <NestedError
          title="Couldn't load pins"
          description={describeLoadFailure(pinsQuery.error)}
          onRetry={() => void pinsQuery.refetch()}
        />
      ) : pins.length === 0 ? (
        <InlineNote>Nothing pinned. Pin a message from the channel.</InlineNote>
      ) : (
        <ul className={cn(denseListClassName)}>
          {pins.map((message) => (
            <li
              key={message.id}
              className="flex items-start justify-between gap-2 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  {resolveAuthorLabel(message, nameFor, null)}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {formatClock(message.pinned_at ?? message.created_at)}
                  </span>
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {message.content}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className={compactControlClassName}
                aria-label="Unpin message"
                onClick={() => void handleUnpin(message.id)}
                disabled={unpinMessage.isPending}
              >
                <PinOff className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
