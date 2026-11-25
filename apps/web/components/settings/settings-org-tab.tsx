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
  FOUNDED_YEAR_MIN,
  latestFoundedYear,
} from "@repo/hooks/chapter-identity";
import {
  CHAPTER_TAB_COPY,
  CHAPTER_VOCABULARY_FIELDS,
  chapterArchetypeSwitchPatch,
  chapterIdentityBrandingDiff,
  chapterIdentityDraftOf,
  chapterIdentityValue,
  chapterLettersHidden,
  chapterMarkValue,
  chapterProfileChanged,
  chapterVocabularyDraftOf,
  chapterVocabularyPatch,
  chapterVocabularyValue,
  checkFoundedYear,
  type ChapterIdentityDraft,
  type ChapterTabBranding,
  type ChapterVocabularyDraft,
} from "@repo/hooks/chapter-tab";
import { useFieldReveal } from "@repo/hooks/field-reveal";
import { Button } from "@/components/ui/button";
import { ProfileSection } from "@/components/profile/profile-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  /** Persist the core chapter profile (name/university/donation). */
  onSaveProfile: (profile: {
    name: string;
    university: string;
    donation_url: string;
  }) => Promise<void> | void;
  /** Persist a config diff (branding / archetype / vocabulary) through PATCH. */
  onPatchConfig: (diff: PatchChapterConfig) => Promise<void> | void;
  savingProfile?: boolean;
  savingConfig?: boolean;
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
  onSaveProfile,
  onPatchConfig,
  savingProfile,
  savingConfig,
  accentSection,
  page = null,
  pageHref = chapterSettingsHref,
}: Props) {
  const current = getArchetype(archetypeKey);

  const [profileDraft, setProfileDraft] = useState(profile);
  const [identity, setIdentity] = useState<ChapterIdentityDraft>(() =>
    chapterIdentityDraftOf(branding),
  );
  const [words, setWords] = useState<ChapterVocabularyDraft>(() =>
    chapterVocabularyDraftOf(vocabulary),
  );
  const [pendingArchetype, setPendingArchetype] = useState<ArchetypeKey | null>(
    null,
  );

  // Re-sync drafts whenever the server config changes (e.g. after an archetype
  // switch resets vocabulary, or another officer edits the chapter).
  //
  // Keyed on the stored values, never on the objects that carry them: the page
  // rebuilds `profile`, `branding` and `vocabulary` on every render, so an
  // object dependency re-ran these on any unrelated re-render (a logo upload
  // starting, another card saving) and threw away whatever the officer had
  // typed but not saved.
  const {
    name: storedName,
    university: storedUniversity,
    donation_url: storedDonation,
  } = profile;
  // FIJI's chapters never show their letters, also when the chapter's name
  // adds to the organization's ("Phi Gamma Delta Tau Nu").
  const lettersHidden = chapterLettersHidden(storedName);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seed profile draft from the chapter config query
    setProfileDraft({
      name: storedName,
      university: storedUniversity,
      donation_url: storedDonation,
    });
  }, [storedName, storedUniversity, storedDonation]);
  /* eslint-disable react-hooks/set-state-in-effect -- re-seed branding fields from the chapter config query */
  useEffect(() => {
    setIdentity(
      chapterIdentityDraftOf({
        greek_letters: branding.greek_letters,
        designation: branding.designation,
        school_short: branding.school_short,
        founded_at: branding.founded_at,
      }),
    );
  }, [
    branding.greek_letters,
    branding.designation,
    branding.school_short,
    branding.founded_at,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */
  /* eslint-disable react-hooks/set-state-in-effect -- re-seed vocabulary drafts from the chapter config query */
  useEffect(() => {
    setWords(
      chapterVocabularyDraftOf({
        recruitment: vocabulary.recruitment,
        pledge: vocabulary.pledge,
        class: vocabulary.class,
        order: vocabulary.order,
        tier: vocabulary.tier,
      }),
    );
  }, [
    vocabulary.recruitment,
    vocabulary.pledge,
    vocabulary.class,
    vocabulary.order,
    vocabulary.tier,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // The wizards' rule, and no clearing a stored year (`checkFoundedYear`).
  const { valid: foundedValid, cleared: foundedCleared } = checkFoundedYear(
    identity.foundedYear,
    branding.founded_at,
  );
  // "1" on its way to "1901" is not a mistake: the error waits for the member
  // to leave the field or press Save (components.md § Text input, "When an
  // error shows").
  const reveal = useFieldReveal<"founded">();
  const foundedError = !foundedValid && reveal.shows("founded");

  function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSaveProfile({
      name: profileDraft.name,
      university: profileDraft.university,
      donation_url: profileDraft.donation_url,
    });
  }

  function saveIdentity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!foundedValid) {
      reveal.submit();
      return;
    }
    // A cleared field is sent as "" so the clear reaches the server; one
    // never set stays out (`chapterIdentityBrandingDiff`).
    void onPatchConfig({
      branding: chapterIdentityBrandingDiff(identity, branding),
    });
  }

  function saveVocabulary(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Every word, a cleared one as "" so the type's word comes back
    // (`chapterVocabularyPatch`, #3939).
    void onPatchConfig(chapterVocabularyPatch(words));
  }

  function confirmArchetypeSwitch() {
    if (!pendingArchetype) return;
    // Modules and vocabulary reset to the new type's defaults; roles and
    // identity stay.
    void onPatchConfig(chapterArchetypeSwitchPatch(pendingArchetype));
    setPendingArchetype(null);
  }

  // Says what the role can't do, never which permission key it lacks.
  const readOnlyHint = (
    <p className="text-xs text-muted-foreground">
      {CHAPTER_TAB_COPY.readOnly}
    </p>
  );
  const manageHint = canManage ? null : readOnlyHint;
  const profileHint = canEditProfile ? null : readOnlyHint;

  const profileChanged = chapterProfileChanged(profile, profileDraft);
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
  // The mark page stays mounted while hidden, so a short name typed there
  // and left unsaved is still there on the way back, as the other pages' drafts
  // are (they live in this component).
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
          savingConfig={savingConfig}
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
    content = subpage("Accent color", accentSection);
  } else if (page === "identity") {
    content = subpage(
      "Identity & founding",
      <>
        <ProfileSection
          id="settings-identity"
          title="Identity & founding"
          hint={CHAPTER_TAB_COPY.identityHint(lettersHidden)}
        >
          <form onSubmit={saveIdentity}>
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {/*
                FIJI never displays its letters, so Settings doesn't draw
                them either. They stay stored: the hidden field's draft is
                the stored value, so a save writes them back unchanged.
              */}
                {lettersHidden ? null : (
                  <div className="grid gap-1">
                    <Label htmlFor="greek-letters">Greek letters</Label>
                    <Input
                      id="greek-letters"
                      value={identity.greekLetters}
                      onChange={(event) =>
                        setIdentity((prev) => ({
                          ...prev,
                          greekLetters: event.target.value,
                        }))
                      }
                      maxLength={8}
                      placeholder="e.g. ΣΦΕ"
                      className="font-mono"
                    />
                  </div>
                )}
                <div className="grid gap-1">
                  <Label htmlFor="designation">Chapter designation</Label>
                  <Input
                    id="designation"
                    value={identity.designation}
                    onChange={(event) =>
                      setIdentity((prev) => ({
                        ...prev,
                        designation: event.target.value,
                      }))
                    }
                    placeholder="e.g. California Eta"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="school-short">School (short)</Label>
                  <Input
                    id="school-short"
                    value={identity.schoolShort}
                    onChange={(event) =>
                      setIdentity((prev) => ({
                        ...prev,
                        schoolShort: event.target.value,
                      }))
                    }
                    placeholder="e.g. UCLA"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="founded-year">Founded year</Label>
                  <Input
                    id="founded-year"
                    type="number"
                    inputMode="numeric"
                    value={identity.foundedYear}
                    onChange={(event) =>
                      setIdentity((prev) => ({
                        ...prev,
                        foundedYear: event.target.value,
                      }))
                    }
                    placeholder="e.g. 1901"
                    onBlur={() => reveal.blur("founded")}
                    aria-invalid={foundedError}
                    aria-describedby={
                      foundedError ? "founded-year-error" : undefined
                    }
                  />
                  {foundedError ? (
                    <p
                      id="founded-year-error"
                      className="text-xs text-destructive"
                    >
                      {foundedCleared
                        ? "A founded year can't be removed once saved. "
                        : null}
                      Enter a year between {FOUNDED_YEAR_MIN} and{" "}
                      {latestFoundedYear()}.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              {manageHint ?? <span />}
              <Button type="submit" disabled={!canManage || savingConfig}>
                {savingConfig ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Save identity
              </Button>
            </div>
          </form>
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
          <form onSubmit={saveVocabulary}>
            <div className="grid gap-3 md:grid-cols-2">
              {/*
                The tier word is what the chapter calls a tier of roles
                (#4068 decision 5): Roles reads it in its headings and buttons.
              */}
              {CHAPTER_VOCABULARY_FIELDS.map((field) => (
                <div key={field.key} className="grid gap-1">
                  <Label htmlFor={`vocab-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`vocab-${field.key}`}
                    value={words[field.key]}
                    onChange={(event) =>
                      setWords((prev) => ({
                        ...prev,
                        [field.key]: event.target.value,
                      }))
                    }
                    placeholder={field.placeholder(current)}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              {manageHint ?? <span />}
              <Button type="submit" disabled={!canManage || savingConfig}>
                {savingConfig ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Save vocabulary
              </Button>
            </div>
          </form>
        </ProfileSection>
      </>,
    );
  } else {
    content = (
      <div className="space-y-8">
        <section id="settings-chapter-profile" aria-label="Chapter profile">
          <form onSubmit={saveProfile}>
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor="chapter-name">Chapter name</Label>
                  <Input
                    id="chapter-name"
                    maxLength={CHAPTER_NAME_MAX_LENGTH}
                    value={profileDraft.name}
                    onChange={(event) =>
                      setProfileDraft((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="chapter-university">University</Label>
                  <Input
                    id="chapter-university"
                    maxLength={CHAPTER_UNIVERSITY_MAX_LENGTH}
                    value={profileDraft.university}
                    onChange={(event) =>
                      setProfileDraft((prev) => ({
                        ...prev,
                        university: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="chapter-donation">
                  Donation link (optional)
                </Label>
                <Input
                  id="chapter-donation"
                  type="url"
                  value={profileDraft.donation_url}
                  onChange={(event) =>
                    setProfileDraft((prev) => ({
                      ...prev,
                      donation_url: event.target.value,
                    }))
                  }
                  placeholder="https://give.youruniversity.edu/..."
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              {profileHint ?? <span />}
              <Button
                type="submit"
                disabled={!canEditProfile || savingProfile || !profileChanged}
              >
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Save profile
              </Button>
            </div>
          </form>
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
            <Button onClick={confirmArchetypeSwitch} disabled={savingConfig}>
              {savingConfig ? (
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
