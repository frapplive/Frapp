"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Building2,
  Image as ImageIcon,
  Landmark,
  Loader2,
  Palette,
  Type,
} from "lucide-react";
import {
  ARCHETYPES,
  getArchetype,
  type ArchetypeKey,
} from "@repo/org-archetypes";
import {
  CHAPTER_ABOUT_FOOTNOTE,
  CHAPTER_LOOK_FOOTNOTE,
  CHAPTER_NAME_MAX_LENGTH,
  CHAPTER_UNIVERSITY_MAX_LENGTH,
  type PatchChapterConfig,
} from "@repo/validation";
import {
  CHAPTER_TAB_COPY,
  CHAPTER_VOCABULARY_FIELDS,
  chapterArchetypeSwitchPatch,
  chapterIdentityDraftOf,
  chapterIdentityFieldDiff,
  chapterIdentityValue,
  chapterLettersHidden,
  chapterMarkValue,
  chapterVocabularyDraftOf,
  chapterVocabularyFieldPatch,
  chapterVocabularyValue,
  foundedYearProblem,
  type ChapterIdentityDraft,
  type ChapterTabBranding,
} from "@repo/hooks/chapter-tab";
import { Button } from "@/components/ui/button";
import { ProfileSection } from "@/components/profile/profile-section";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/focus";
import type { ChapterLogoUpload } from "@repo/hooks";
import { SettingsChapterMarkCard } from "@/components/settings/settings-chapter-mark-card";
import { SettingsTextField } from "@/components/settings/settings-name-field";
import { SettingsSubpage } from "@/components/settings/settings-subpage";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import {
  chapterSettingsHref,
  type ChapterSettingsPage,
} from "@/components/settings/settings-paths";

/** Everything the Chapter mark card needs beyond the branding (#2876). */
type ChapterMarkProps = {
  logoUrl: string | null;
  onUploadLogo: (upload: ChapterLogoUpload) => Promise<void>;
  onRemoveLogo: () => Promise<void>;
  logoPending?: boolean;
};

type Props = {
  /** Current `org_archetype`; rendered through `getArchetype()` so an unknown
   * or in-flight value falls back to `ifc` instead of crashing. */
  archetypeKey: string;
  /** Merged vocabulary (archetype defaults + chapter overrides). */
  vocabulary: Record<string, string>;
  branding: ChapterTabBranding;
  profile: { name: string; university: string; donation_url: string };
  mark: ChapterMarkProps;
  /** Whether the caller holds `chapter-config:manage`. */
  canManage: boolean;
  /**
   * Whether the caller may save the chapter profile: the permissions
   * `PATCH /v1/chapters/current` guards on, `CHAPTER_PROFILE_PERMISSIONS`
   * (#2575).
   */
  canEditProfile: boolean;
  /**
   * Save one profile field (name, university or donation link), typed in
   * place (#6033). Resolves whether it landed; a failure toasts.
   */
  onSaveProfileField: (
    field: "name" | "university" | "donation_url",
    next: string,
  ) => Promise<boolean>;
  /**
   * Persist a config diff (branding / archetype / vocabulary) through PATCH.
   * `successTitle` toasts once it lands; a field that saves on its own
   * passes none and says "Saved" itself. Resolves whether it landed.
   */
  onPatchConfig: (
    diff: PatchChapterConfig,
    successTitle?: string,
  ) => Promise<boolean>;
  /** An organization type switch is on its way. */
  switchingType?: boolean;
  /**
   * The chapter's accent, opened from the Accent color row. Accent was its own
   * rail row until #3827 folded it into the chapter's profile, beside the
   * other thing that decides how the chapter looks.
   */
  accentSection?: ReactNode;
  /**
   * The page opened from one of the tab's rows (`?page=`), or `null` for the
   * tab itself: the profile's fields on top, then a few groups of rows that
   * each open one page, as Discord's channel settings and iOS Settings are
   * laid out (Paul, 2026-11-20).
   */
  page?: ChapterSettingsPage | null;
  /** The address of a page (or, for `null`, of the tab itself). */
  pageHref?: (page: ChapterSettingsPage | null) => string;
};

