"use client";

import { useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ChapterLogoUpload } from "@repo/hooks";
import {
  CHAPTER_TAB_COPY,
  chapterLettersHidden,
  chapterMarkBrandingDiff,
} from "@repo/hooks/chapter-tab";
import {
  CHAPTER_SHORT_NAME_MAX_LENGTH,
  acceptAttribute,
  greekLettersShown,
  resolveChapterMark,
  type PatchChapterConfig,
} from "@repo/validation";
import { Button } from "@/components/ui/button";
import { ProfileSection } from "@/components/profile/profile-section";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SettingsTextField } from "@/components/settings/settings-name-field";
import { CrestTile } from "@/components/layout/crest-tile";
import { inspectLogoFile } from "@/lib/chapter-logo";

type ChapterMarkBrandingDraft = {
  short_name?: string;
  greek_letters?: string;
  show_greek_letters?: boolean;
};

type Props = {
  /** Chapter name, for the initials the mark falls back to. */
  name: string;
  /** Signed `logo_url` from `GET /v1/chapters/current`, or null. */
  logoUrl: string | null;
  branding: ChapterMarkBrandingDraft;
  /**
   * `CHAPTER_PROFILE_PERMISSIONS`: the logo routes guard on it, like the
   * profile PATCH (#2575).
   */
  canEditLogo: boolean;
  /** `chapter-config:manage`: the short name and opt-out go through the config PATCH. */
  canManage: boolean;
  onUploadLogo: (upload: ChapterLogoUpload) => Promise<void>;
  onRemoveLogo: () => Promise<void>;
  logoPending?: boolean;
  /** The audited config PATCH; resolves whether it landed (a failure toasts). */
  onPatchConfig: (diff: PatchChapterConfig) => Promise<boolean>;
  /** The permission line the tab shows under a form the caller can't save. */
  manageHint: React.ReactNode;
  profileHint: React.ReactNode;
};

/**
 * Settings → Chapter → Chapter mark (#2876, #2591): what stands for the
 * chapter in the nav's chapter tile and on mobile Chat home's title row.
 *
 * Two writes with two gates, because they are two routes. The logo uploads
 * the moment a file is chosen (mint, PUT, confirm; `useUploadChapterLogo`),
 * gated like the profile PATCH. The short name (on Enter or leaving the
 * field) and the Greek-letters switch (when flipped) each save on their own
 * through the audited config PATCH (#6033), gated on `chapter-config:manage`
 * like the identity page. Greek letters themselves stay in that
 * card: they are identity data a chapter may keep while not showing them.
 *
 * The preview is the nav's own tile, fed what is being typed, so what an
 * officer sees here is what every member's nav will show once it saves.
 */
