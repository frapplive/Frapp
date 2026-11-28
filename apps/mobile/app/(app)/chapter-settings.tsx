import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  rushPipelineAccess,
  useAiChapterSettings,
  useCustomFields,
  usePledgeClasses,
  useRoles,
  useAiConsent,
  useCategories,
  useChannelAccessOptions,
  useChapterChatBackground,
} from "@repo/hooks";
import {
  CHAPTER_TAB_COPY,
  chapterIdentityValue,
  chapterMarkValue,
  chapterVocabularyValue,
} from "@repo/hooks/chapter-tab";
import { selectChannelAccessOptions } from "@repo/hooks/channel-access";
import { parseChapterRoles } from "@repo/hooks/chapter-roles";
import { shownModuleSettings } from "@repo/hooks/module-settings";
import { SignetTokens } from "@repo/theme/signet";
import {
  AI_SETTINGS_COPY,
  aiSwitchesInEffect,
  CHAPTER_ABOUT_FOOTNOTE,
  CHAPTER_LOGS_TITLE,
  CHAPTER_LOOK_FOOTNOTE,
  CHAT_BACKGROUND_LABELS,
  canAny,
  isModuleEnabled,
  MEMBER_FIELDS_COPY,
  NAME_LOCK_COPY,
  PEOPLE_SETTINGS_COPY,
  PRIVACY_SETTINGS_COPY,
} from "@repo/validation";
import { ScreenShell } from "@/components/screen-shell";
import { BACK_TO_CHAT } from "@/components/back-row";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import {
  BuildingGlyph,
  GraduationCapGlyph,
  IdCardGlyph,
  ImageGlyph,
  LandmarkGlyph,
  LockGlyph,
  PaletteGlyph,
  ScrollTextGlyph,
  ShieldGlyph,
  SparklesGlyph,
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
import { PlusGlyph } from "@/components/control-glyphs";
import {
  ChannelFormSheet,
  type ChannelFormMode,
} from "@/components/chat/channel-form-sheet";
import { accessOptionsStateOf } from "@/lib/chat/create-channel";
import { useCreateChannelAndOpen } from "@/lib/chat/use-create-channel-and-open";
import { selectCategories } from "@/lib/chat/channel-list";
import { usePledgeClassTerms } from "@/lib/directory/pledge-class";
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
 * - **The profile** on top: Chapter name, University and Donation link, each
 *   saved on its own when left (`ChapterProfileForm`, #6033).
 * - **Look**: Chapter mark (a pushed page: the logo from the photo library,
 *   the short name and Show Greek letters), Chapter accent and Chat
 *   background (each a sheet).
 * - **About the chapter**: Identity & founding, Organization type and
 *   Vocabulary, each a pushed page.
 * - **Chapter**: Birthday posts (a channel sheet, Off or a channel), Members
 *   can change their own name (#5801), then Privacy, AI and Logs in web's
 *   rail order (#6028), each pushing web's page as a screen: Privacy's one
 *   switch (`chapter-privacy.tsx`) and the president's AI switches
 *   (`chapter-ai.tsx`), which Settings' Chapter AI row opens too. AI draws
 *   only where the server has AI and the switches have been read.
 *
 * A member who can't change something still reads every value: a row that
 * opens a sheet doesn't open for them and says an officer sets it; a row
 * that opens a page opens it read-only, its fields muted, with a line saying
 * the role can't change it.
 *
 * Then the rest:
 *
 * - **Chat**: New channel.
 * - **People**: Roles and groups, the chapter's tiers and their roles, then
 *   its groups (`app/(app)/chapter-roles.tsx`); Pledge class
 *   (`pledge-classes.tsx`) and Member fields (`member-fields.tsx`), each
 *   with web's page's rows (#6029). Adding a role sits in its tier on Roles
 *   and groups, as on web, so New role is no longer a row here.
 *
 * - **Modules** (#6030): a row per module, in web's rail order, each pushing
 *   the module's screen (`app/(app)/module-settings.tsx`) with web's module
 *   page's rows: the switch, rules, goals and who can. Study zones' zone
 *   count moved there from Chapter. The officer tools stay on web.
 *
 * Web's other pages (Plan and billing, the semester, Diagnostics) stay on
 * web: they are setup an officer does once, at a desk (#4074; Paul,
 * 2026-11-27, for the semester and Diagnostics).
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

  // The consent read says whether the server has AI at all (null when it
  // doesn't), as every AI entry on the phone asks before drawing.
  // Web's AI tab is a Chapter settings page, so it opens for
  // `chapter-config:view` (`settings-access.ts`); the phone draws its
  // switches for the same people, not for a roles manager without it.
  const aiConsent = useAiConsent({ enabled: access.chapter });
  const aiAvailable = access.chapter && !!aiConsent.data;
  const aiSettingsQuery = useAiChapterSettings({ enabled: aiAvailable });
  const aiSettings = aiSettingsQuery.data;
  const readOnlyLine = canEditProfile ? null : CHAPTER_TAB_COPY.rowReadOnly;
  // Recruitment's screen reads only what `rush:view` opens, with the module
  // on, so a chair without the config key still reaches its interest form.
  const recruitmentChair =
    rushPipelineAccess(tab.permissions).view &&
    isModuleEnabled(chapterQuery.data?.enabled_modules, "rush");

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
                {config || access.logs || (aiAvailable && aiSettings) ? (
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
                      {config ? (
                        // Web's rail order: Privacy, then AI, then Logs
                        // (#6028). Each pushes web's page as a screen.
                        <SettingAnchor id="analytics">
                          <ListRow
                            leading={<LockGlyph color={glyphColor} />}
                            label={PRIVACY_SETTINGS_COPY.title}
                            value={
                              config.analytics_opt_out === true
                                ? PRIVACY_SETTINGS_COPY.off
                                : PRIVACY_SETTINGS_COPY.on
                            }
                            accessibilityHint="Opens whether the chapter shares usage analytics."
                            onPress={() => router.push("/chapter-privacy")}
                          />
                        </SettingAnchor>
                      ) : null}
                      {aiAvailable && aiSettings ? (
                        <SettingAnchor id="ai">
                          <ListRow
                            leading={<SparklesGlyph color={glyphColor} />}
                            label={AI_SETTINGS_COPY.title}
                            value={AI_SETTINGS_COPY.chapterRowValue(
                              aiSwitchesInEffect(aiSettings),
                            )}
                            accessibilityHint="Opens the chapter's AI features."
                            onPress={() => router.push("/chapter-ai")}
                          />
                        </SettingAnchor>
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
          </>
        )}
        {/* Mounted through a search, as the accent and background sheets
            are, so a New channel draft kept on a close survives typing in
            Search settings; only their rows hide (`searching`). */}
        {access.newChannel ? (
          <ChatSection searching={search.searching} />
        ) : null}
        {access.roles && !search.searching ? (
          <PeopleSection
            canSeeRoles={canAny(
              ["roles:manage", "chapter-config:view"],
              tab.permissions,
            )}
            // Both routes refuse a council (ChapterGuard, no `@TenantKinds`),
            // so their rows draw only where the tenant serves chapter features.
            pledgeClasses={tab.chapterFeatures && access.pledgeClasses}
            memberFields={tab.chapterFeatures && access.memberFields}
          />
        ) : null}
        {search.searching || !tab.chapterFeatures ? null : (
          <ModulesSection
            enabledModules={
              orgConfig.data?.enabled_modules ??
              chapterQuery.data?.enabled_modules
            }
            // A council's config route refuses it (#5933), so it has none.
            // A recruitment chair without `chapter-config:view` gets
            // Recruitment alone, for the interest form (#5977).
            only={access.chapter ? null : recruitmentChair ? ["rush"] : []}
          />
        )}
        {/* Where the phone stops (Shawn, 2026-11-22): Plan and billing, the
            semester and the officer tools are web's Settings, which an officer sets up once, at a
            desk. One quiet line, as iOS Settings ends a group with its
            footnote. */}
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

/**
 * Modules (#6030): a row per module, in web's rail order and words
 * (`shownModuleSettings`), saying Off where the chapter switched it off, each
 * pushing the module's screen: its switch, rules, goals and who can.
 */
function ModulesSection({
  enabledModules,
  only,
}: {
  enabledModules: Record<string, boolean> | null | undefined;
  /** The modules this viewer may open, or `null` for every one. */
  only: readonly string[] | null;
}) {
  const router = useRouter();
  const modules = shownModuleSettings().filter(
    (module) => only === null || only.includes(module.key),
  );
  if (modules.length === 0) return null;
  return (
    <>
      <SectionHeader>Modules</SectionHeader>
      <ListSection>
        {modules.map((module) => (
          <SettingAnchor key={module.key} id={`module-${module.key}`}>
            <ListRow
              label={module.label}
              value={isModuleEnabled(enabledModules, module.key) ? null : "Off"}
              accessibilityHint={`Opens ${module.label}: its switch, rules and who can.`}
              onPress={() =>
                router.push({
                  pathname: "/module-settings",
                  params: { module: module.key },
                })
              }
            />
          </SettingAnchor>
        ))}
      </ListSection>
    </>
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

/** "1 role", "12 roles": the Roles and groups row's value. */
function roleCountLabel(count: number): string {
  return count === 1 ? "1 role" : `${count} roles`;
}

/** "No fields", "1 field", "4 fields": the Member fields row's value. */
function fieldCountLabel(count: number): string {
  if (count === 0) return "No fields";
  return count === 1 ? "1 field" : `${count} fields`;
}

/**
 * People (#6029), in web's rail order: Roles and groups, Pledge class (titled
 * with the chapter's own word) and Member fields, each a pushed page with
 * its count, each shown only to whoever web's tab shows to.
 */
function PeopleSection({
  canSeeRoles,
  pledgeClasses,
  memberFields,
}: {
  /** Roles are read for a roles manager or config viewer, not a groups-only one. */
  canSeeRoles: boolean;
  pledgeClasses: boolean;
  memberFields: boolean;
}) {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const glyphColor = tokens.color.text.mutedForeground;
  const rolesQuery = useRoles({ enabled: canSeeRoles });
  const roleCount =
    canSeeRoles && rolesQuery.data !== undefined
      ? parseChapterRoles(rolesQuery.data).length
      : undefined;
  return (
    <>
      <SectionHeader>People</SectionHeader>
      <ListSection>
        <ListRow
          leading={<ShieldGlyph color={glyphColor} />}
          label={PEOPLE_SETTINGS_COPY.pageTitle}
          value={roleCount === undefined ? null : roleCountLabel(roleCount)}
          accessibilityHint="Opens the chapter's tiers, roles and groups."
          onPress={() => router.push("/chapter-roles")}
        />
        {pledgeClasses ? <PledgeClassRow glyphColor={glyphColor} /> : null}
        {memberFields ? <MemberFieldsRow glyphColor={glyphColor} /> : null}
      </ListSection>
    </>
  );
}

/** People → Pledge class, in the chapter's own word, with how many it has. */
function PledgeClassRow({ glyphColor }: { glyphColor: string }) {
  const router = useRouter();
  const { classTerm } = usePledgeClassTerms();
  const classesQuery = usePledgeClasses();
  const count = classesQuery.data?.length;
  return (
    <SettingAnchor id="pledge-class">
      <ListRow
        leading={<GraduationCapGlyph color={glyphColor} />}
        label={classTerm}
        value={count === undefined ? null : String(count)}
        accessibilityHint="Opens the chapter's list, oldest first, and who is in each."
        onPress={() => router.push("/pledge-classes")}
      />
    </SettingAnchor>
  );
}

/** People → Member fields, with how many the chapter has. */
function MemberFieldsRow({ glyphColor }: { glyphColor: string }) {
  const router = useRouter();
  const fieldsQuery = useCustomFields();
  const count = fieldsQuery.data?.length;
  return (
    <SettingAnchor id="member-fields">
      <ListRow
        leading={<IdCardGlyph color={glyphColor} />}
        label={MEMBER_FIELDS_COPY.pageTitle}
        value={count === undefined ? null : fieldCountLabel(count)}
        accessibilityHint="Opens the questions members answer under More details."
        onPress={() => router.push("/member-fields")}
      />
    </SettingAnchor>
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
