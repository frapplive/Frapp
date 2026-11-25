import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useAiChapterSettings,
  useAiConsent,
  useCategories,
  useChannelAccessOptions,
  useChapterChatBackground,
  useGeofences,
  useUpdateAiChapterSettings,
} from "@repo/hooks";
import {
  CHAPTER_TAB_COPY,
  chapterIdentityValue,
  chapterMarkValue,
  chapterVocabularyValue,
} from "@repo/hooks/chapter-tab";
import { selectChannelAccessOptions } from "@repo/hooks/channel-access";
import { SignetTokens } from "@repo/theme/signet";
import {
  AI_SETTINGS_COPY,
  AI_SWITCHES,
  aiSwitchState,
  type AiChapterSwitchKey,
  CHAPTER_ABOUT_FOOTNOTE,
  CHAPTER_LOGS_TITLE,
  CHAPTER_LOOK_FOOTNOTE,
  CHAT_BACKGROUND_LABELS,
  isModuleEnabled,
  NAME_LOCK_COPY,
} from "@repo/validation";
import { ScreenShell } from "@/components/screen-shell";
import { BACK_TO_CHAT } from "@/components/back-row";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import {
  BuildingGlyph,
  ImageGlyph,
  LandmarkGlyph,
  PaletteGlyph,
  ScrollTextGlyph,
  TypeGlyph,
  WallpaperGlyph,
} from "@/components/settings-glyphs";
import { BirthdayPostsRow } from "@/components/settings/birthday-posts-row";
import { ChapterProfileForm } from "@/components/settings/chapter-profile-form";
import { AccentSheet } from "@/components/settings/accent-sheet";
import { ChatBackgroundSheet } from "@/components/settings/chat-background-sheet";
import {
  SettingAnchor,
  SettingJumpProvider,
  useSettingJumpState,
} from "@/components/settings/setting-anchor";
import { useSettingsSearchField } from "@/components/settings/settings-search";
import { Toggle } from "@/components/toggle";
import { InterestFormSettingsSection } from "@/components/rush/interest-form-settings-section";
import { PlusGlyph } from "@/components/control-glyphs";
import {
  ChannelFormSheet,
  type ChannelFormMode,
} from "@/components/chat/channel-form-sheet";
import { NewRoleSheet } from "@/components/roles/new-role-sheet";
import { accessOptionsStateOf } from "@/lib/chat/create-channel";
import { useCreateChannelAndOpen } from "@/lib/chat/use-create-channel-and-open";
import { selectCategories } from "@/lib/chat/channel-list";
import { newRolePlacements, type NewRolePlacement } from "@/lib/roles/new-role";
import { useRolesData } from "@/lib/roles/use-roles-data";
import { useChapterBranding } from "@/lib/chapter-branding";
import { useChapterTab } from "@/lib/settings/chapter-tab";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * Chapter settings, on the phone (#4074): the chapter's side of settings, as
 * web's Chapter settings is, reached from the chapter menu on Chat home's
 * chapter name (2026-11-19; You → Admin until then). Settings (s16) is the
 * member's own; until this screen it also carried a "Chapter · Admin" group,
 * which moved here whole.
 *
 * Its top half is web's Chapter tab (#5965, #6027), in web's order and
 * words, its rules shared through `@repo/hooks/chapter-tab`:
 *
 * - **The profile** on top: Chapter name, University and Donation link, then
 *   Save profile, which waits for an edit (`ChapterProfileForm`).
 * - **Look**: Chapter mark (a pushed page: the logo from the photo library,
 *   the short name and Show Greek letters), Chapter accent and Chat
 *   background (each a sheet).
 * - **About the chapter**: Identity & founding, Organization type and
 *   Vocabulary, each a pushed page.
 * - **Chapter**: Birthday posts (a channel sheet, Off or a channel), Members
 *   can change their own name (#5801), Study zones (read-only; zones are
 *   drawn on the web dashboard), then Logs.
 *
 * A member who can't change something still reads every value: a row that
 * opens a sheet doesn't open for them and says an officer sets it; a row
 * that opens a page opens it read-only, saying so where Save would be.
 *
 * Then the rest:
 *
 * - **AI**: the president's three switches (#4789), the same ones and the
 *   same rules as web's AI tab (`settings-ai-tab.tsx`): every member here can
 *   read them, only the president changes them, and Include channel messages
 *   sits nested under Questions and requests and waits for it to be on before it can be
 *   turned on (never off), by `aiSwitchState`, which web's tab shares. For
 *   `chapter-config:view`, as web's tab is.
 *   Inline switches, as iOS Settings draws a short list of them, rather than
 *   a page of their own. Drawn only where the server has AI.
 * - **Chat**: New channel.
 * - **People**: Roles and groups, the chapter's tiers and their roles, then
 *   its groups (`app/(app)/chapter-roles.tsx`), and New role.
 *
 * Web's other pages (Plan and billing, the module pages, member fields) stay
 * on web for now: they are setup an officer does once, at a desk.
 * Grouped rows with a chevron, as iOS Settings and Discord mobile's Server
 * Settings draw theirs.
 *
 * **Search settings** (2026-11-19) sits on top, as on web and in iOS
 * Settings: it finds every setting the member can change, here or on
 * Settings, and web-only ones open the dashboard
 * (`components/settings/settings-search.tsx`). A `setting` param, from that
 * search or from Search, lights its row (`SettingAnchor`).
 */
export default function ChapterSettingsScreen() {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens);
  const glyphColor = tokens.color.text.mutedForeground;
  const accentSheetRef = useRef<BottomSheetModal>(null);
  const chatBackgroundSheetRef = useRef<BottomSheetModal>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { setting } = useLocalSearchParams<{ setting?: string }>();
  const jump = useSettingJumpState(setting);
  const search = useSettingsSearchField({
    here: "/chapter-settings",
    jumpHere: jump.jump,
  });

  // The profile, branding, type and words, and both gates: the profile
  // PATCH's `CHAPTER_PROFILE_PERMISSIONS` (accent, chat background, logo,
  // #4031) and the config PATCH's `chapter-config:manage` (the rest). The
  // config read refuses a council (#5933), so its parts don't draw there.
  const tab = useChapterTab();
  const {
    access,
    chapterQuery,
    orgConfig,
    patchConfig,
    canEditProfile,
    canManage: canManageConfig,
    branding,
    archetype,
    vocabulary,
  } = tab;
  const chapterBackground = useChapterChatBackground();
  const [namesSaveFailed, setNamesSaveFailed] = useState(false);
  const [birthdaySaving, setBirthdaySaving] = useState(false);
  const membersCanRename = orgConfig.data?.members_can_change_name === true;
  const config = orgConfig.data;
  const birthdayChannelId =
    typeof config?.birthday_channel_id === "string"
      ? config.birthday_channel_id
      : null;
  const geofencesEnabled =
    access.chapter &&
    isModuleEnabled(chapterQuery.data?.enabled_modules, "geofences");
  // Gated, not just hidden: the route requires `members:view` and the
  // `geofences` module, so firing it for a member who won't see the row
  // spends a request to collect a 403. No response schema, so narrowed
  // through `unknown`.
  const geofencesQuery = useGeofences({ enabled: geofencesEnabled });
  const zones = geofencesQuery.data as unknown;
  const zoneCount = Array.isArray(zones) ? zones.length : null;

  // The consent read says whether the server has AI at all (null when it
  // doesn't), as every AI entry on the phone asks before drawing.
  // Web's AI tab is a Chapter settings page, so it opens for
  // `chapter-config:view` (`settings-access.ts`); the phone draws its
  // switches for the same people, not for a roles manager without it.
  const aiConsent = useAiConsent({ enabled: access.chapter });
  const aiAvailable = access.chapter && !!aiConsent.data;
  const aiSettingsQuery = useAiChapterSettings({ enabled: aiAvailable });
  const aiSettings = aiSettingsQuery.data;
  const updateAi = useUpdateAiChapterSettings();
  // The switch whose last save failed. The phone has no toast, so the failure
  // is that row's second line, and the switch snaps back (navigation.md §
  // Chapter settings).
  const [aiFailedKey, setAiFailedKey] = useState<AiChapterSwitchKey | null>(
    null,
  );

  const readOnlyLine = canEditProfile ? null : CHAPTER_TAB_COPY.rowReadOnly;

  return (
    <ScreenShell
      back={BACK_TO_CHAT}
      title="Chapter settings"
      scrollRef={scrollRef}
      keyboardShouldPersistTaps="handled"
    >
      {search.field}
      {search.searching ? search.results : null}
      <SettingJumpProvider
        anchor={search.searching ? null : jump.anchor}
        serial={jump.serial}
        scrollRef={scrollRef}
      >
        {search.searching ? null : (
          <>
            {access.chapter ? (
              <>
                {tab.chapterFeatures ? (
                  <ChapterProfileForm
                    stored={tab.profile}
                    canEdit={canEditProfile}
                  />
                ) : null}
                <SectionHeader>Look</SectionHeader>
                <ListSection footnote={CHAPTER_LOOK_FOOTNOTE}>
                  {config ? (
                    // A page anyone here can open: the mark, the logo and the
                    // short name read there for a viewer who can't change
                    // them, with the line saying so.
                    <SettingAnchor id="chapter-mark">
                      <ListRow
                        leading={<ImageGlyph color={glyphColor} />}
                        label="Chapter mark"
                        value={chapterMarkValue({
                          logoUrl: tab.logoUrl,
                          branding,
                          name: tab.name,
                        })}
                        accessibilityHint="Opens the chapter's logo, short name and letters."
                        onPress={() => router.push("/chapter-mark")}
                      />
                    </SettingAnchor>
                  ) : null}
                  <SettingAnchor id="accent">
                    <ListRow
                      leading={<PaletteGlyph color={glyphColor} />}
                      label="Chapter accent"
                      // An editor's row is the swatch and a chevron. Anyone else's
                      // can't open, so it says who can change it rather than leaving
                      // a dead row unexplained (design-system README §5).
                      description={readOnlyLine}
                      accessibilityHint={
                        canEditProfile
                          ? "Opens the color picker for the chapter accent."
                          : undefined
                      }
                      onPress={
                        canEditProfile
                          ? () => accentSheetRef.current?.present()
                          : undefined
                      }
                      trailing={
                        <View
                          accessibilityLabel="Current chapter accent"
                          style={[styles.swatch, { backgroundColor: accent }]}
                        />
                      }
                    />
                  </SettingAnchor>
                  <SettingAnchor id="chat-background">
                    <ListRow
                      leading={<WallpaperGlyph color={glyphColor} />}
                      label="Chat background"
                      value={
                        chapterBackground.data
                          ? CHAT_BACKGROUND_LABELS[
                              chapterBackground.data.background
                            ]
                          : undefined
                      }
                      description={readOnlyLine}
                      accessibilityHint={
                        canEditProfile
                          ? "Choose the background every channel shows unless it has its own."
                          : undefined
                      }
                      onPress={
                        canEditProfile
                          ? () => chatBackgroundSheetRef.current?.present()
                          : undefined
                      }
                    />
                  </SettingAnchor>
                </ListSection>
                {config ? (
                  // Each opens its page for anyone here, so a member who
                  // can't change them still reads every value; the page
                  // says so where its Save would be.
                  <>
                    <SectionHeader>About the chapter</SectionHeader>
                    <ListSection footnote={CHAPTER_ABOUT_FOOTNOTE}>
                      <SettingAnchor id="identity">
                        <ListRow
                          leading={<LandmarkGlyph color={glyphColor} />}
                          label="Identity & founding"
                          value={chapterIdentityValue(branding, tab.name)}
                          accessibilityHint="Opens the chapter's letters, designation, school and founding year."
                          onPress={() => router.push("/chapter-identity")}
                        />
                      </SettingAnchor>
                      <SettingAnchor id="organization-type">
                        <ListRow
                          leading={<BuildingGlyph color={glyphColor} />}
                          label="Organization type"
                          value={archetype.short}
                          accessibilityHint="Opens the organization types."
                          onPress={() => router.push("/chapter-type")}
                        />
                      </SettingAnchor>
                      <SettingAnchor id="vocabulary">
                        <ListRow
                          leading={<TypeGlyph color={glyphColor} />}
                          label="Vocabulary"
                          value={chapterVocabularyValue(
                            vocabulary,
                            archetype.key,
                          )}
                          accessibilityHint="Opens the chapter's own words."
                          onPress={() => router.push("/chapter-vocabulary")}
                        />
                      </SettingAnchor>
                    </ListSection>
                  </>
                ) : null}
                {/* Every row below is conditional, so the group draws only
                    when one of them does, never as an empty card. */}
                {config || geofencesEnabled || access.logs ? (
                  <>
                    <SectionHeader>Chapter</SectionHeader>
                    <ListSection>
                      {config ? (
                        <BirthdayPostsRow
                          channelId={birthdayChannelId}
                          canManage={canManageConfig}
                          saving={birthdaySaving}
                          glyphColor={glyphColor}
                          onSave={(diff, { onError }) => {
                            setBirthdaySaving(true);
                            patchConfig
                              .mutateAsync(diff)
                              .catch(onError)
                              .finally(() => setBirthdaySaving(false));
                          }}
                        />
                      ) : null}
                      {config ? (
                        <SettingAnchor id="member-names">
                          <ListRow
                            label={NAME_LOCK_COPY.settingLabel}
                            description={
                              namesSaveFailed
                                ? NAME_LOCK_COPY.saveFailed
                                : canManageConfig
                                  ? NAME_LOCK_COPY.settingLine
                                  : readOnlyLine
                            }
                            descriptionTone={
                              namesSaveFailed ? "destructive" : "default"
                            }
                            trailing={
                              <Toggle
                                value={membersCanRename}
                                disabled={
                                  !canManageConfig || patchConfig.isPending
                                }
                                onValueChange={(next) => {
                                  setNamesSaveFailed(false);
                                  // Awaited, not a `mutate` callback: the
                                  // birthday pick shares this mutation, and
                                  // a second `mutate` drops the first's
                                  // callbacks, failure line and all.
                                  patchConfig
                                    .mutateAsync({
                                      members_can_change_name: next,
                                    })
                                    .catch(() => setNamesSaveFailed(true));
                                }}
                                accessibilityLabel={NAME_LOCK_COPY.settingLabel}
                              />
                            }
                          />
                        </SettingAnchor>
                      ) : null}
                      {geofencesEnabled ? (
                        // Read-only here (the phone has no zone editor), so it says
                        // where zones are changed: the dashboard's Study zones tool.
                        <ListRow
                          label="Study zones"
                          description="Managed on the web dashboard."
                          value={
                            zoneCount === null
                              ? "—"
                              : `${zoneCount} ${zoneCount === 1 ? "zone" : "zones"}`
                          }
                        />
                      ) : null}
                      {access.logs ? (
                        // Last in Chapter, as web's Logs row is (Paul,
                        // 2026-11-21): read when something needs looking into.
                        <ListRow
                          leading={<ScrollTextGlyph color={glyphColor} />}
                          label={CHAPTER_LOGS_TITLE}
                          accessibilityHint="Opens who changed what in the chapter, and when."
                          onPress={() => router.push("/chapter-logs")}
                        />
                      ) : null}
                    </ListSection>
                  </>
                ) : null}
              </>
            ) : null}

            {aiAvailable && aiSettings ? (
              <SettingAnchor id="ai">
                <SectionHeader>{AI_SETTINGS_COPY.title}</SectionHeader>
                <ListSection>
                  {AI_SWITCHES.map((entry) => {
                    const { checked, parentOff, waitsOnParent } = aiSwitchState(
                      entry,
                      aiSettings,
                    );
                    const failed = aiFailedKey === entry.key;
                    return (
                      <ListRow
                        key={entry.key}
                        label={entry.label}
                        nested={entry.dependsOn !== undefined}
                        muted={parentOff}
                        description={
                          failed
                            ? `${AI_SETTINGS_COPY.saveFailed}. Try again.`
                            : waitsOnParent
                              ? `${entry.short} ${AI_SETTINGS_COPY.dependsOnAsk}`
                              : entry.short
                        }
                        descriptionTone={failed ? "destructive" : "default"}
                        trailing={
                          <Toggle
                            value={checked}
                            disabled={
                              !aiSettings.can_change ||
                              // One save at a time: each answer replaces the whole
                              // cached row, so two in flight could draw one wrong.
                              updateAi.isPending ||
                              // Waiting on Ask blocks turning it on, never off.
                              waitsOnParent
                            }
                            onValueChange={(next) => {
                              setAiFailedKey(null);
                              updateAi.mutate(
                                { [entry.key]: next },
                                { onError: () => setAiFailedKey(entry.key) },
                              );
                            }}
                            accessibilityLabel={entry.label}
                          />
                        }
                      />
                    );
                  })}
                </ListSection>
                <Text style={styles.footnote}>
                  {aiSettings.can_change
                    ? AI_SETTINGS_COPY.phoneFootnote
                    : `${AI_SETTINGS_COPY.presidentOnly} ${AI_SETTINGS_COPY.phoneFootnote}`}
                </Text>
              </SettingAnchor>
            ) : null}
          </>
        )}
        {/* Mounted through a search, as the accent and background sheets
            are, so a New role draft kept on a close survives typing in
            Search settings; only their rows hide (`searching`). */}
        {access.newChannel ? (
          <ChatSection searching={search.searching} />
        ) : null}
        {search.searching ? null : (
          <InterestFormSettingsSection
            permissions={permissions}
            moduleOn={isModuleEnabled(
              chapterQuery.data?.enabled_modules,
              "rush",
            )}
          />
        )}
        {access.roles ? (
          access.newRole ? (
            <PeopleSectionWithNewRole searching={search.searching} />
          ) : (
            <PeopleSection searching={search.searching} placements={[]} />
          )
        ) : null}
        {/* Where the phone stops (Shawn, 2026-11-22): permissions, channel
            access, reordering, the chapter profile and the rest are web's
            Settings, which an officer sets up once, at a desk. One quiet
            line, as iOS Settings ends a group with its footnote. */}
        {search.searching ? null : (
          <Text style={styles.footnote}>{MORE_ON_THE_WEB}</Text>
        )}
      </SettingJumpProvider>

      {access.chapter ? (
        <>
          <AccentSheet ref={accentSheetRef} />
          <ChatBackgroundSheet ref={chatBackgroundSheetRef} />
        </>
      ) : null}
    </ScreenShell>
  );
}

