import { useState } from "react";
import {
  useAiChapterSettings,
  useAiConsent,
  useUpdateAiChapterSettings,
} from "@repo/hooks";
import {
  AI_SETTINGS_COPY,
  AI_SWITCHES,
  aiSwitchState,
  formatAiAnswerDate,
  type AiChapterSwitchKey,
} from "@repo/validation";
import { BACK_TO_CHAPTER_SETTINGS } from "@/components/back-row";
import { InlineNote } from "@/components/inline-note";
import { ListRow, ListSection } from "@/components/list-section";
import { ScreenShell } from "@/components/screen-shell";
import { ChapterPageState } from "@/components/settings/chapter-page-state";
import { Toggle } from "@/components/toggle";
import { useChapterTab } from "@/lib/settings/chapter-tab";

/**
 * Chapter settings → AI on the phone (#6028): the president's switch for each
 * AI feature family, word for word web's AI page (`settings-ai-tab.tsx`), as
 * a pushed screen. It was a group in the middle of Chapter settings, so a
 * member who tapped "Chapter AI" in their own Settings had to scroll to what
 * they tapped for; that row and Chapter settings' AI row both open this now.
 * iOS Settings puts an assistant's feature switches on a page of their own,
 * each one line, with what they share in the group's footer.
 *
 * Every member who reaches it reads the switches; only the president changes
 * them (`can_change`; the PATCH checks again and records each change in
 * Logs). Include channel messages sits nested under Questions and requests
 * and waits for it to be on before it can be turned on, never off
 * (`aiSwitchState`, shared with web). The phone has no toast, so a failed
 * save is that row's red second line, and the switch snaps back.
 *
 * Diagnostics stays web-only (Paul, 2026-11-27): one beta chapter, a
 * president's recorded yes, nothing a member acts on from the phone.
 */
export function ChapterAiPage() {
  const tab = useChapterTab();
  // Drawn only where the server has AI, for the people web's AI page opens
  // to (`chapter-config:view`), as Chapter settings' row is.
  const aiConsent = useAiConsent({ enabled: tab.access.chapter });
  const aiAvailable = tab.access.chapter && !!aiConsent.data;
  const settingsQuery = useAiChapterSettings({ enabled: aiAvailable });
  const settings = settingsQuery.data;
  const update = useUpdateAiChapterSettings();
  const [failedKey, setFailedKey] = useState<AiChapterSwitchKey | null>(null);

  const footnote = settings
    ? [
        settings.can_change ? null : AI_SETTINGS_COPY.presidentOnly,
        AI_SETTINGS_COPY.footnote,
        settings.updated_at
          ? AI_SETTINGS_COPY.lastChanged(
              formatAiAnswerDate(settings.updated_at),
            )
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    : null;

  return (
    <ScreenShell back={BACK_TO_CHAPTER_SETTINGS} title={AI_SETTINGS_COPY.title}>
      {aiConsent.data === null || !tab.access.chapter ? (
        // No AI on this server, or a viewer web's page doesn't open to: a
        // stale link lands here, never on switches that can't apply.
        <InlineNote>{AI_SETTINGS_COPY.unavailable}</InlineNote>
      ) : (
        <ChapterPageState query={settingsQuery}>
          {settings ? (
            <ListSection footnote={footnote}>
              {AI_SWITCHES.map((entry) => {
                const { checked, parentOff, waitsOnParent } = aiSwitchState(
                  entry,
                  settings,
                );
                const failed = failedKey === entry.key;
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
                          !settings.can_change ||
                          // One save at a time: each answer replaces the
                          // whole cached row, so two in flight could draw
                          // one wrong.
                          update.isPending ||
                          // Waiting on Ask blocks turning it on, never off.
                          waitsOnParent
                        }
                        onValueChange={(next) => {
                          setFailedKey(null);
                          update.mutate(
                            { [entry.key]: next },
                            { onError: () => setFailedKey(entry.key) },
                          );
                        }}
                        accessibilityLabel={entry.label}
                      />
                    }
                  />
                );
              })}
            </ListSection>
          ) : null}
        </ChapterPageState>
      )}
    </ScreenShell>
  );
}
