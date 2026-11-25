import { useUpdateChapter } from "@repo/hooks";
import {
  CHAPTER_TAB_COPY,
  chapterProfileChanged,
  chapterProfileSaveBody,
  type ChapterProfileFields,
} from "@repo/hooks/chapter-tab";
import {
  CHAPTER_NAME_MAX_LENGTH,
  CHAPTER_UNIVERSITY_MAX_LENGTH,
} from "@repo/validation";
import {
  ChapterTextField,
  FormCommitRow,
  FormFields,
  useFormSaveStatus,
} from "@/components/settings/chapter-form";
import { SettingAnchor } from "@/components/settings/setting-anchor";
import { useChapterFormDraft } from "@/lib/settings/chapter-tab";

/**
 * The chapter's profile on top of Chapter settings (#6027): Chapter name,
 * University and Donation link, then Save profile, as web's Chapter tab opens
 * (Paul, 2026-11-20: a page leads with the few fields a member types into,
 * then its groups of rows, as Discord's channel settings and iOS Settings
 * do). Save waits for an edit, and sends only what changed, trimmed
 * (`chapterProfileSaveBody`, web's rule), through `PATCH /v1/chapters/current`.
 *
 * A viewer without `CHAPTER_PROFILE_PERMISSIONS` reads the three values in
 * place, muted, with the line web's form shows under it.
 *
 * Draws nothing until the chapter is read, so a field never opens empty and
 * fills under the officer's thumb.
 */
export function ChapterProfileForm({
  stored,
  canEdit,
}: {
  stored: ChapterProfileFields | undefined;
  canEdit: boolean;
}) {
  const { draft, setDraft, reset, save, saving } = useChapterFormDraft(
    "chapter-profile",
    stored,
  );
  const update = useUpdateChapter();
  const status = useFormSaveStatus();
  if (!stored || !draft) return null;

  const edit = (field: keyof ChapterProfileFields) => (text: string) => {
    status.clear();
    setDraft({ ...draft, [field]: text });
  };
  const editable = canEdit && !saving;

  const submit = async () => {
    const body = chapterProfileSaveBody(stored, draft);
    if (Object.keys(body).length === 0) {
      // Only spaces changed: nothing to send, and nothing left to keep.
      reset();
      status.saved();
      return;
    }
    const result = await save(() => update.mutateAsync(body));
    if (result.ok) status.saved();
    else
      status.failed(
        result.error,
        "Couldn't save the chapter profile. Try again.",
      );
  };

  return (
    <FormFields>
      <SettingAnchor id="chapter-name">
        <ChapterTextField
          label="Chapter name"
          value={draft.name}
          onChangeText={edit("name")}
          editable={editable}
          maxLength={CHAPTER_NAME_MAX_LENGTH}
          autoCapitalize="words"
        />
      </SettingAnchor>
      <SettingAnchor id="university">
        <ChapterTextField
          label="University"
          value={draft.university}
          onChangeText={edit("university")}
          editable={editable}
          maxLength={CHAPTER_UNIVERSITY_MAX_LENGTH}
          autoCapitalize="words"
        />
      </SettingAnchor>
      <SettingAnchor id="donation-link">
        <ChapterTextField
          label="Donation link (optional)"
          value={draft.donation_url}
          onChangeText={edit("donation_url")}
          editable={editable}
          placeholder="https://give.youruniversity.edu/..."
          keyboardType="url"
          autoCapitalize="none"
        />
      </SettingAnchor>
      <FormCommitRow
        label="Save profile"
        canSave={canEdit}
        readOnlyLine={CHAPTER_TAB_COPY.readOnly}
        disabled={!chapterProfileChanged(stored, draft)}
        busy={saving}
        status={status.status}
        onPress={() => void submit()}
      />
    </FormFields>
  );
}