export function SettingsOrgTab({
  archetypeKey,
  vocabulary,
  branding,
  profile,
  mark,
  canManage,
  canEditProfile,
  onSaveProfileField,
  onPatchConfig,
  switchingType,
  accentSection,
  page = null,
  pageHref = chapterSettingsHref,
}: Props) {
  const current = getArchetype(archetypeKey);

  const [pendingArchetype, setPendingArchetype] = useState<ArchetypeKey | null>(
    null,
  );

  const { name: storedName } = profile;
  // FIJI's chapters never show their letters, also when the chapter's name
  // adds to the organization's ("Phi Gamma Delta Tau Nu").
  const lettersHidden = chapterLettersHidden(storedName);
  // Every field saves on its own (#6033), each read from what is stored, so
  // there is no draft here to re-seed or lose.
  const storedIdentity = chapterIdentityDraftOf(branding);
  const storedWords = chapterVocabularyDraftOf(vocabulary);

  const saveIdentityField =
    (field: keyof ChapterIdentityDraft) => (next: string) =>
      onPatchConfig({
        branding: chapterIdentityFieldDiff(branding, field, next),
      });

  function confirmArchetypeSwitch() {
    if (!pendingArchetype) return;
    // Modules and vocabulary reset to the new type's defaults; roles and
    // identity stay.
    void onPatchConfig(
      chapterArchetypeSwitchPatch(pendingArchetype),
      "Organization type switched",
    );
    setPendingArchetype(null);
  }

  // Says what the role can't do, never which permission key it lacks.
  const readOnlyHint = (
    <p className="text-xs text-muted-foreground">{CHAPTER_TAB_COPY.readOnly}</p>
  );
  const manageHint = canManage ? null : readOnlyHint;
  const profileHint = canEditProfile ? null : readOnlyHint;

  const identityValue = chapterIdentityValue(branding, storedName);
  // What the mark draws, read the way every surface reads it.
  const markValue = chapterMarkValue({
    logoUrl: mark.logoUrl,
    branding,
    name: storedName,
  });

  const subpage = (title: string, children: ReactNode, shown = true) => (
    <SettingsSubpage
      shown={shown}
      backHref={pageHref(null)}
      backLabel="Chapter"
      title={title}
    >
      {children}
    </SettingsSubpage>
  );

  // Back on the tab from one of its pages, focus returns to the row that
  // opened it, as it would on a page that never went away.
  const lastPage = useRef(page);
  useEffect(() => {
    const left = lastPage.current;
    lastPage.current = page;
    if (page || !left) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    document.getElementById(`chapter-row-${left}`)?.focus();
  }, [page]);

  let content: ReactNode;
  // The mark page stays mounted while hidden, so its preview keeps the short
  // name being typed there if the officer steps back and returns before
  // leaving the field (leaving it saves it).
  const markPage = (
    <div hidden={page !== "mark"}>
      {subpage(
        "Chapter mark",
        <SettingsChapterMarkCard
          name={profile.name}
          logoUrl={mark.logoUrl}
          branding={branding}
          canEditLogo={canEditProfile}
          canManage={canManage}
          onUploadLogo={mark.onUploadLogo}
          onRemoveLogo={mark.onRemoveLogo}
          logoPending={mark.logoPending}
          onPatchConfig={onPatchConfig}
          manageHint={manageHint}
          profileHint={profileHint}
        />,
        page === "mark",
      )}
    </div>
  );

  if (page === "mark") {
    content = null;
  } else if (page === "accent") {
    // The accent writes through the profile route, so its line is the
    // profile's: a viewer who can't change it is told why the swatches and
    // fields are greyed, as on every other Chapter page.
    content = subpage(
      "Accent color",
      <div className="space-y-3">
        {accentSection}
        {profileHint}
      </div>,
    );
  } else if (page === "identity") {
    content = subpage(
      "Identity & founding",
      <>
        <ProfileSection
          id="settings-identity"
          title="Identity & founding"
          hint={CHAPTER_TAB_COPY.identityHint(lettersHidden)}
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {/*
                FIJI never displays its letters, so Settings doesn't draw
                them either. They stay stored, untouched: each field saves
                only itself.
              */}
              {lettersHidden ? null : (
                <SettingsTextField
                  id="greek-letters"
                  label="Greek letters"
                  value={storedIdentity.greekLetters}
                  maxLength={8}
                  placeholder="e.g. ΣΦΕ"
                  inputClassName="font-mono"
                  allowBlank
                  disabled={!canManage}
                  onSave={saveIdentityField("greekLetters")}
                />
              )}
              <SettingsTextField
                id="designation"
                label="Chapter designation"
                value={storedIdentity.designation}
                placeholder="e.g. California Eta"
                allowBlank
                disabled={!canManage}
                onSave={saveIdentityField("designation")}
              />
              <SettingsTextField
                id="school-short"
                label="School (short)"
                value={storedIdentity.schoolShort}
                placeholder="e.g. UCLA"
                allowBlank
                disabled={!canManage}
                onSave={saveIdentityField("schoolShort")}
              />
              {/*
                The wizards' rule, and no clearing a stored year: what's
                wrong shows under the field once the officer leaves it or
                presses Enter, and nothing is sent until it's a year.
              */}
              <SettingsTextField
                id="founded-year"
                label="Founded year"
                value={storedIdentity.foundedYear}
                inputMode="numeric"
                maxLength={4}
                placeholder="e.g. 1901"
                allowBlank
                validate={(next) => foundedYearProblem(next, branding.founded_at)}
                disabled={!canManage}
                onSave={saveIdentityField("foundedYear")}
              />
            </div>
            {manageHint}
          </div>
        </ProfileSection>
      </>,
    );
  } else if (page === "type") {
    content = subpage(
      "Organization type",
      <>
        <ProfileSection
          id="settings-archetype"
          title={
            <>
              Organization archetype
              <span className="ml-2 rounded-xs border border-border px-1.5 py-0.5 text-caption font-medium uppercase tracking-wide text-muted-foreground">
                {current.short}
              </span>
            </>
          }
          hint={CHAPTER_TAB_COPY.typeHint(current)}
        >
          <div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.values(ARCHETYPES).map((option) => {
                const isCurrent = option.key === current.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    disabled={!canManage || isCurrent}
                    aria-pressed={isCurrent}
                    onClick={() => setPendingArchetype(option.key)}
                    /*
                    The other direction of the accent sweep. This selection is
                    accent-worthy — §5 names active filters, and a chosen
                    archetype is the same shape as `/documents`' selected
                    folder — but `bg-primary/5` was a raw opacity wash of the
                    chapter hex, which README §2 bans outright, and at 5% it
                    was invisible besides. Selected is `accent-4` plus
                    `accent-11` text, because a picked option is a control the
                    member switched on; hover is the neutral `--card-hover`
                    (`foundations.md` §6, 2026-11-05). `border-primary/40` on hover went with it — the
                    border swap is `FOCUS_RING`'s job, and using it for hover
                    too left focus and hover indistinguishable on a card.
                  */
                    className={cn(
                      "flex flex-col gap-1 rounded-md border p-3 text-left transition-colors",
                      FOCUS_RING,
                      isCurrent
                        ? "border-accent-border bg-accent-subtle-hover text-accent-text"
                        : "border-border hover:bg-card-hover",
                      !canManage &&
                        !isCurrent &&
                        "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {option.short}
                      </span>
                      {isCurrent ? (
                        // `accent-11` rather than `--primary`: the fill under it
                        // is `accent-4`, and §1's ladder puts the readable tone
                        // at 11. It also inherits from the button above, so this
                        // states the weight and lets the colour come from one
                        // place.
                        <span className="text-caption font-medium">
                          Current
                        </span>
                      ) : null}
                    </span>
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
            {manageHint ? <div className="mt-3">{manageHint}</div> : null}
          </div>
        </ProfileSection>
      </>,
    );
  } else if (page === "vocabulary") {
    content = subpage(
      "Vocabulary",
      <>
        <ProfileSection
          id="settings-vocabulary"
          title="Vocabulary"
          hint={CHAPTER_TAB_COPY.vocabularyHint(current)}
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {/*
                The tier word is what the chapter calls a tier of roles
                (#4068 decision 5): Roles reads it in its headings and buttons.
                A word cleared goes as "", and the type's word comes back.
              */}
              {CHAPTER_VOCABULARY_FIELDS.map((field) => (
                <SettingsTextField
                  key={field.key}
                  id={`vocab-${field.key}`}
                  label={field.label}
                  value={storedWords[field.key]}
                  placeholder={field.placeholder(current)}
                  allowBlank
                  disabled={!canManage}
                  onSave={(next) =>
                    onPatchConfig(
                      chapterVocabularyFieldPatch(field.key, next),
                    )
                  }
                />
              ))}
            </div>
            {manageHint}
          </div>
        </ProfileSection>
      </>,
    );
  } else {
    content = (
      <div className="space-y-8">
        <section id="settings-chapter-profile" aria-label="Chapter profile">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <SettingsTextField
                id="chapter-name"
                label="Chapter name"
                value={profile.name}
                maxLength={CHAPTER_NAME_MAX_LENGTH}
                disabled={!canEditProfile}
                onSave={(next) => onSaveProfileField("name", next)}
              />
              <SettingsTextField
                id="chapter-university"
                label="University"
                value={profile.university}
                maxLength={CHAPTER_UNIVERSITY_MAX_LENGTH}
                disabled={!canEditProfile}
                onSave={(next) => onSaveProfileField("university", next)}
              />
            </div>
            {/*
              A cleared link puts the saved one back: the API reads an empty
              link as an invalid URL and has no way to clear one
              (`chapterProfileSaveBody`).
            */}
            <SettingsTextField
              id="chapter-donation"
              label="Donation link (optional)"
              type="url"
              value={profile.donation_url}
              placeholder="https://give.youruniversity.edu/..."
              className="max-w-none"
              disabled={!canEditProfile}
              onSave={(next) => onSaveProfileField("donation_url", next)}
            />
            {profileHint}
          </div>
        </section>

        <SettingsGroup heading="Look" footnote={CHAPTER_LOOK_FOOTNOTE}>
          <SettingsRow
            icon={ImageIcon}
            label="Chapter mark"
            value={markValue}
            id={`chapter-row-mark`}
            href={pageHref("mark")}
          />
          <SettingsRow
            icon={Palette}
            label="Accent color"
            value={
              <span
                aria-label="The chapter's accent"
                className="inline-block h-3.5 w-3.5 rounded-full bg-primary align-middle"
              />
            }
            id={`chapter-row-accent`}
            href={pageHref("accent")}
          />
        </SettingsGroup>

        <SettingsGroup
          heading="About the chapter"
          footnote={CHAPTER_ABOUT_FOOTNOTE}
        >
          <SettingsRow
            icon={Landmark}
            label="Identity & founding"
            value={identityValue}
            id={`chapter-row-identity`}
            href={pageHref("identity")}
          />
          <SettingsRow
            icon={Building2}
            label="Organization type"
            value={current.short}
            id={`chapter-row-type`}
            href={pageHref("type")}
          />
          <SettingsRow
            icon={Type}
            label="Vocabulary"
            value={chapterVocabularyValue(vocabulary, current.key)}
            id={`chapter-row-vocabulary`}
            href={pageHref("vocabulary")}
          />
        </SettingsGroup>
      </div>
    );
  }

  return (
    <>
      {markPage}
      {content}

      <Dialog
        open={pendingArchetype !== null}
        onOpenChange={(open) => {
          if (!open) setPendingArchetype(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingArchetype
                ? CHAPTER_TAB_COPY.typeConfirmTitle(
                    getArchetype(pendingArchetype),
                  )
                : null}
            </DialogTitle>
            <DialogDescription>
              {pendingArchetype
                ? CHAPTER_TAB_COPY.typeConfirmBody(
                    getArchetype(pendingArchetype),
                  )
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setPendingArchetype(null)}
            >
              Cancel
            </Button>
            <Button onClick={confirmArchetypeSwitch} disabled={switchingType}>
              {switchingType ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {CHAPTER_TAB_COPY.typeConfirmAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
