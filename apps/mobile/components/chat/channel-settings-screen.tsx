import { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  DELETE_CHANNEL_LABEL,
  errorCopy,
  useCategories,
  useChannelAccessOptions,
  useChannels,
  useDeleteChannel,
  useMemberDisplayNames,
  usePermissionList,
  usePinnedMessages,
  useUpdateChannel,
} from "@repo/hooks";
import {
  describeChannelAccess,
  isEmptyChannelAccessChoice,
  matchesCategoryAccess,
  selectChannelAccessOptions,
  type ChannelAccessQuestion,
} from "@repo/hooks/channel-access";
import {
  builtInChannelDefault,
  can,
  CHANNEL_DEFAULT_LEVEL_LABELS,
  CHANNEL_SETTINGS_COPY as copy,
  channelAccessFootnote,
  matchCategoryLabel,
  sameChannelAccessList,
  standardLevelLabel,
  type ChatNotificationLevel,
} from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { ScreenShell } from "@/components/screen-shell";
import { BACK_TO_CHAT } from "@/components/back-row";
import {
  ListRow,
  ListRowSkeleton,
  ListSection,
  SectionHeader,
} from "@/components/list-section";
import { ErrorState, SkeletonRegion } from "@/components/state-block";
import { InlineNote } from "@/components/inline-note";
import { Toggle } from "@/components/toggle";
import { OptionSheet, type SheetOption } from "@/components/option-sheet";
import { sheetFieldStyles } from "@/components/sheet-scaffold";
import {
  BellGlyph,
  EyeGlyph,
  FolderGlyph,
  MessageSquareGlyph,
  PinGlyph,
} from "@/components/settings-glyphs";
import { ChannelAccessSheet } from "@/components/chat/channel-access-sheet";
import { DeleteChannelSheet } from "@/components/chat/delete-channel-sheet";
import { MessageListSheet } from "@/components/chat/message-list-sheet";
import {
  TaskActionBar,
  TaskActionBarSpacer,
  TaskBarPill,
} from "@/components/tasks/task-action-bar";
import { CheckGlyph } from "@/components/tasks/task-glyphs";
import { accessOptionsStateOf } from "@/lib/chat/create-channel";
import {
  selectCategories,
  selectChannels,
  type ChannelSummary,
} from "@/lib/chat/channel-list";
import { firstParam } from "@/lib/route-params";
import { useChapterBranding } from "@/lib/chapter-branding";
import { successHaptic } from "@/lib/haptics";
import { typeRole, useFrappTheme } from "@/lib/theme";

/** The option for "no category" and "no officer default", as a sheet holds them. */
const NONE = null;

/**
 * One channel's settings, on the phone (#6031): a pushed screen from a
 * channel row's Edit channel, in the shape and the words of web's
 * `/settings?tab=chat&channel=<id>` (`CHANNEL_SETTINGS_COPY`), after
 * Discord's channel settings (Paul, 2026-11-20): the name and description on
 * top, then Access, Defaults and Moderation, then Delete channel, red and
 * alone. It replaced the Edit channel sheet, which held only half of these
 * (rulebook § 8: several sections to fill in is a pushed screen).
 *
 * Every row saves on its own the moment it changes: a category or a default
 * level picked from its sheet, a switch flipped, Match <category> pressed,
 * and an access list when its sheet closes (refused, and kept to fix, while a
 * chosen list names no one). Save channel, in the floating glass bar, covers
 * only the two typed fields and shows only while one of them has changed,
 * until #6033 has those save on their own too.
 *
 * Web's Reports row is not here: the phone has no report queue yet (#6031's
 * follow-up). Pinned messages opens the thread's own Pinned list.
 */
