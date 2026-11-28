import { useUpdateChapter } from "@repo/hooks";
import {
  CHAPTER_TAB_COPY,
  chapterProfileFieldBody,
  type ChapterProfileFields,
} from "@repo/hooks/chapter-tab";
import {
  CHAPTER_NAME_MAX_LENGTH,
  CHAPTER_UNIVERSITY_MAX_LENGTH,
} from "@repo/validation";
import { FormFields, FormHint } from "@/components/settings/chapter-form";
import { SavedTextField } from "@/components/settings/saved-text-field";
import { SettingAnchor } from "@/components/settings/setting-anchor";
import { saveSetting } from "@/lib/settings/chapter-tab";

/**
 * The chapter's profile on top of Chapter settings (#6027): Chapter name,
 * University and Donation link, as web's Chapter tab opens (Paul,
 * 2026-11-20: a page leads with the few fields a member types into, then its
 * groups of rows, as Discord's channel settings and iOS Settings do).
 *
 * Each field saves on its own on Done or leaving it, with a quiet "Saved"
 * (#6033), sending only that field, trimmed (`chapterProfileFieldBody`,
 * web's rule), through `PATCH /v1/chapters/current`. A blank name or
 * university puts the saved one back; so does a blank donation link, which
 * the API has no way to clear.
 *
 * A viewer without `CHAPTER_PROFILE_PERMISSIONS` reads the three values in
 * place, muted, with the line web's page shows under them.
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
  const update = useUpdateChapter();
  if (!stored) return null;

  const save = (field: keyof ChapterProfileFields) => (next: string) => {
    const body = chapterProfileFieldBody(stored, field, next);
    if (Object.keys(body).length === 0) return Promise.resolve(true as const);
    return saveSetting(
      () => update.mutateAsync(body),
      "Couldn't save the chapter profile. Try again.",
    );
  };

  return (
    <FormFields>
      <SettingAnchor id="chapter-name">
        <SavedTextField
          label="Chapter name"
          draftKey="chapter-name"
          value={stored.name}
          editable={canEdit}
          maxLength={CHAPTER_NAME_MAX_LENGTH}
          autoCapitalize="words"
          onSave={save("name")}
        />
      </SettingAnchor>
      <SettingAnchor id="university">
        <SavedTextField
          label="University"
          draftKey="chapter-university"
          value={stored.university}
          editable={canEdit}
          maxLength={CHAPTER_UNIVERSITY_MAX_LENGTH}
          autoCapitalize="words"
          onSave={save("university")}
        />
      </SettingAnchor>
      <SettingAnchor id="donation-link">
        <SavedTextField
          label="Donation link (optional)"
          draftKey="chapter-donation"
          value={stored.donation_url}
          editable={canEdit}
          placeholder="https://give.youruniversity.edu/..."
          keyboardType="url"
          autoCapitalize="none"
          onSave={save("donation_url")}
        />
      </SettingAnchor>
      {canEdit ? null : <FormHint>{CHAPTER_TAB_COPY.readOnly}</FormHint>}
    </FormFields>
  );
}
