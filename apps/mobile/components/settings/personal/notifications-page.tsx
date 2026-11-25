import { useRef } from "react";
import { Linking, StyleSheet, Text } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useActivityNudgeSettings,
  useChapterChatLevel,
  useCurrentChapter,
  usePermissionList,
  useSetActivityNudgesEnabled,
  useSetChapterChatLevel,
} from "@repo/hooks";
import { SignetTokens } from "@repo/theme/signet";
import {
  PERSONAL_SETTINGS_COPY,
  chapterAlertsFootnote,
  chatChapterLevelLabel,
  personalSettingsGroupLabel,
  personalSettingsPageLabel,
  shownNotificationCategories,
} from "@repo/validation";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { ChatLevelSheet } from "@/components/settings/chat-level-sheet";
import { QuietHoursSection } from "@/components/settings/quiet-hours-section";
import { SettingAnchor } from "@/components/settings/setting-anchor";
import { SettingsPageShell } from "@/components/settings/personal/settings-page-shell";
import { Toggle } from "@/components/toggle";
import {
  COUNCIL_NOTIFICATION_CATEGORIES,
  useIsCouncil,
  useServesChapterFeatures,
} from "@/lib/tenant-kind";
import { acceptPrimer } from "@/lib/notifications/primer";
import {
  PUSH_PROMPT_ANSWERED_EVENT,
  pushPromptAnsweredProperties,
} from "@/lib/notifications/push-analytics";
import { pushUnavailableReason } from "@/lib/notifications/push";
import {
  pushIsOn,
  pushTapAsks,
  readPushState,
  type PushState,
} from "@/lib/notifications/push-state";
import { usePushState } from "@/lib/notifications/use-push-state";
import { typeRole, useFrappTheme } from "@/lib/theme";
import { useLatestTrack } from "@/lib/use-latest-track";
import {
  deviceTimeZone,
  useNotificationPreferencesSync,
} from "@/lib/use-notification-preferences-sync";

/**
 * Settings → Notifications (#6032): everything that notifies the member, on
 * one page, as web's Settings → Notifications draws it. Push, then quiet
 * hours, then the chapter's chat level and a switch per alert type under the
 * chapter's name, then the Activity card's nudges. Slack keeps the level and
 * the schedule on one Notifications page the same way; iOS puts an app's
 * allow switch on top of its notification page.
 *
 * - **Push** is a switch that reports the device's settings: on only when
 *   the OS will show a push (`pushIsOn()`). A tap asks the OS while a prompt
 *   can still help (the tap is the member accepting, so `patterns.md`'s "OS
 *   prompt only after the member accepts" holds) and otherwise opens the OS
 *   settings: an app cannot revoke its own permission, and iOS never
 *   re-prompts once asked. A line under it says so whenever a tap opens the
 *   OS settings (`pushRowCaption()`). In a build that can't push it stays a
 *   status row that states why (`pushUnavailableReason()`). Web has no row:
 *   a browser asks for its own.
 * - **Quiet hours** is server-enforced logic with a shipped client: one
 *   switch while off, and time rows with native pickers only while on
 *   (`QuietHoursSection` says why).
 * - **No Chat switch.** Chat is tuned per channel and per DM, from the
 *   conversation itself, so a switch that silenced every message at once was
 *   dropped (owner's iOS testing, 2026-11-06). The catalog's docblock in
 *   `@repo/validation` says why in full.
 * - **The alert types carry their one-line descriptions**, as web's do. They
 *   were dropped on the phone while every setting sat on one screen, where
 *   five two-line hints pushed Account three screens down; on its own page
 *   they cost nothing, and "Points" says it covers fines.
 * - **`announcements` is not a switch.** Its one emitter sends every
 *   announcement push URGENT, and URGENT skips the category preference
 *   (#1041), so the switch would suppress nothing; it ships once routine
 *   announcements can be told apart from emergency ones (#1323). The
 *   group's footnote says they always arrive.
 * - **"Mandatory events only" is still not built.** It has no backing field
 *   on `events` and no preference key.
 * - **Nudges on Activity** is phone only: web's Activity has no nudge card
 *   (`PHONE_ONLY` in its editor).
 */