export default function ChannelSettingsScreen() {
  const params = useLocalSearchParams<{ channelId?: string | string[] }>();
  const channelId = firstParam(params.channelId);
  const permissions = usePermissionList();
  const canManage = can("channels:manage", permissions);
  const channelsQuery = useChannels();
  const categoriesQuery = useCategories();
  const channel = useMemo(
    () =>
      selectChannels(channelsQuery.data).find(
        (row) =>
          row.id === channelId && row.type !== "DM" && row.type !== "GROUP_DM",
      ) ?? null,
    [channelsQuery.data, channelId],
  );
  const categories = useMemo(
    () => selectCategories(categoriesQuery.data),
    [categoriesQuery.data],
  );

  if (!canManage) {
    return (
      <ScreenShell back={BACK_TO_CHAT} title="Channel settings">
        <InlineNote>
          Your role can&apos;t manage channels. Ask your chapter president for
          access.
        </InlineNote>
      </ScreenShell>
    );
  }
  if (channelsQuery.isPending || categoriesQuery.isPending) {
    // The loaded screen's shape: its three groups, captions as drawn.
    return (
      <ScreenShell back={BACK_TO_CHAT} title="Channel settings">
        <SkeletonRegion label="Loading the channel">
          <SectionHeader>{copy.access}</SectionHeader>
          <ListSection>
            {[0, 1, 2].map((index) => (
              <ListRowSkeleton key={index} index={index} />
            ))}
          </ListSection>
          <SectionHeader>{copy.defaults}</SectionHeader>
          <ListSection>
            {[0, 1, 2].map((index) => (
              <ListRowSkeleton key={index} index={index + 1} />
            ))}
          </ListSection>
        </SkeletonRegion>
      </ScreenShell>
    );
  }
  if (
    (channelsQuery.isError && channelsQuery.data === undefined) ||
    (categoriesQuery.isError && categoriesQuery.data === undefined)
  ) {
    return (
      <ScreenShell back={BACK_TO_CHAT} title="Channel settings">
        <ErrorState
          title="Couldn't load the channel"
          body="Check your connection and try again."
          onRetry={() => {
            void channelsQuery.refetch();
            void categoriesQuery.refetch();
          }}
        />
      </ScreenShell>
    );
  }
  if (!channel) {
    return (
      <ScreenShell back={BACK_TO_CHAT} title="Channel settings">
        <InlineNote>
          This channel isn&apos;t here anymore. It may have been deleted.
        </InlineNote>
      </ScreenShell>
    );
  }
  return (
    <ChannelSettings
      key={channel.id}
      channel={channel}
      categories={categories}
    />
  );
}

