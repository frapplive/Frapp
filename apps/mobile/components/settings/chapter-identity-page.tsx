import { useRef } from "react";
import type { ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  CHAPTER_TAB_COPY,
  chapterIdentityDraftOf,
  chapterIdentityFieldDiff,
  foundedYearProblem,
  type ChapterIdentityDraft,
} from "@repo/hooks/chapter-tab";
import { BACK_TO_CHAPTER_SETTINGS } from "@/components/back-row";
import { ScreenShell } from "@/components/screen-shell";
import { FormFields, FormHint } from "@/components/settings/chapter-form";
import { SavedTextField } from "@/components/settings/saved-text-field";
import {
  SettingAnchor,
  SettingJumpProvider,
  useSettingJumpState,
} from "@/components/settings/setting-anchor";
import { ChapterPageState } from "@/components/settings/chapter-page-state";
import { saveSetting, useChapterTab } from "@/lib/settings/chapter-tab";

/**
 * Chapter settings → Identity & founding on the phone (#6027), web's page of
 * the same name in its order and words: Greek letters, Chapter designation,
 * School (short), Founded year. Each saves on its own on Done or leaving the
 * field (#6033), through the audited config PATCH (`chapter-config:manage`);
 * a cleared field is sent as empty, so the clear reaches the server
 * (`chapterIdentityFieldDiff`).
 *
 * FIJI never shows its letters, so the field isn't drawn there; its stored
 * value is left as it is. The founded year follows the chapter wizards' rule
 * and can't be removed once saved (`foundedYearProblem`): what's wrong shows
 * under it once the officer leaves it, and nothing is sent until it's a year.
 */
export function ChapterIdentityPage() {
  const scrollRef = useRef<ScrollView>(null);
  const { setting } = useLocalSearchParams<{ setting?: string }>();
  const jump = useSettingJumpState(setting);
  const tab = useChapterTab();
  const { branding, lettersHidden, canManage } = tab;
  const stored = chapterIdentityDraftOf(branding);

  const save = (field: keyof ChapterIdentityDraft) => (next: string) =>
    saveSetting(
      () =>
        tab.patchConfig.mutateAsync({
          branding: chapterIdentityFieldDiff(branding, field, next),
        }),
      "Couldn't save the identity. Try again.",
    );

  return (
    <ScreenShell
      back={BACK_TO_CHAPTER_SETTINGS}
      title="Identity & founding"
      scrollRef={scrollRef}
      keyboardShouldPersistTaps="handled"
      avoidKeyboard
    >
      <SettingJumpProvider
        anchor={jump.anchor}
        serial={jump.serial}
        scrollRef={scrollRef}
      >
        <ChapterPageState query={tab.orgConfig}>
          {tab.orgConfig.data ? (
            <FormFields>
              {lettersHidden ? null : (
                <SettingAnchor id="greek-letters">
                  <SavedTextField
                    label="Greek letters"
                    draftKey="chapter-greek-letters"
                    value={stored.greekLetters}
                    editable={canManage}
                    maxLength={8}
                    placeholder="e.g. ΣΦΕ"
                    autoCapitalize="characters"
                    mono
                    allowBlank
                    onSave={save("greekLetters")}
                  />
                </SettingAnchor>
              )}
              <SettingAnchor id="designation">
                <SavedTextField
                  label="Chapter designation"
                  draftKey="chapter-designation"
                  value={stored.designation}
                  editable={canManage}
                  placeholder="e.g. California Eta"
                  autoCapitalize="words"
                  allowBlank
                  onSave={save("designation")}
                />
              </SettingAnchor>
              <SettingAnchor id="school-short">
                <SavedTextField
                  label="School (short)"
                  draftKey="chapter-school-short"
                  value={stored.schoolShort}
                  editable={canManage}
                  placeholder="e.g. UCLA"
                  autoCapitalize="characters"
                  allowBlank
                  onSave={save("schoolShort")}
                />
              </SettingAnchor>
              <SettingAnchor id="founded-year">
                <SavedTextField
                  label="Founded year"
                  draftKey="chapter-founded-year"
                  value={stored.foundedYear}
                  editable={canManage}
                  placeholder="e.g. 1901"
                  keyboardType="number-pad"
                  maxLength={4}
                  allowBlank
                  validate={(next) =>
                    foundedYearProblem(next, branding.founded_at)
                  }
                  onSave={save("foundedYear")}
                />
              </SettingAnchor>
              <FormHint>
                {canManage
                  ? CHAPTER_TAB_COPY.identityHint(lettersHidden)
                  : `${CHAPTER_TAB_COPY.identityHint(lettersHidden)} ${CHAPTER_TAB_COPY.readOnly}`}
              </FormHint>
            </FormFields>
          ) : null}
        </ChapterPageState>
      </SettingJumpProvider>
    </ScreenShell>
  );
}
