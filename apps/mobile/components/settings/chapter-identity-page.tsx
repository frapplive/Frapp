import { useRef, useState } from "react";
import type { ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  FOUNDED_YEAR_MIN,
  latestFoundedYear,
} from "@repo/hooks/chapter-identity";
import {
  CHAPTER_TAB_COPY,
  chapterIdentityBrandingDiff,
  chapterIdentityChanged,
  chapterIdentityDraftOf,
  checkFoundedYear,
  type ChapterIdentityDraft,
} from "@repo/hooks/chapter-tab";
import { BACK_TO_CHAPTER_SETTINGS } from "@/components/back-row";
import { ScreenShell } from "@/components/screen-shell";
import {
  ChapterTextField,
  FormCommitRow,
  FormFields,
  FormHint,
  useFormSaveStatus,
} from "@/components/settings/chapter-form";
import {
  SettingAnchor,
  SettingJumpProvider,
  useSettingJumpState,
} from "@/components/settings/setting-anchor";
import { ChapterPageState } from "@/components/settings/chapter-page-state";
import { useChapterFormDraft, useChapterTab } from "@/lib/settings/chapter-tab";

/**
 * Chapter settings → Identity & founding on the phone (#6027), web's page of
 * the same name in its order and words: Greek letters, Chapter designation,
 * School (short), Founded year, then Save identity through the audited config
 * PATCH (`chapter-config:manage`). A cleared field is sent as empty, so the
 * clear reaches the server (`chapterIdentityBrandingDiff`).
 *
 * FIJI never shows its letters, so the field isn't drawn there; its stored
 * value is left as it is. The founded year follows the chapter wizards' rule
 * and can't be removed once saved (`checkFoundedYear`); its error waits for
 * the officer to leave the field or press Save (components.md § Text input,
 * "When an error shows").
 */
export function ChapterIdentityPage() {
  const scrollRef = useRef<ScrollView>(null);
  const { setting } = useLocalSearchParams<{ setting?: string }>();
  const jump = useSettingJumpState(setting);
  const tab = useChapterTab();
  const { branding, lettersHidden, canManage } = tab;
  const stored = tab.orgConfig.data
    ? chapterIdentityDraftOf(branding)
    : undefined;
  const { draft, setDraft, kept } = useChapterFormDraft<ChapterIdentityDraft>(
    "chapter-identity",
    stored,
  );
  const status = useFormSaveStatus();
  const [yearShown, setYearShown] = useState(false);
  const saving = tab.patchConfig.isPending;

  const founded = draft
    ? checkFoundedYear(draft.foundedYear, branding.founded_at)
    : null;
  const yearError =
    founded && !founded.valid && yearShown
      ? `${founded.cleared ? "A founded year can't be removed once saved. " : ""}Enter a year between ${FOUNDED_YEAR_MIN} and ${latestFoundedYear()}.`
      : null;

  const edit = (field: keyof ChapterIdentityDraft) => (text: string) => {
    if (!draft) return;
    status.clear();
    setDraft({ ...draft, [field]: text });
  };

  const save = () => {
    if (!draft || !founded) return;
    if (!founded.valid) {
      setYearShown(true);
      return;
    }
    kept.hold();
    tab.patchConfig.mutate(
      { branding: chapterIdentityBrandingDiff(draft, branding) },
      {
        onSuccess: () => {
          kept.drop();
          status.saved();
        },
        onError: (error) => {
          kept.release();
          status.failed(error, "Couldn't save the identity. Try again.");
        },
      },
    );
  };

  return (
    <ScreenShell
      back={BACK_TO_CHAPTER_SETTINGS}
      title="Identity & founding"
      scrollRef={scrollRef}
      keyboardShouldPersistTaps="handled"
      avoidKeyboard
      footer={
        draft ? (
          <FormCommitRow
            label="Save identity"
            canSave={canManage}
            readOnlyLine={CHAPTER_TAB_COPY.readOnly}
            disabled={!chapterIdentityChanged(draft, branding)}
            busy={saving}
            status={status.status}
            onPress={save}
          />
        ) : undefined
      }
    >
      <SettingJumpProvider
        anchor={jump.anchor}
        serial={jump.serial}
        scrollRef={scrollRef}
      >
        <ChapterPageState query={tab.orgConfig}>
          {draft ? (
            <FormFields>
              {lettersHidden ? null : (
                <SettingAnchor id="greek-letters">
                  <ChapterTextField
                    label="Greek letters"
                    value={draft.greekLetters}
                    onChangeText={edit("greekLetters")}
                    editable={canManage && !saving}
                    maxLength={8}
                    placeholder="e.g. ΣΦΕ"
                    autoCapitalize="characters"
                    mono
                  />
                </SettingAnchor>
              )}
              <SettingAnchor id="designation">
                <ChapterTextField
                  label="Chapter designation"
                  value={draft.designation}
                  onChangeText={edit("designation")}
                  editable={canManage && !saving}
                  placeholder="e.g. California Eta"
                  autoCapitalize="words"
                />
              </SettingAnchor>
              <SettingAnchor id="school-short">
                <ChapterTextField
                  label="School (short)"
                  value={draft.schoolShort}
                  onChangeText={edit("schoolShort")}
                  editable={canManage && !saving}
                  placeholder="e.g. UCLA"
                  autoCapitalize="characters"
                />
              </SettingAnchor>
              <SettingAnchor id="founded-year">
                <ChapterTextField
                  label="Founded year"
                  value={draft.foundedYear}
                  onChangeText={edit("foundedYear")}
                  onBlur={() => setYearShown(true)}
                  editable={canManage && !saving}
                  placeholder="e.g. 1901"
                  keyboardType="number-pad"
                  maxLength={4}
                  error={yearError}
                />
              </SettingAnchor>
              <FormHint>
                {CHAPTER_TAB_COPY.identityHint(lettersHidden)}
              </FormHint>
            </FormFields>
          ) : null}
        </ChapterPageState>
      </SettingJumpProvider>
    </ScreenShell>
  );
}