/** The screen's last line: what isn't here is on the web (#5296). */
const MORE_ON_THE_WEB = "More settings are on the web dashboard.";

/**
 * Chat → New channel (#5296): the sheet Chat home's "+" opens (#3838), here
 * too, so an officer setting the chapter up finds it where Discord mobile's
 * Server Settings and Slack's Create a channel put it. Name, category,
 * private or not, and who can see and post; then the channel opens, through
 * the save Chat home uses (`useCreateChannelAndOpen`).
 */
function ChatSection({ searching }: { searching: boolean }) {
  const { tokens } = useFrappTheme();
  const createChannelAndOpen = useCreateChannelAndOpen();
  const categoriesQuery = useCategories();
  const categories = useMemo(
    () => selectCategories(categoriesQuery.data),
    [categoriesQuery.data],
  );
  const sheetRef = useRef<BottomSheetModal>(null);
  // Mounted fresh for each opening, as on Chat home, so a Cancel's draft
  // never comes back.
  const [formKey, setFormKey] = useState<number | null>(null);
  const accessOptionsQuery = useChannelAccessOptions(formKey !== null);
  const accessOptions = useMemo(
    () => selectChannelAccessOptions(accessOptionsQuery.data),
    [accessOptionsQuery.data],
  );
  useEffect(() => {
    if (formKey !== null) sheetRef.current?.present?.();
  }, [formKey]);

  return (
    <>
      {searching ? null : (
        <>
          <SectionHeader>Chat</SectionHeader>
          <ListSection>
            <SettingAnchor id="new-channel">
              <ListRow
                label="New channel"
                leading={
                  <PlusGlyph color={tokens.color.text.mutedForeground} />
                }
                accessibilityHint="Opens the form for a new channel."
                onPress={() => setFormKey((key) => (key ?? 0) + 1)}
              />
            </SettingAnchor>
          </ListSection>
        </>
      )}
      {formKey !== null ? (
        <ChannelFormSheet
          key={formKey}
          ref={sheetRef}
          mode={NEW_CHANNEL_MODE}
          categories={categories}
          accessOptions={accessOptions}
          accessOptionsState={accessOptionsStateOf(accessOptionsQuery)}
          onSubmit={createChannelAndOpen}
        />
      ) : null}
    </>
  );
}

