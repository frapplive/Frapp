import { useRef, useState } from "react";
import { StyleSheet, Text, View, type ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useBlockedUserIds,
  useCurrentChapter,
  useFrappAiChoice,
  usePermissionList,
} from "@repo/hooks";
import { SignetTokens } from "@repo/theme/signet";
import {
  PERSONAL_SETTINGS_COPY,
  personalSettingsGroupLabel,
  personalSettingsPageLabel,
} from "@repo/validation";
import { chatDensityLabel } from "@repo/chat-core/density";
import { ScreenShell } from "@/components/screen-shell";
import { BACK_TO_YOU } from "@/components/back-row";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { BlockedMembersSheet } from "@/components/settings/blocked-members-sheet";
import { AccountSettingsPage } from "@/components/settings/personal/account-page";
import { AiSettingsPage } from "@/components/settings/personal/ai-page";
import { ChatSettingsPage } from "@/components/settings/personal/chat-page";
import { LinkedAppsSettingsPage } from "@/components/settings/personal/linked-apps-page";
import { NotificationsSettingsPage } from "@/components/settings/personal/notifications-page";
import {
  SettingAnchor,
  SettingJumpProvider,
  useSettingJumpState,
} from "@/components/settings/setting-anchor";
import { useSettingsSearchField } from "@/components/settings/settings-search";
import {
  BellGlyph,
  CircleUserRoundGlyph,
  GraduationCapGlyph,
  HeartHandshakeGlyph,
  Link2Glyph,
  MessageSquareGlyph,
  NewspaperGlyph,
  ScrollTextGlyph,
  ShieldGlyph,
  SparklesGlyph,
  UserXGlyph,
} from "@/components/settings-glyphs";
import { useAuthSession } from "@/lib/auth-session";
import { useChatDensity } from "@/lib/chat/chat-density";
import { shouldShowDonationCta } from "@/lib/more/donation";
import { LEGAL_LINKS } from "@/lib/more/legal";
import { pushUnavailableReason } from "@/lib/notifications/push";
import { pushIsOn } from "@/lib/notifications/push-state";
import { usePushState } from "@/lib/notifications/use-push-state";
import { useServesChapterFeatures } from "@/lib/tenant-kind";
import { typeRole, useFrappTheme } from "@/lib/theme";
import { useWhatsNewQuiet } from "@/lib/whats-new";

/**
 * s16 — Settings (`canvas-screens.dc.html:527`). The route file keeps the name
 * `preferences.tsx`; the drawn title is "Settings" (`spec/ui/mobile/screens.md`).
 *
 * The member's own settings in Discord's settings shape (#6032, epic #5964;
 * Paul 2026-11-20: "simple and … hidden behind … right visual hierarchy and
 * chunking"). The first page is a short list of rows, each a glyph, a label,
 * its current value and a chevron, in the groups and order web's rail lists
 * (`PERSONAL_SETTINGS_PAGES` in `@repo/validation`); each row pushes its page
 * as `/preferences?page=…`, its own stack entry, so back returns here. Until
 * then every setting sat on this one screen, three screens tall for an exec.
 *
 * ## Deviations from the drawing, each deliberate
 *
 * - **Pages, not one long list.** The drawing's NOTIFICATIONS and ACCOUNT
 *   sections, and everything added under them since (quiet hours, chat
 *   density, read receipts, nudges, linked apps, sign-in methods, Frapp
 *   Intelligence), now sit on the pages the rows open; each page's file says
 *   why its rows are there.
 * - **No CHAPTER · ADMIN.** The drawn group (accent, chat background, study
 *   zones) moved whole to Chapter settings (`app/(app)/chapter-settings.tsx`,
 *   #4074), the chapter's side of settings off Chat home's chapter menu, so
 *   this screen is the member's own, as web keeps the two apart.
 * - **No "Join code" row.** Canvas draws `Join code · TN7-4KQ` under CHAPTER ·
 *   ADMIN. There is no `join_code` anywhere on chapters; joining runs through
 *   invites, whose rows carry an opaque, single-use, role-scoped, expiring
 *   token (`apps/api/src/domain/entities/invite.entity.ts`). Rendering one of
 *   those as a stable "join code" would tell members something false about
 *   how it behaves.
 * - **No Appearance row.** The app is dark-only (`lib/theme.tsx`) and Canvas
 *   drew Appearance as a value, a row that looked like a setting and wasn't
 *   one; #6032 dropped it, as web has none.
 * - **"Blocked members" is here and is not drawn.** `spec/behavior/chat/README.md`
 *   § Block makes a Settings list the one durable place a block is undone
 *   (#2257), and App Store Guideline 1.2 is why the control exists at all.
 *   It sits under the chapter's group, since the block list is the active
 *   chapter's, as a row that opens a sheet.
 * - **About is phone only.** What's new, Support the Chapter and the legal
 *   links: web keeps What's new in the account menu and the legal pages on
 *   the website.
 */
