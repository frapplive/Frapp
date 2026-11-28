import { useRef } from "react";
import type { ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  CHAPTER_TAB_COPY,
  CHAPTER_VOCABULARY_FIELDS,
  chapterVocabularyDraftOf,
  chapterVocabularyFieldPatch,
} from "@repo/hooks/chapter-tab";
import { BACK_TO_CHAPTER_SETTINGS } from "@/components/back-row";
import { ScreenShell } from "@/components/screen-shell";
import { FormFields, FormHint } from "@/components/settings/chapter-form";
import { ChapterPageState } from "@/components/settings/chapter-page-state";
import { SavedTextField } from "@/components/settings/saved-text-field";
import {
  SettingAnchor,
  SettingJumpProvider,
  useSettingJumpState,
} from "@/components/settings/setting-anchor";
import { saveSetting, useChapterTab } from "@/lib/settings/chapter-tab";

/**
 * Chapter settings → Vocabulary on the phone (#6027), web's page in its order
 * and words (`CHAPTER_VOCABULARY_FIELDS`): Recruitment process, New member
 * term, Cohort label, Member order number, Role tier. Each field's
 * placeholder is the organization type's word, which a blank field falls back
 * to. Each word saves on its own on Done or leaving the field (#6033), a
 * cleared one as empty (`chapterVocabularyFieldPatch`, #3939), through the
 * audited config PATCH (`chapter-config:manage`).
 */
export function ChapterVocabularyPage() {
  const scrollRef = useRef<ScrollView>(null);
  const { setting } = useLocalSearchParams<{ setting?: string }>();
  const jump = useSettingJumpState(setting);
  const tab = useChapterTab();
  const { archetype, vocabulary, canManage } = tab;
  const stored = chapterVocabularyDraftOf(vocabulary);

  return (
    <ScreenShell
      back={BACK_TO_CHAPTER_SETTINGS}
      title="Vocabulary"
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
              {CHAPTER_VOCABULARY_FIELDS.map((field) => (
                <SettingAnchor key={field.key} id={`vocab-${field.key}`}>
                  <SavedTextField
                    label={field.label}
                    draftKey={`chapter-vocab-${field.key}`}
                    value={stored[field.key]}
                    editable={canManage}
                    placeholder={field.placeholder(archetype)}
                    autoCapitalize="words"
                    allowBlank
                    onSave={(next) =>
                      saveSetting(
                        () =>
                          tab.patchConfig.mutateAsync(
                            chapterVocabularyFieldPatch(field.key, next),
                          ),
                        "Couldn't save the vocabulary. Try again.",
                      )
                    }
                  />
                </SettingAnchor>
              ))}
              <FormHint>
                {canManage
                  ? CHAPTER_TAB_COPY.vocabularyHint(archetype)
                  : `${CHAPTER_TAB_COPY.vocabularyHint(archetype)} ${CHAPTER_TAB_COPY.readOnly}`}
              </FormHint>
            </FormFields>
          ) : null}
        </ChapterPageState>
      </SettingJumpProvider>
    </ScreenShell>
  );
}
