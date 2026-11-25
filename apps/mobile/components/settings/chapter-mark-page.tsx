import { useRef, useState } from "react";
import { StyleSheet, Text, View, type ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { SignetTokens } from "@repo/theme/signet";
import {
  useConfirmChapterLogo,
  useRemoveChapterLogo,
  useRequestChapterLogoUploadUrl,
} from "@repo/hooks";
import {
  CHAPTER_TAB_COPY,
  chapterMarkBrandingDiff,
  chapterMarkChanged,
  chapterMarkDraftOf,
} from "@repo/hooks/chapter-tab";
import { errorCopy } from "@repo/hooks/error-copy";
import {
  CHAPTER_SHORT_NAME_MAX_LENGTH,
  resolveChapterMark,
} from "@repo/validation";
import { BACK_TO_CHAPTER_SETTINGS } from "@/components/back-row";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { ChapterMarkTile } from "@/components/onboarding/chapter-mark-tile";
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
import { Toggle } from "@/components/toggle";
import { useChapterBranding } from "@/lib/chapter-branding";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import { pickAndSetChapterLogo } from "@/lib/onboarding/chapter-wizard/chapter-logo";
import { ChapterPageState } from "@/components/settings/chapter-page-state";
import { useChapterFormDraft, useChapterTab } from "@/lib/settings/chapter-tab";
import { typeRole, useFrappTheme } from "@/lib/theme";

const PREVIEW_SIZE = 56;

/**
 * Chapter settings → Chapter mark on the phone (#6027): what stands for the
 * chapter on Chat home's title and in web's nav, as web's Chapter mark page
 * (`settings-chapter-mark-card.tsx`) sets it, in its order and words.
 *
 * - The preview: the tile, fed the draft, beside the chapter's name.
 * - **Logo**, from the photo library, square-cropped, uploaded the moment it
 *   is picked (the chapter setup's flow, `pickAndSetChapterLogo`), and
 *   Remove logo. The logo routes take `CHAPTER_PROFILE_PERMISSIONS`.
 * - **Short name** and **Show Greek letters**, saved together by Save mark
 *   through the audited config PATCH (`chapter-config:manage`). An
 *   organization that never shows its letters (FIJI) gets no switch, and the
 *   save writes them off.
 *
 * A viewer who can't change a part reads its value, and the line says an
 * officer sets it.
 */
export function ChapterMarkPage() {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens);
  const scrollRef = useRef<ScrollView>(null);
  const { setting } = useLocalSearchParams<{ setting?: string }>();
  const jump = useSettingJumpState(setting);
  const tab = useChapterTab();
  const { branding, lettersHidden, name, logoUrl, canManage } = tab;
  const stored = tab.orgConfig.data ? chapterMarkDraftOf(branding) : undefined;
  const { draft, setDraft, save, saving } = useChapterFormDraft(
    "chapter-mark",
    stored,
  );
  const status = useFormSaveStatus();

  const requestLogoUrl = useRequestChapterLogoUploadUrl();
  const confirmLogo = useConfirmChapterLogo();
  const removeLogo = useRemoveChapterLogo();
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoNote, setLogoNote] = useState<string | null>(null);

  const shown = draft ?? chapterMarkDraftOf(branding);
  const mark = resolveChapterMark({
    logoUrl,
    branding: {
      short_name: shown.shortName,
      greek_letters: branding.greek_letters,
      show_greek_letters: shown.showLetters && !lettersHidden,
    },
    name,
  });

  async function pickLogo() {
    if (logoBusy) return;
    setLogoBusy(true);
    setLogoNote(null);
    const result = await pickAndSetChapterLogo({
      requestUploadUrl: requestLogoUrl.mutateAsync,
      confirm: confirmLogo.mutateAsync,
    });
    setLogoBusy(false);
    if (result.status === "refused") setLogoNote(result.reason);
  }

  async function dropLogo() {
    const yes = await confirmAlert({
      title: "Remove the logo?",
      body: lettersHidden
        ? "The mark falls back to the short name for everyone."
        : "The mark falls back to the short name or Greek letters for everyone.",
      confirmLabel: "Remove logo",
      destructive: true,
    });
    if (!yes) return;
    setLogoNote(null);
    removeLogo.mutate(undefined, {
      onError: (error) =>
        setLogoNote(errorCopy(error, "Couldn't remove the logo. Try again.")),
    });
  }

  const saveMark = async () => {
    if (!draft) return;
    const diff = chapterMarkBrandingDiff({
      shortName: draft.shortName,
      showLetters: draft.showLetters,
      lettersHidden,
      stored: branding,
    });
    const result = await save(() =>
      tab.patchConfig.mutateAsync({ branding: diff }),
    );
    if (result.ok) status.saved();
    else status.failed(result.error, "Couldn't save the mark. Try again.");
  };

  const logoWorking = logoBusy || removeLogo.isPending;

  return (
    <ScreenShell
      back={BACK_TO_CHAPTER_SETTINGS}
      title="Chapter mark"
      scrollRef={scrollRef}
      keyboardShouldPersistTaps="handled"
      avoidKeyboard
      footer={
        draft ? (
          <FormCommitRow
            label="Save mark"
            canSave={canManage}
            readOnlyLine={CHAPTER_TAB_COPY.readOnly}
            disabled={!chapterMarkChanged(draft, branding)}
            busy={saving}
            status={status.status}
            onPress={() => void saveMark()}
          />
        ) : undefined
      }
    >
      <SettingJumpProvider
        anchor={jump.anchor}
        serial={jump.serial}
        scrollRef={scrollRef}
      >
        <View style={styles.preview}>
          <ChapterMarkTile
            testID="chapter-mark-preview"
            logoUrl={mark.logoUrl}
            text={mark.text}
            accent={accent}
            size={PREVIEW_SIZE}
          />
          <Text style={styles.previewName} numberOfLines={2}>
            {name}
          </Text>
        </View>
        <FormHint>{CHAPTER_TAB_COPY.markHint(lettersHidden)}</FormHint>

        <SectionHeader>Logo</SectionHeader>
        <SettingAnchor id="logo">
          {tab.canEditProfile ? (
            <ListSection>
              <ListRow
                label={logoUrl ? "Replace logo" : "Upload logo"}
                description={logoNote}
                descriptionTone={logoNote ? "destructive" : "default"}
                accessibilityHint="Opens your photos to pick the chapter's logo."
                busy={logoBusy}
                disabled={removeLogo.isPending}
                onPress={() => void pickLogo()}
              />
              {logoUrl ? (
                <ListRow
                  label="Remove logo"
                  destructive
                  action
                  busy={removeLogo.isPending}
                  disabled={logoWorking && !removeLogo.isPending}
                  onPress={() => void dropLogo()}
                />
              ) : null}
            </ListSection>
          ) : (
            <ListSection>
              <ListRow
                label="Logo"
                value={logoUrl ? "Added" : "None"}
                description={CHAPTER_TAB_COPY.rowReadOnly}
              />
            </ListSection>
          )}
        </SettingAnchor>

        <ChapterPageState query={tab.orgConfig}>
          {draft ? (
            <FormFields>
              <SettingAnchor id="short-name">
                <ChapterTextField
                  label="Short name"
                  value={draft.shortName}
                  onChangeText={(text) => {
                    status.clear();
                    setDraft({ ...draft, shortName: text });
                  }}
                  editable={canManage && !saving}
                  maxLength={CHAPTER_SHORT_NAME_MAX_LENGTH}
                  placeholder="FIJI"
                />
              </SettingAnchor>
              {lettersHidden ? null : (
                <ListSection>
                  <ListRow
                    label="Show Greek letters"
                    description={CHAPTER_TAB_COPY.showLettersLine}
                    trailing={
                      <Toggle
                        value={draft.showLetters}
                        disabled={!canManage || saving}
                        accessibilityLabel="Show Greek letters"
                        onValueChange={(next) => {
                          status.clear();
                          setDraft({ ...draft, showLetters: next });
                        }}
                      />
                    }
                  />
                </ListSection>
              )}
            </FormFields>
          ) : null}
        </ChapterPageState>
      </SettingJumpProvider>
    </ScreenShell>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    preview: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      paddingHorizontal: tokens.spacing.xs,
    },
    previewName: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
      flex: 1,
    },
  });
}
