import { useRef } from "react";
import type { ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  CHAPTER_TAB_COPY,
  CHAPTER_VOCABULARY_FIELDS,
  chapterVocabularyChanged,
  chapterVocabularyDraftOf,
  chapterVocabularyPatch,
  type ChapterVocabularyDraft,
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
import { ChapterPageState } from "@/components/settings/chapter-page-state";
import {
  SettingAnchor,
  SettingJumpProvider,
  useSettingJumpState,
} from "@/components/settings/setting-anchor";
import { useChapterFormDraft, useChapterTab } from "@/lib/settings/chapter-tab";

/**
 * Chapter settings → Vocabulary on the phone (#6027), web's page in its order
 * and words (`CHAPTER_VOCABULARY_FIELDS`): Recruitment process, New member
 * term, Cohort label, Member order number, Role tier. Each field's
 * placeholder is the organization type's word, which a blank field falls back
 * to; Save vocabulary sends every word, a cleared one as empty
 * (`chapterVocabularyPatch`, #3939), through the audited config PATCH
 * (`chapter-config:manage`).
 */
export function ChapterVocabularyPage() {
  const scrollRef = useRef<ScrollView>(null);
  const { setting } = useLocalSearchParams<{ setting?: string }>();
  const jump = useSettingJumpState(setting);
  const tab = useChapterTab();
  const { archetype, vocabulary, canManage } = tab;
  const stored = tab.orgConfig.data
    ? chapterVocabularyDraftOf(vocabulary)
    : undefined;
  const { draft, setDraft, save, saving } =
    useChapterFormDraft<ChapterVocabularyDraft>("chapter-vocabulary", stored);
  const status = useFormSaveStatus();

  const submit = async () => {
    if (!draft) return;
    const patch = chapterVocabularyPatch(draft);
    const result = await save(() => tab.patchConfig.mutateAsync(patch));
    if (result.ok) status.saved();
    else
      status.failed(result.error, "Couldn't save the vocabulary. Try again.");
  };

  return (
    <ScreenShell
      back={BACK_TO_CHAPTER_SETTINGS}
      title="Vocabulary"
      scrollRef={scrollRef}
      keyboardShouldPersistTaps="handled"
      avoidKeyboard
      footer={
        draft ? (
          <FormCommitRow
            label="Save vocabulary"
            canSave={canManage}
            readOnlyLine={CHAPTER_TAB_COPY.readOnly}
            disabled={!chapterVocabularyChanged(draft, vocabulary)}
            busy={saving}
            status={status.status}
            onPress={() => void submit()}
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
              {CHAPTER_VOCABULARY_FIELDS.map((field) => (
                <SettingAnchor key={field.key} id={`vocab-${field.key}`}>
                  <ChapterTextField
                    label={field.label}
                    value={draft[field.key]}
                    onChangeText={(text) => {
                      status.clear();
                      setDraft({ ...draft, [field.key]: text });
                    }}
                    editable={canManage && !saving}
                    placeholder={field.placeholder(archetype)}
                    autoCapitalize="words"
                  />
                </SettingAnchor>
              ))}
              <FormHint>{CHAPTER_TAB_COPY.vocabularyHint(archetype)}</FormHint>
            </FormFields>
          ) : null}
        </ChapterPageState>
      </SettingJumpProvider>
    </ScreenShell>
  );
}