export function NotificationsSettingsPage() {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const [pushState, setPushState] = usePushState();
  const pushReason = pushUnavailableReason();
  // Read after the OS prompt closes (`useLatestTrack`).
  const track = useLatestTrack();
  // One tap at a time: a second tap while the OS prompt is up would queue a
  // second prompt, or open the settings app over it.
  const pushTapInFlight = useRef(false);

  // A council has no Activity card and only the "someone joins" alert of the
  // chapter's (#5933): those routes refuse it.
  const council = useIsCouncil();
  const chapterFeatures = useServesChapterFeatures();
  const nudgeSettings = useActivityNudgeSettings({ enabled: chapterFeatures });
  const setNudgesEnabled = useSetActivityNudgesEnabled();
  // The chapter-wide chat level (#3840). Unknown until read, so the row
  // states no level rather than claiming "All messages" before it knows.
  const chatLevel = useChapterChatLevel();
  const setChatLevel = useSetChapterChatLevel();
  const chatLevelSheetRef = useRef<BottomSheetModal>(null);
  const permissions = usePermissionList();
  const chapterName = useCurrentChapter().data?.name;

  /**
   * The push switch's one action, for every state. It re-reads the
   * permission first rather than trusting the last read, because the answer
   * can change outside the app (the OS settings, or a prompt answered
   * elsewhere).
   *
   * - Not granted, and the OS will still ask (`pushTapAsks()`): ask, through
   *   the primer's own accept (`acceptPrimer()`), so the decision is recorded
   *   first and onboarding's step and the chat home's reminder aren't offered
   *   afterwards with a "Turn on" the OS would now ignore.
   * - On: the OS settings, since an app cannot revoke its own permission.
   * - Off, and no prompt can help: the OS settings, the only place left.
   *   That is iOS after one answer, Android after a second "Don't allow",
   *   Android 13+ with the permission granted but the app's notifications
   *   blocked, and Android with the app's channel switched off.
   */
  async function handlePushTap() {
    if (pushTapInFlight.current) return;
    pushTapInFlight.current = true;
    try {
      const current = await readPushState().catch(() => null);
      if (current && pushTapAsks(current)) {
        // A prompt the OS failed to show reads as not granted; the re-read
        // below reports whatever is true either way.
        const granted = await acceptPrimer();
        track(
          PUSH_PROMPT_ANSWERED_EVENT,
          pushPromptAnsweredProperties(
            granted ? "allowed" : "denied",
            "settings",
          ),
        );
        setPushState(await readPushState().catch(() => null));
        return;
      }
      if (current) setPushState(current);
      await Linking.openSettings().catch(() => undefined);
    } finally {
      pushTapInFlight.current = false;
    }
  }

  const {
    quietHoursEnabled,
    setQuietHoursEnabled,
    categories,
    setCategory,
    categoriesEditable,
    quietHoursWindow,
    setQuietHoursWindow,
    isHydrated,
    hydrationRecovered,
    persistenceFailed,
    isAuthenticated,
    chapterId,
    quietHoursSync,
    categorySync,
    storedZoneMissing,
  } = useNotificationPreferencesSync();

  // `null` when there is nothing to report. "Synced with your account." was
  // shown in the steady state, which is the one state that needs no line.
  const notificationsMeta = !isHydrated
    ? "Loading your saved preferences…"
    : hydrationRecovered
      ? "Saved preferences were unreadable and have been reset to defaults."
      : !isAuthenticated
        ? "Saved on this device only. Sign in to change the settings on your account."
        : !chapterId
          ? "Category switches turn on once your chapter is confirmed."
          : categorySync === "retry" || quietHoursSync === "retry"
            ? "Couldn't reach the server. Change a setting again to retry."
            : categorySync === "pending" || quietHoursSync === "pending"
              ? "Saving…"
              : categorySync === "loading" || quietHoursSync === "loading"
                ? "Loading your preferences…"
                : null;

  return (
    <SettingsPageShell title={personalSettingsPageLabel("notifications")}>
      <SettingAnchor id="push">
        <ListSection>
          {pushReason ? (
            // A build that can't push: nothing here or in the OS settings can
            // change that, so the row states why and does nothing on a tap.
            <ListRow
              label="Push notifications"
              value="Unavailable"
              description={pushReason}
            />
          ) : pushState ? (
            <ListRow
              label="Push notifications"
              description={pushRowCaption(pushState)}
              trailing={
                <Toggle
                  value={pushIsOn(pushState)}
                  onValueChange={() => void handlePushTap()}
                  accessibilityLabel={pushToggleLabel(pushState)}
                />
              }
            />
          ) : (
            // Unread, or the read failed. No switch: drawing it off would tell
            // a member who has granted push that they haven't. A tap still
            // re-reads and acts on the answer.
            <ListRow
              label="Push notifications"
              value="—"
              accessibilityHint="Turns notifications on, or opens your phone's settings for them."
              onPress={() => void handlePushTap()}
            />
          )}
        </ListSection>
      </SettingAnchor>

      <SettingAnchor id="quiet-hours">
        <SectionHeader>{PERSONAL_SETTINGS_COPY.quietHours}</SectionHeader>
        <QuietHoursSection
          enabled={quietHoursEnabled}
          onEnabledChange={setQuietHoursEnabled}
          quietHoursWindow={quietHoursWindow}
          onWindowChange={setQuietHoursWindow}
          deviceTimeZone={deviceTimeZone()}
          storedZoneMissing={storedZoneMissing}
          windowEditable={quietHoursSync !== "loading"}
          footnote={PERSONAL_SETTINGS_COPY.quietHoursFootnote}
        />
      </SettingAnchor>

      <SettingAnchor id="chapter-alerts">
        <SectionHeader>
          {personalSettingsGroupLabel("chapter", chapterName)}
        </SectionHeader>
        <ListSection footnote={chapterAlertsFootnote()}>
          <SettingAnchor id="chat-messages">
            <ListRow
              label="Chat messages"
              value={
                chatLevel.data ? chatChapterLevelLabel(chatLevel.data) : "—"
              }
              accessibilityHint="Choose whether every message or only mentions and DMs notify you."
              disabled={!chatLevel.data}
              busy={setChatLevel.isPending}
              onPress={() => chatLevelSheetRef.current?.present()}
            />
          </SettingAnchor>
          {shownNotificationCategories(permissions)
            .filter(
              (category) =>
                !council || COUNCIL_NOTIFICATION_CATEGORIES.has(category.key),
            )
            .map((category) => (
              <ListRow
                key={category.key}
                label={category.label}
                description={category.description}
                trailing={
                  <Toggle
                    value={categories[category.key]}
                    onValueChange={(value) => setCategory(category.key, value)}
                    disabled={!categoriesEditable}
                    accessibilityLabel={category.label}
                  />
                }
              />
            ))}
        </ListSection>
        {setChatLevel.isError ? (
          <Text style={styles.footnoteError}>
            Couldn&apos;t change chat messages. Try again.
          </Text>
        ) : null}
        {notificationsMeta ? (
          <Text style={styles.footnote}>{notificationsMeta}</Text>
        ) : null}
        {persistenceFailed ? (
          <Text style={styles.footnoteError}>
            This device couldn&apos;t save a local copy, so these may not show
            while you&apos;re offline. Your account is unaffected.
          </Text>
        ) : null}
      </SettingAnchor>

      {/* The card at the top of Activity (#5464): offered to everyone, because
          the card shows with or without AI; the card's own More turns it off,
          and only here turns it back on. */}
      {nudgeSettings.data ? (
        <SettingAnchor id="nudges">
          <SectionHeader>{PERSONAL_SETTINGS_COPY.activity}</SectionHeader>
          <ListSection>
            <ListRow
              label="Nudges on Activity"
              description="The card at the top of Activity, about what is waiting on you."
              trailing={
                <Toggle
                  value={nudgeSettings.data.enabled}
                  onValueChange={(value) => setNudgesEnabled.mutate(value)}
                  accessibilityLabel="Nudges on Activity"
                />
              }
            />
          </ListSection>
        </SettingAnchor>
      ) : null}

      <ChatLevelSheet
        ref={chatLevelSheetRef}
        level={chatLevel.data}
        onPick={(level) => setChatLevel.mutate(level)}
      />
    </SettingsPageShell>
  );
}

/**
 * What a tap does when it isn't the switch flipping: on, and off once no
 * prompt can help, it opens the phone's settings to turn push off or on.
 * `null` while a tap asks the OS, which the switch moving already shows.
 */
function pushSettingsAction(push: PushState): "Turn off" | "Turn on" | null {
  if (pushIsOn(push)) return "Turn off";
  return pushTapAsks(push) ? null : "Turn on";
}

/**
 * The push row's one line, drawn whenever a tap leaves the app for the OS
 * settings. Nothing else on screen says so: the row is a plain switch, so a
 * member who taps it to turn push off would otherwise see it snap back and
 * the Settings app open with no reason given.
 */
function pushRowCaption(push: PushState): string | null {
  const action = pushSettingsAction(push);
  return action ? `${action} in your phone's settings.` : null;
}

/** The push switch's accessible name: the label, then the same hand-off. */
function pushToggleLabel(push: PushState): string {
  const action = pushSettingsAction(push);
  return action
    ? `Push notifications, ${action.toLowerCase()} in your phone's settings`
    : "Push notifications";
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    footnote: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
      paddingHorizontal: tokens.spacing.xs,
    },
    footnoteError: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
      paddingHorizontal: tokens.spacing.xs,
    },
  });
}