const NEW_CHANNEL_MODE: ChannelFormMode = { kind: "create", categoryId: null };

/**
 * People for a `roles:manage` holder: the roles reads, then Roles and groups
 * and New role (#5296). Split from {@link PeopleSection} so the reads (the
 * roles, tiers and member list) are spent only on someone who can add a role.
 */
function PeopleSectionWithNewRole({ searching }: { searching: boolean }) {
  const { tiers, reach, words } = useRolesData();
  const placements = useMemo(
    () => newRolePlacements(reach, tiers, `Outside the ${words.plural}`),
    [reach, tiers, words.plural],
  );
  return (
    <PeopleSection
      searching={searching}
      placements={placements}
      tierLabel={words.Singular}
    />
  );
}

/**
 * People: Roles and groups, then New role where the officer has somewhere to
 * put one (#5296): a name, a tier and a color, then the role's page, where
 * what it can do is switched.
 */
function PeopleSection({
  searching,
  placements,
  tierLabel = "Tier",
}: {
  searching: boolean;
  placements: readonly NewRolePlacement[];
  tierLabel?: string;
}) {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const showNewRole = placements.length > 0;

  return (
    <>
      {searching ? null : (
        <>
          <SectionHeader>People</SectionHeader>
          <ListSection>
            <ListRow
              label="Roles and groups"
              accessibilityHint="Opens the chapter's tiers, roles and groups."
              onPress={() => router.push("/chapter-roles")}
            />
            {showNewRole ? (
              <SettingAnchor id="new-role">
                <ListRow
                  label="New role"
                  leading={
                    <PlusGlyph color={tokens.color.text.mutedForeground} />
                  }
                  accessibilityHint="Opens the form for a new role."
                  onPress={() => sheetRef.current?.present()}
                />
              </SettingAnchor>
            ) : null}
          </ListSection>
        </>
      )}
      {showNewRole ? (
        <NewRoleSheet
          ref={sheetRef}
          chapterRole={{ placements, tierLabel }}
          onCreated={(roleId) =>
            router.push({ pathname: "/role", params: { roleId } })
          }
        />
      ) : null}
    </>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    footnote: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
      paddingHorizontal: tokens.spacing.xs,
    },
    swatch: {
      width: tokens.spacing.xl,
      height: tokens.spacing.xl,
      borderRadius: tokens.radius.chipLarge,
      borderWidth: 1,
      borderColor: tokens.color.border.input,
    },
  });
}
