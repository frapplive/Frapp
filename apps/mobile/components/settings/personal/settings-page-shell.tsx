import { useRef, type ReactNode } from "react";
import type { ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenShell } from "@/components/screen-shell";
import { BACK_TO_SETTINGS } from "@/components/back-row";
import {
  SettingJumpProvider,
  useSettingJumpState,
} from "@/components/settings/setting-anchor";

/**
 * A page Settings' first page pushes (#6032): the screen frame with its way
 * back to Settings, the page's title, and the row a search result's
 * `setting` param lights. The pages are `/preferences?page=…`, each its own
 * stack entry, so the platform's swipe and the back row both return to the
 * first page, as iOS Settings and Discord's channel settings go back.
 */
export function SettingsPageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const { setting } = useLocalSearchParams<{ setting?: string }>();
  const jump = useSettingJumpState(setting);
  return (
    <ScreenShell
      back={BACK_TO_SETTINGS}
      title={title}
      scrollRef={scrollRef}
      keyboardShouldPersistTaps="handled"
    >
      <SettingJumpProvider
        anchor={jump.anchor}
        serial={jump.serial}
        scrollRef={scrollRef}
      >
        {children}
      </SettingJumpProvider>
    </ScreenShell>
  );
}