export default function PreferencesScreen() {
  const { page } = useLocalSearchParams<{ page?: string }>();
  switch (page) {
    case "notifications":
      return <NotificationsSettingsPage />;
    case "chat":
      return <ChatSettingsPage />;
    case "apps":
      return <LinkedAppsSettingsPage />;
    case "ai":
      return <AiSettingsPage />;
    case "account":
      return <AccountSettingsPage />;
    default:
      return <SettingsHome />;
  }
}

/** A row's push to one of Settings' pages. */
type SettingsPageValue = "notifications" | "chat" | "apps" | "ai" | "account";

function SettingsHome() {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const glyphColor = tokens.color.text.mutedForeground;
  const whatsNewQuiet = useWhatsNewQuiet();
  const { email } = useAuthSession();
  const [linkFailed, setLinkFailed] = useState<string | null>(null);
  const [pushState] = usePushState();
  const pushReason = pushUnavailableReason();
  const chatDensity = useChatDensity();
  const frappAi = useFrappAiChoice();
  // A council has no calendar or Discord link (#5933): those routes refuse it.
  const chapterFeatures = useServesChapterFeatures();
  const blockedMembersSheetRef = useRef<BottomSheetModal>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Search settings (2026-11-19), and the row a `setting` param lights. A
  // match on a page opens that page, lit (`openSetting`).
  const { setting } = useLocalSearchParams<{ setting?: string }>();
  const jump = useSettingJumpState(setting);
  const search = useSettingsSearchField({
    here: "/preferences",
    jumpHere: jump.jump,
  });
  // Settings is the durable place a block is undone (#2257). The count is
  // only stated off a confirmed read: "None" from a failed one would claim
  // nobody is blocked.
  const blockList = useBlockedUserIds();
  const blockedMembersValue =
    blockList.status !== "ready"
      ? "—"
      : blockList.ids.size === 0
        ? "None"
        : String(blockList.ids.size);
  const permissions = usePermissionList();
  const chapterQuery = useCurrentChapter();
  const donationUrl = chapterQuery.data?.donation_url;
  const showDonationCta = shouldShowDonationCta(permissions, donationUrl);

  // Notifications says "Off" only while push is off on this phone, the one
  // state worth seeing from here; anything else shows no value.
  const notificationsValue =
    !pushReason && pushState && !pushIsOn(pushState) ? "Off" : null;
  const aiValue = frappAi.consent
    ? frappAi.consent.answer === "yes"
      ? "On"
      : "Off"
    : null;

  function open(page: SettingsPageValue) {
    router.push({ pathname: "/preferences", params: { page } });
  }

  /**
   * Shared by every external-link row below (donation + legal). Clearing
   * `linkFailed` up front, not just setting it on rejection, matters because
   * the footnote is a single shared slot: without the clear, a failed donation
   * open followed by a successful Terms tap would leave "Support the Chapter
   * couldn't be opened" showing indefinitely.
   */
  function openExternalLink(label: string, url: string) {
    setLinkFailed(null);
    // A rejection here is real (iOS rejects a second presentation while one
    // is already showing), so it is surfaced rather than left unhandled.
    WebBrowser.openBrowserAsync(url).catch(() => setLinkFailed(label));
  }

  return (
    <ScreenShell
      back={BACK_TO_YOU}
      title="Settings"
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
            <SectionHeader>
              {personalSettingsGroupLabel("account")}
            </SectionHeader>
            <ListSection>
              <ListRow
                label={personalSettingsPageLabel("notifications")}
                leading={<BellGlyph color={glyphColor} />}
                value={notificationsValue}
                accessibilityHint="Push, quiet hours, and which chapter notifications you get."
                onPress={() => open("notifications")}
              />
              <ListRow
                label={personalSettingsPageLabel("chat")}
                leading={<MessageSquareGlyph color={glyphColor} />}
                value={chatDensityLabel(chatDensity)}
                accessibilityHint="Chat density and read receipts."
                onPress={() => open("chat")}
              />
              {chapterFeatures ? (
                <ListRow
                  label={personalSettingsPageLabel("apps")}
                  leading={<Link2Glyph color={glyphColor} />}
                  accessibilityHint="Google Calendar, calendar apps and Discord."
                  onPress={() => open("apps")}
                />
              ) : null}
              {/* Only where the server has AI (`AI_ENABLED`): with it off the
                  row, like every AI entry, isn't drawn. */}
              {frappAi.consent ? (
                <ListRow
                  label={personalSettingsPageLabel("ai")}
                  leading={<SparklesGlyph color={glyphColor} />}
                  value={aiValue}
                  onPress={() => open("ai")}
                />
              ) : null}
              <ListRow
                label={personalSettingsPageLabel("account")}
                leading={<CircleUserRoundGlyph color={glyphColor} />}
                value={email}
                accessibilityHint="How you sign in, sign out, and delete your account."
                onPress={() => open("account")}
              />
            </ListSection>

            <SectionHeader>
              {personalSettingsGroupLabel("chapter", chapterQuery.data?.name)}
            </SectionHeader>
            <ListSection>
              <SettingAnchor id="blocked">
                <ListRow
                  label={personalSettingsPageLabel("blocked")}
                  leading={<UserXGlyph color={glyphColor} />}
                  value={blockedMembersValue}
                  accessibilityHint="Shows the members you've blocked in chat, and lets you unblock them."
                  onPress={() => blockedMembersSheetRef.current?.present()}
                />
              </SettingAnchor>
            </ListSection>

            <SectionHeader>{PERSONAL_SETTINGS_COPY.about}</SectionHeader>
            <ListSection>
              <ListRow
                label="What's new"
                leading={<NewspaperGlyph color={glyphColor} />}
                accessibilityHint="Shows the latest changes to the app."
                trailing={
                  whatsNewQuiet ? <View style={styles.unreadDot} /> : undefined
                }
                accessibilityValue={whatsNewQuiet ? "New" : undefined}
                onPress={() => router.push("/whats-new")}
              />
              {showDonationCta ? (
                <ListRow
                  label="Support the Chapter"
                  leading={<HeartHandshakeGlyph color={glyphColor} />}
                  accessibilityHint="Opens the chapter's donation page in your browser."
                  onPress={() =>
                    openExternalLink("Support the Chapter", donationUrl)
                  }
                />
              ) : null}
              {LEGAL_LINKS.map((link) => (
                <ListRow
                  key={link.url}
                  label={link.label}
                  leading={legalGlyph(link.url, glyphColor)}
                  accessibilityHint="Opens in your browser."
                  onPress={() => openExternalLink(link.label, link.url)}
                />
              ))}
            </ListSection>
            {linkFailed ? (
              <Text style={styles.footnoteError}>
                {linkFailed} couldn&apos;t be opened. Try again in a moment.
              </Text>
            ) : null}
          </>
        )}
      </SettingJumpProvider>
      <BlockedMembersSheet ref={blockedMembersSheetRef} />
    </ScreenShell>
  );
}

/** Each legal page's glyph, by its address: Terms, Privacy, FERPA. */
function legalGlyph(url: string, color: string) {
  if (url.endsWith("/privacy")) return <ShieldGlyph color={color} />;
  if (url.endsWith("/ferpa")) return <GraduationCapGlyph color={color} />;
  return <ScrollTextGlyph color={color} />;
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    footnoteError: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
      paddingHorizontal: tokens.spacing.xs,
    },
    unreadDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: tokens.color.text.foreground,
    },
  });
}
