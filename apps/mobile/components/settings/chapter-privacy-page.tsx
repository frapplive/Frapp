import { useState } from "react";
import { PRIVACY_SETTINGS_COPY as COPY } from "@repo/validation";
import { BACK_TO_CHAPTER_SETTINGS } from "@/components/back-row";
import { ListRow, ListSection } from "@/components/list-section";
import { ScreenShell } from "@/components/screen-shell";
import { ChapterPageState } from "@/components/settings/chapter-page-state";
import { Toggle } from "@/components/toggle";
import { useChapterTab } from "@/lib/settings/chapter-tab";

/**
 * Chapter settings → Privacy on the phone (#6028; Paul, 2026-11-27: an exec
 * gets asked "do we track you?" in the room, not at a desk). One switch row
 * and one footnote, word for word web's Privacy page
 * (`PRIVACY_SETTINGS_COPY`).
 *
 * The switch is framed positively ("Chapter analytics" on), while the stored
 * column is `analytics_opt_out`, so on = `!analytics_opt_out`. It saves the
 * moment it flips, through the audited config PATCH (`chapter-config:manage`);
 * anyone else here reads it, and the footnote says their role can't change
 * it. The phone has no toast, so a failed save is the row's red line.
 */
export function ChapterPrivacyPage() {
  const tab = useChapterTab();
  const { canManage, orgConfig, patchConfig } = tab;
  const [failed, setFailed] = useState(false);
  const analyticsOn = orgConfig.data?.analytics_opt_out !== true;

  return (
    <ScreenShell back={BACK_TO_CHAPTER_SETTINGS} title={COPY.title}>
      <ChapterPageState query={orgConfig}>
        <ListSection
          footnote={
            canManage ? COPY.footnote : `${COPY.footnote} ${COPY.readOnly}`
          }
        >
          <ListRow
            label={COPY.label}
            description={failed ? `${COPY.saveFailed}. Try again.` : COPY.line}
            descriptionTone={failed ? "destructive" : "default"}
            trailing={
              <Toggle
                value={analyticsOn}
                disabled={!canManage || patchConfig.isPending}
                onValueChange={(next) => {
                  setFailed(false);
                  patchConfig
                    .mutateAsync({ analytics_opt_out: !next })
                    .catch(() => setFailed(true));
                }}
                accessibilityLabel={COPY.label}
              />
            }
          />
        </ListSection>
      </ChapterPageState>
    </ScreenShell>
  );
}