export function SettingsChapterMarkCard({
  name,
  logoUrl,
  branding,
  canEditLogo,
  canManage,
  onUploadLogo,
  onRemoveLogo,
  logoPending,
  onPatchConfig,
  manageHint,
  profileHint,
}: Props) {
  // An organization that never displays its letters (FIJI) gets no switch:
  // its letters stay off, and the next save writes that down even for a
  // chapter created before the profile turned them off.
  const lettersHidden = chapterLettersHidden(name);
  const storedShortName = branding.short_name ?? "";
  const storedShowLetters = greekLettersShown(branding);
  // What the short name field holds right now, for the preview.
  const [typedShortName, setTypedShortName] = useState(storedShortName);
  const [lettersSaving, setLettersSaving] = useState(false);

  const mark = resolveChapterMark({
    logoUrl,
    branding: {
      short_name: typedShortName,
      greek_letters: branding.greek_letters,
      show_greek_letters: storedShowLetters && !lettersHidden,
    },
    name,
  });

  // The switch always goes with a save; the short name only to keep or
  // clear one (`chapterMarkBrandingDiff`). Each save passes the other as
  // stored.
  const saveMark = (shortName: string, showLetters: boolean) =>
    onPatchConfig({
      branding: chapterMarkBrandingDiff({
        shortName,
        showLetters,
        lettersHidden,
        stored: branding,
      }),
    });

  async function flipLetters(next: boolean) {
    setLettersSaving(true);
    await saveMark(storedShortName, next);
    setLettersSaving(false);
  }

  return (
    <ProfileSection
      id="settings-chapter-mark"
      title="Chapter mark"
      hint={CHAPTER_TAB_COPY.markHint(lettersHidden)}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <CrestTile mark={mark} />
          <span className="text-sm font-bold text-foreground">{name}</span>
        </div>

        <ChapterLogoField
          logoUrl={logoUrl}
          canEditLogo={canEditLogo}
          onUploadLogo={onUploadLogo}
          onRemoveLogo={onRemoveLogo}
          logoPending={logoPending}
          hint={profileHint}
        />

        <div className="space-y-4 border-t border-border pt-4">
          <SettingsTextField
            id="chapter-short-name"
            label="Short name"
            value={storedShortName}
            maxLength={CHAPTER_SHORT_NAME_MAX_LENGTH}
            placeholder="FIJI"
            className="md:max-w-xs"
            allowBlank
            disabled={!canManage}
            onTextChange={setTypedShortName}
            onSave={(next) => saveMark(next, storedShowLetters)}
          />
          {lettersHidden ? null : (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="chapter-show-letters" className="font-normal">
                Show Greek letters
                <span className="block text-xs text-muted-foreground">
                  {CHAPTER_TAB_COPY.showLettersLine}
                </span>
              </Label>
              <Switch
                id="chapter-show-letters"
                checked={storedShowLetters}
                onCheckedChange={(next) => void flipLetters(next)}
                disabled={!canManage || lettersSaving}
              />
            </div>
          )}
          {manageHint}
        </div>
      </div>
    </ProfileSection>
  );
}

/**
 * The logo's control: Upload (or Replace) and Remove, uploading the moment a
 * file is chosen. Its own component so a council's settings, which have a
 * logo and no short name or letters (#5933), draw the same one.
 */
export function ChapterLogoField({
  logoUrl,
  canEditLogo,
  onUploadLogo,
  onRemoveLogo,
  logoPending,
  hint,
  showLabel = true,
}: {
  logoUrl: string | null;
  canEditLogo: boolean;
  onUploadLogo: (upload: ChapterLogoUpload) => Promise<void>;
  onRemoveLogo: () => Promise<void>;
  logoPending?: boolean;
  /** The permission line under it for a caller who can't change it. */
  hint?: React.ReactNode;
  /** Off where a section label above already says "Logo". */
  showLabel?: boolean;
}) {
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const logoErrorId = useId();
  const inputId = useId();

  async function pickLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file again still fires a change.
    event.target.value = "";
    if (!file) return;
    const inspected = inspectLogoFile(file);
    if (!inspected.ok) {
      setLogoError(inspected.message);
      return;
    }
    setLogoError(null);
    await onUploadLogo(inspected.upload);
  }

  const logoDisabled = !canEditLogo || logoPending;

  return (
    <div className="space-y-2">
      {showLabel ? <Label htmlFor={inputId}>Logo</Label> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          id={inputId}
          aria-label={showLabel ? undefined : "Logo"}
          type="file"
          accept={acceptAttribute("image")}
          className="sr-only"
          disabled={logoDisabled}
          aria-describedby={logoError ? logoErrorId : undefined}
          onChange={(event) => void pickLogo(event)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={logoDisabled}
          onClick={() => fileInput.current?.click()}
        >
          {logoPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          {logoUrl ? "Replace logo" : "Upload logo"}
        </Button>
        {logoUrl ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={logoDisabled}
            onClick={() => {
              setLogoError(null);
              void onRemoveLogo();
            }}
          >
            Remove logo
          </Button>
        ) : null}
      </div>
      {logoError ? (
        <p id={logoErrorId} className="text-xs text-destructive">
          {logoError}
        </p>
      ) : null}
      {hint}
    </div>
  );
}
