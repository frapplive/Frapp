import { useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useAiChapterSettings,
  useFrappAiChoice,
  usePermissionList,
} from "@repo/hooks";
import { SignetTokens } from "@repo/theme/signet";
import {
  AI_SETTINGS_COPY,
  FRAPP_AI_COPY,
  aiSwitchesInEffect,
  personalSettingsPageLabel,
} from "@repo/validation";
import { MeetFrappAiSheet } from "@/components/ai/meet-frapp-ai";
import { ListRow, ListSection } from "@/components/list-section";
import { SettingAnchor } from "@/components/settings/setting-anchor";
import { SettingsPageShell } from "@/components/settings/personal/settings-page-shell";
import { Toggle } from "@/components/toggle";
import { chapterSettingsAccess } from "@/lib/more/chapter-settings";
import { PRIVACY_LINK } from "@/lib/more/legal";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * Settings → Frapp Intelligence (#6032; an AI section on the one Settings
 * page until then, Paul 2026-11-17): the member's own switch, and for a
 * member who can open Chapter settings, the Chapter AI row that opens the
 * president's switches there. Web's Settings → Frapp Intelligence holds the
 * same rows and footnote.
 *
 * No row names an AI company: they are named on Meet Frapp Intelligence,
 * which turning it on opens, and in the privacy policy, which the footnote
 * links. Settings' first page shows the row only where the server has AI.
 */
export function AiSettingsPage() {
  const router = useRouter();
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  // On opens Meet Frapp Intelligence, whose Continue is the yes (#4790); off
  // is immediate.
  const meetAiSheetRef = useRef<BottomSheetModal>(null);
  const frappAi = useFrappAiChoice();
  const [aiOffFailed, setAiOffFailed] = useState(false);
  // The footnote's privacy link reports a failed open under itself.
  const [aiPrivacyFailed, setAiPrivacyFailed] = useState(false);
  // The Chapter AI row: for a member who sees Chapter settings' AI switches
  // (`chapter-config:view`, as web's AI tab), and only where the server has
  // AI. Its value counts the features working, so Include channel messages
  // left on under an Ask that is off doesn't count.
  const permissions = usePermissionList();
  const showChapterAi =
    !!frappAi.consent && chapterSettingsAccess(permissions).chapter;
  const chapterAi = useAiChapterSettings({ enabled: showChapterAi });

  return (
    <SettingsPageShell title={personalSettingsPageLabel("ai")}>
      {frappAi.consent ? (
        <SettingAnchor id="ai">
          <ListSection>
            <ListRow
              label={FRAPP_AI_COPY.settingsSwitch}
              description={FRAPP_AI_COPY.settingsCaption}
              trailing={
                <Toggle
                  value={frappAi.consent.answer === "yes"}
                  disabled={frappAi.pending}
                  onValueChange={(next) => {
                    setAiOffFailed(false);
                    if (next) {
                      meetAiSheetRef.current?.present();
                      return;
                    }
                    frappAi.notNow().catch(() => setAiOffFailed(true));
                  }}
                  accessibilityLabel={FRAPP_AI_COPY.settingsSwitch}
                />
              }
            />
            {showChapterAi && chapterAi.data ? (
              <ListRow
                label={AI_SETTINGS_COPY.chapterRow}
                value={AI_SETTINGS_COPY.chapterRowValue(
                  aiSwitchesInEffect(chapterAi.data),
                )}
                accessibilityHint="Opens Chapter settings, where the president turns the chapter's AI features on or off."
                onPress={() => router.push("/chapter-settings")}
              />
            ) : null}
          </ListSection>
          {aiOffFailed ? (
            <Text style={styles.footnoteError}>
              {FRAPP_AI_COPY.turnOffFailed}. Try again.
            </Text>
          ) : null}
          <Text style={styles.footnote}>
            {FRAPP_AI_COPY.settingsFootnote}{" "}
            <Text
              style={styles.footnoteLink}
              accessibilityRole="link"
              onPress={() => {
                setAiPrivacyFailed(false);
                WebBrowser.openBrowserAsync(PRIVACY_LINK.url).catch(() =>
                  setAiPrivacyFailed(true),
                );
              }}
            >
              {FRAPP_AI_COPY.privacyLink}
            </Text>
            .
          </Text>
          {aiPrivacyFailed ? (
            <Text style={styles.footnoteError}>
              {PRIVACY_LINK.label} couldn&apos;t be opened. Try again in a
              moment.
            </Text>
          ) : null}
        </SettingAnchor>
      ) : null}
      {frappAi.consent ? <MeetFrappAiSheet ref={meetAiSheetRef} /> : null}
    </SettingsPageShell>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    // The tone `ListSection`'s own footnote takes, so a line under a group
    // reads the same as the group's footnote beside it.
    footnote: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
      paddingHorizontal: tokens.spacing.xs,
    },
    footnoteLink: {
      color: tokens.color.text.foreground,
      textDecorationLine: "underline",
    },
    footnoteError: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
      paddingHorizontal: tokens.spacing.xs,
    },
  });
}