function ChannelSettings({
  channel,
  categories,
}: {
  channel: ChannelSummary;
  categories: ReturnType<typeof selectCategories>;
}) {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const brand = useChapterBranding();
  const styles = createStyles(tokens, brand.accent);
  const glyph = tokens.color.text.mutedForeground;
  const updateChannel = useUpdateChannel();
  const deleteChannel = useDeleteChannel();
  const accessOptionsQuery = useChannelAccessOptions();
  const accessOptions = useMemo(
    () => selectChannelAccessOptions(accessOptionsQuery.data),
    [accessOptionsQuery.data],
  );
  const pins = usePinnedMessages(channel.id);
  const { nameFor } = useMemberDisplayNames();

  const category = categories.find((c) => c.id === channel.category_id) ?? null;
  const audit = channel.is_audit_log === true;
  const takesLists =
    !audit && (channel.type === "PUBLIC" || channel.type === "ROLE_GATED");
  const see = channel.who_can_see ?? null;
  const post = channel.who_can_post ?? null;
  const matches = takesLists && matchesCategoryAccess(see, post, category);

  // ── The typed fields, saved together by the glass bar ──────────────────
  const [nameSeed, setNameSeed] = useState(channel.name);
  const [name, setName] = useState(channel.name);
  const [descriptionSeed, setDescriptionSeed] = useState(
    channel.description ?? "",
  );
  const [description, setDescription] = useState(channel.description ?? "");
  // A rename elsewhere (web, the chat header) moves an untouched draft with it.
  if (channel.name !== nameSeed) {
    setNameSeed(channel.name);
    if (name === nameSeed) setName(channel.name);
  }
  if ((channel.description ?? "") !== descriptionSeed) {
    setDescriptionSeed(channel.description ?? "");
    if (description === descriptionSeed) {
      setDescription(channel.description ?? "");
    }
  }
  const [focused, setFocused] = useState<"name" | "description" | null>(null);
  const nameChanged = name.trim() !== channel.name;
  const descriptionChanged = description.trim() !== descriptionSeed.trim();
  const dirty = nameChanged || descriptionChanged;
  const [savingFields, setSavingFields] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function saveFields() {
    const trimmed = name.trim();
    if (!trimmed) {
      setFailure(copy.nameRequired);
      return;
    }
    setSavingFields(true);
    setFailure(null);
    try {
      await updateChannel.mutateAsync({
        id: channel.id,
        body: {
          ...(nameChanged ? { name: trimmed } : {}),
          // Only a changed description goes out: a blank never-set one must
          // not become '' (see the web page).
          ...(descriptionChanged ? { description: description.trim() } : {}),
        },
      });
      successHaptic();
    } catch (error) {
      setFailure(errorCopy(error, copy.saveFailed));
    } finally {
      setSavingFields(false);
    }
  }

  // ── A row's own save ────────────────────────────────────────────────────
  const [saving, setSaving] = useState<{
    field: string;
    value: unknown;
  } | null>(null);
  async function saveRow(
    field: string,
    value: unknown,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    setSaving({ field, value });
    setFailure(null);
    try {
      await updateChannel.mutateAsync({ id: channel.id, body });
      return true;
    } catch (error) {
      setFailure(errorCopy(error, copy.saveFailed));
      return false;
    } finally {
      setSaving(null);
    }
  }
  const pending = <T,>(field: string, live: T): T =>
    saving?.field === field ? (saving.value as T) : live;

  // ── Who can see and post: a sheet each, saved when it closes ────────────
  const accessSheetRef = useRef<BottomSheetModal>(null);
  const [question, setQuestion] = useState<ChannelAccessQuestion>("see");
  const [accessDraft, setAccessDraft] = useState<
    Partial<Record<ChannelAccessQuestion, string[] | null>>
  >({});
  const liveList = (which: ChannelAccessQuestion) =>
    which === "see" ? see : post;
  function openAccess(which: ChannelAccessQuestion) {
    setQuestion(which);
    accessSheetRef.current?.present?.();
  }
  async function closeAccess() {
    const draft = accessDraft[question];
    if (draft === undefined) return;
    if (sameChannelAccessList(draft, liveList(question))) {
      setAccessDraft({});
      return;
    }
    if (isEmptyChannelAccessChoice(draft)) {
      // Kept, so the officer can add someone or pick Everyone.
      setFailure(copy.accessIncomplete);
      return;
    }
    const key = question === "see" ? "who_can_see" : "who_can_post";
    if (await saveRow(key, draft, { [key]: draft })) setAccessDraft({});
  }
  const shownList = (which: ChannelAccessQuestion) => {
    const draft = accessDraft[which];
    return draft === undefined ? liveList(which) : draft;
  };

  // ── Pickers ─────────────────────────────────────────────────────────────
  const categorySheetRef = useRef<BottomSheetModal>(null);
  const levelSheetRef = useRef<BottomSheetModal>(null);
  const pinsSheetRef = useRef<BottomSheetModal>(null);
  const deleteSheetRef = useRef<BottomSheetModal>(null);
  const categoryOptions: SheetOption[] = [
    { value: NONE, label: copy.noCategory },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];
  const builtIn = builtInChannelDefault({
    name: channel.name,
    type: channel.type as "PUBLIC" | "PRIVATE" | "ROLE_GATED",
    is_read_only: channel.is_read_only ?? post !== null,
  });
  const levelOptions: SheetOption[] = [
    { value: NONE, label: standardLevelLabel(builtIn) },
    ...(
      Object.keys(CHANNEL_DEFAULT_LEVEL_LABELS) as ChatNotificationLevel[]
    ).map((level) => ({
      value: level,
      label: CHANNEL_DEFAULT_LEVEL_LABELS[level],
    })),
  ];
  const categoryId = pending("category_id", channel.category_id);
  const level = pending(
    "default_notification_level",
    channel.default_notification_level ?? null,
  );
  const levelLabel =
    level === null
      ? standardLevelLabel(builtIn)
      : CHANNEL_DEFAULT_LEVEL_LABELS[level as ChatNotificationLevel];
  const pinCount = Array.isArray(pins.data) ? pins.data.length : null;
  const busy = saving !== null;

  return (
    <>
      <ScreenShell
        back={BACK_TO_CHAT}
        title={`#${channel.name}`}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.fields}>
          <View style={styles.field}>
            <Text style={styles.label} nativeID="channel-name-label">
              {copy.name}
            </Text>
            <TextInput
              accessibilityLabelledBy="channel-name-label"
              value={name}
              editable={!audit}
              maxLength={80}
              onChangeText={setName}
              onFocus={() => setFocused("name")}
              onBlur={() => setFocused(null)}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.input,
                focused === "name" ? styles.inputFocused : null,
                audit ? styles.inputLocked : null,
              ]}
            />
            {audit ? (
              <Text style={styles.caption}>
                Frapp names the audit log, so it can&apos;t be renamed.
              </Text>
            ) : null}
          </View>
          <View style={styles.field}>
            <Text style={styles.label} nativeID="channel-description-label">
              {copy.description}
            </Text>
            <TextInput
              accessibilityLabelledBy="channel-description-label"
              value={description}
              maxLength={500}
              multiline
              onChangeText={setDescription}
              onFocus={() => setFocused("description")}
              onBlur={() => setFocused(null)}
              placeholder="What it's for"
              placeholderTextColor={tokens.color.text.muted}
              style={[
                styles.input,
                styles.inputMultiline,
                focused === "description" ? styles.inputFocused : null,
              ]}
            />
          </View>
          {failure ? (
            <Text style={styles.failure} accessibilityLiveRegion="polite">
              {failure}
            </Text>
          ) : null}
        </View>

        <SectionHeader>{copy.access}</SectionHeader>
        <ListSection
          footnote={
            takesLists
              ? channelAccessFootnote(category?.name ?? null, matches)
              : null
          }
        >
          <ListRow
            leading={<FolderGlyph color={glyph} />}
            label={copy.category}
            value={
              categoryId === null
                ? copy.noCategory
                : (categories.find((c) => c.id === categoryId)?.name ??
                  copy.noCategory)
            }
            disabled={busy}
            onPress={() => categorySheetRef.current?.present?.()}
          />
          {takesLists ? (
            <ListRow
              leading={<EyeGlyph color={glyph} />}
              label={copy.whoCanSee}
              value={describeChannelAccess(
                shownList("see"),
                "see",
                accessOptions,
              )}
              disabled={busy}
              onPress={() => openAccess("see")}
            />
          ) : audit ? null : (
            <ListRow
              leading={<EyeGlyph color={glyph} />}
              label={copy.whoCanSee}
              value={copy.privateSee}
              variant="detail"
            />
          )}
          {takesLists ? (
            <ListRow
              leading={<MessageSquareGlyph color={glyph} />}
              label={copy.whoCanPost}
              value={describeChannelAccess(
                shownList("post"),
                "post",
                accessOptions,
              )}
              disabled={busy}
              onPress={() => openAccess("post")}
            />
          ) : audit ? null : (
            <ListRow
              leading={<MessageSquareGlyph color={glyph} />}
              label={copy.whoCanPost}
              value={
                post === null
                  ? copy.privatePost
                  : describeChannelAccess(post, "post", accessOptions)
              }
              variant="detail"
            />
          )}
          {takesLists && category && !matches ? (
            <ListRow
              label={matchCategoryLabel(category.name)}
              action
              disabled={busy}
              onPress={() =>
                void saveRow("match", true, { match_category_access: true })
              }
            />
          ) : null}
          {/* A private channel made read-only before #3722 can open up. */}
          {!takesLists && !audit && post !== null ? (
            <ListRow
              label="Let everyone in it post"
              action
              disabled={busy}
              onPress={() =>
                void saveRow("who_can_post", null, { who_can_post: null })
              }
            />
          ) : null}
        </ListSection>

        <SectionHeader>{copy.defaults}</SectionHeader>
        <ListSection footnote={copy.defaultsFootnote}>
          <ListRow
            leading={<BellGlyph color={glyph} />}
            label={copy.defaultNotifications}
            value={levelLabel}
            disabled={busy}
            onPress={() => levelSheetRef.current?.present?.()}
          />
          <ListRow
            label={copy.defaultChannel}
            description={copy.defaultChannelLine}
            trailing={
              <Toggle
                value={pending("is_default", channel.is_default === true)}
                disabled={busy}
                accessibilityLabel={copy.defaultChannel}
                onValueChange={(next) =>
                  void saveRow("is_default", next, { is_default: next })
                }
              />
            }
          />
          <ListRow
            label={copy.leaveOutOfActivity}
            description={copy.leaveOutOfActivityLine}
            trailing={
              <Toggle
                value={pending(
                  "activity_excluded",
                  channel.activity_excluded === true,
                )}
                disabled={busy}
                accessibilityLabel={copy.leaveOutOfActivity}
                onValueChange={(next) =>
                  void saveRow("activity_excluded", next, {
                    activity_excluded: next,
                  })
                }
              />
            }
          />
        </ListSection>

        <SectionHeader>{copy.moderation}</SectionHeader>
        <ListSection>
          <ListRow
            leading={<PinGlyph color={glyph} />}
            label={copy.pinnedMessages}
            value={
              pinCount === null
                ? null
                : pinCount === 0
                  ? "None"
                  : String(pinCount)
            }
            onPress={() => pinsSheetRef.current?.present?.()}
          />
        </ListSection>

        {/* The server refuses deleting the audit log (#3909). */}
        {audit ? null : (
          <View style={styles.deleteGroup}>
            <ListSection>
              <ListRow
                label={DELETE_CHANNEL_LABEL}
                destructive
                action
                onPress={() => deleteSheetRef.current?.present?.()}
              />
            </ListSection>
          </View>
        )}
        {dirty ? <TaskActionBarSpacer /> : null}
      </ScreenShell>

      {dirty ? (
        <TaskActionBar>
          <TaskBarPill
            label={copy.save}
            glyph={(ink) => <CheckGlyph color={ink} />}
            fill={brand.accentPrimary}
            ink={brand.accentOnPrimary}
            busy={savingFields}
            disabled={!name.trim()}
            onPress={() => void saveFields()}
          />
        </TaskActionBar>
      ) : null}

      <OptionSheet
        ref={categorySheetRef}
        title={copy.category}
        options={categoryOptions}
        selected={channel.category_id}
        onSelect={(next) =>
          void saveRow("category_id", next, { category_id: next })
        }
      />
      <OptionSheet
        ref={levelSheetRef}
        title={copy.defaultNotifications}
        options={levelOptions}
        selected={channel.default_notification_level ?? null}
        onSelect={(next) =>
          void saveRow("default_notification_level", next, {
            default_notification_level: next,
          })
        }
      />
      {takesLists ? (
        <ChannelAccessSheet
          ref={accessSheetRef}
          question={question}
          value={shownList(question)}
          onChange={(next) => {
            setFailure(null);
            setAccessDraft({ [question]: next });
          }}
          options={accessOptions}
          optionsState={accessOptionsStateOf(accessOptionsQuery)}
          onDismiss={() => void closeAccess()}
        />
      ) : null}
      <MessageListSheet
        ref={pinsSheetRef}
        kind="pinned"
        channelId={channel.id}
        nameFor={nameFor}
        onOpen={({ channelId, messageId, threadRootId }) =>
          router.push({
            pathname: "/chat-thread",
            params: threadRootId
              ? { channelId, threadRootId, focusMessageId: messageId }
              : { channelId, focusMessageId: messageId },
          })
        }
      />
      {audit ? null : (
        <DeleteChannelSheet
          ref={deleteSheetRef}
          channel={{ id: channel.id, name: channel.name }}
          onDelete={async (id) => {
            await deleteChannel.mutateAsync(id);
            // The screen was about a channel that's gone.
            router.dismissTo("/");
          }}
        />
      )}
    </>
  );
}

function createStyles(tokens: SignetTokens, accent: string) {
  const field = sheetFieldStyles(tokens, accent);
  return StyleSheet.create({
    fields: {
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.lg,
    },
    field: {
      gap: tokens.spacing.xs,
    },
    label: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.mutedForeground,
    },
    input: field.field,
    inputMultiline: {
      ...field.fieldMultilineText,
      minHeight: tokens.touch.minimum * 2,
    },
    inputFocused: field.fieldFocused,
    inputLocked: {
      color: tokens.color.text.muted,
    },
    caption: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    failure: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructiveText,
    },
    deleteGroup: {
      marginTop: tokens.spacing.lg,
    },
  });
}
