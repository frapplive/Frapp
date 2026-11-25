import { useRef } from "react";
import { StyleSheet, Text } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { READ_RECEIPTS_COPY, useReadReceiptsSetting } from "@repo/hooks";
import { chatDensityLabel } from "@repo/chat-core/density";
import { SignetTokens } from "@repo/theme/signet";
import {
  PERSONAL_SETTINGS_COPY,
  personalSettingsPageLabel,
} from "@repo/validation";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { ChatDensitySheet } from "@/components/settings/chat-density-sheet";
import { SettingAnchor } from "@/components/settings/setting-anchor";
import { SettingsPageShell } from "@/components/settings/personal/settings-page-shell";
import { Toggle } from "@/components/toggle";
import { useChatDensity } from "@/lib/chat/chat-density";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * Settings → Chat (#6032): how the thread draws on this phone, and read
 * receipts on direct messages, as web's Settings → Chat. Density is one row a
 * tap from its sheet, which draws every density so the choice is made by
 * looking (`components.md` §11 § Density, #2252); web sets the same three
 * previews side by side, having the width.
 */
export function ChatSettingsPage() {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const chatDensitySheetRef = useRef<BottomSheetModal>(null);
  const chatDensity = useChatDensity();
  const readReceipts = useReadReceiptsSetting();

  return (
    <SettingsPageShell title={personalSettingsPageLabel("chat")}>
      <SettingAnchor id="chat-density">
        <SectionHeader>{PERSONAL_SETTINGS_COPY.density}</SectionHeader>
        <ListSection footnote="Applies on this phone.">
          <ListRow
            label="Chat density"
            value={chatDensityLabel(chatDensity)}
            accessibilityHint="Choose how tightly messages are drawn in chat."
            onPress={() => chatDensitySheetRef.current?.present()}
          />
        </ListSection>
      </SettingAnchor>

      {/* Read receipts (#5519): two-way, as WhatsApp's switch is. Drawn once
          settings have answered, so it never shows on and then flips off for
          a member who turned it off. */}
      {readReceipts.ready ? (
        <SettingAnchor id="read-receipts">
          <SectionHeader>{PERSONAL_SETTINGS_COPY.directMessages}</SectionHeader>
          <ListSection>
            <ListRow
              label={READ_RECEIPTS_COPY.label}
              description={READ_RECEIPTS_COPY.description}
              trailing={
                <Toggle
                  value={readReceipts.enabled}
                  disabled={readReceipts.pending}
                  onValueChange={readReceipts.setEnabled}
                  accessibilityLabel={READ_RECEIPTS_COPY.label}
                />
              }
            />
          </ListSection>
          {readReceipts.failed ? (
            <Text style={styles.footnoteError}>
              {READ_RECEIPTS_COPY.saveFailed}
            </Text>
          ) : null}
        </SettingAnchor>
      ) : null}

      <ChatDensitySheet ref={chatDensitySheetRef} />
    </SettingsPageShell>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    footnoteError: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
      paddingHorizontal: tokens.spacing.xs,
    },
  });
}
