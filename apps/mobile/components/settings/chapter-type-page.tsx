import { useState } from "react";
import { ARCHETYPES, type ArchetypeKey } from "@repo/org-archetypes";
import {
  CHAPTER_TAB_COPY,
  chapterArchetypeSwitchPatch,
} from "@repo/hooks/chapter-tab";
import { BACK_TO_CHAPTER_SETTINGS } from "@/components/back-row";
import { CheckGlyph } from "@/components/control-glyphs";
import { ListRow, ListSection } from "@/components/list-section";
import { ScreenShell } from "@/components/screen-shell";
import { FormHint } from "@/components/settings/chapter-form";
import { useChapterBranding } from "@/lib/chapter-branding";
import { errorCopy } from "@repo/hooks/error-copy";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import { useChapterTab } from "@/lib/settings/chapter-tab";
import { ChapterPageState } from "@/components/settings/chapter-page-state";

/**
 * Chapter settings → Organization type on the phone (#6027): the eight types
 * as web's page lists them, each with its line, the current one checked.
 * Picking another asks first, in web's words (`CHAPTER_TAB_COPY`), since it
 * resets the chapter's modules and vocabulary to that type's defaults
 * (`chapterArchetypeSwitchPatch`); roles and identity stay. Saved through the
 * audited config PATCH, `chapter-config:manage`.
 *
 * A pick from a short list is rows with a check, as iOS Settings' pickers
 * are; the line each carries says what the type is, which a sheet's one-line
 * option would cut.
 */
export function ChapterTypePage() {
  const { accent } = useChapterBranding();
  const tab = useChapterTab();
  const { archetype: current, canManage } = tab;
  // The type whose switch failed, and why: the reason takes that row's line.
  const [failed, setFailed] = useState<{
    key: ArchetypeKey;
    message: string;
  } | null>(null);
  const [switching, setSwitching] = useState<ArchetypeKey | null>(null);

  async function pick(key: ArchetypeKey) {
    if (key === current.key || tab.patchConfig.isPending) return;
    const next = ARCHETYPES[key];
    const yes = await confirmAlert({
      title: CHAPTER_TAB_COPY.typeConfirmTitle(next),
      body: CHAPTER_TAB_COPY.typeConfirmBody(next),
      confirmLabel: CHAPTER_TAB_COPY.typeConfirmAction,
    });
    if (!yes) return;
    setFailed(null);
    setSwitching(key);
    tab.patchConfig.mutate(chapterArchetypeSwitchPatch(key), {
      onSettled: () => setSwitching(null),
      onError: (error) =>
        setFailed({
          key,
          message: errorCopy(error, "Couldn't switch the type. Try again."),
        }),
    });
  }

  return (
    <ScreenShell back={BACK_TO_CHAPTER_SETTINGS} title="Organization type">
      <ChapterPageState query={tab.orgConfig}>
        <FormHint>{CHAPTER_TAB_COPY.typeHint(current)}</FormHint>
        <ListSection footnote={canManage ? null : CHAPTER_TAB_COPY.rowReadOnly}>
          {Object.values(ARCHETYPES).map((option) => {
            const isCurrent = option.key === current.key;
            const failure = failed?.key === option.key ? failed.message : null;
            return (
              <ListRow
                key={option.key}
                label={option.label}
                description={failure ?? option.description}
                descriptionTone={failure ? "destructive" : "default"}
                accessibilityValue={isCurrent ? "Current" : undefined}
                busy={switching === option.key}
                action
                trailing={isCurrent ? <CheckGlyph color={accent} /> : undefined}
                onPress={
                  canManage && !isCurrent
                    ? () => void pick(option.key)
                    : undefined
                }
              />
            );
          })}
        </ListSection>
      </ChapterPageState>
    </ScreenShell>
  );
}
