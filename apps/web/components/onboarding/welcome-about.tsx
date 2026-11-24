"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import {
  type OwnCustomField,
  ownCustomFieldFormChanges,
  ownCustomFieldShownValue,
  useChapterMajors,
  usePermissionList,
  useUpdateOwnCustomFields,
  useUpdateUser,
} from "@repo/hooks";
import { formatPhone } from "@repo/formatting";
import {
  aboutYouCustomFields,
  type BirthdayDraftProblem,
  can,
  ONBOARDING_ABOUT_COPY,
} from "@repo/validation";
import { AuthScreen } from "@/components/auth/auth-screen";
import { OwnCustomFieldControl } from "@/components/profile/own-custom-fields-section";
import { ProfileAboutFields } from "@/components/profile/profile-about-fields";
import {
  type ProfileFields,
  profileSaveBody,
  profileSaveProblem,
} from "@/components/profile/profile-save-body";
import { Button } from "@/components/ui/button";
import { QUIET_LINK } from "@/components/ui/quiet-link";
import { FOCUS_RING } from "@/components/ui/focus";
import { cn } from "@/lib/utils";

/** The fields this step asks, as stored, the phone shown formatted (#5798). */
export function aboutYouFields(saved: ProfileFields): ProfileFields {
  return {
    phone: saved.phone ? formatPhone(saved.phone) : (saved.phone ?? null),
    major: saved.major ?? null,
    graduation_year: saved.graduation_year ?? null,
    birthday_month: saved.birthday_month ?? null,
    birthday_day: saved.birthday_day ?? null,
    birthday_year: saved.birthday_year ?? null,
    birthday_visibility: saved.birthday_visibility,
  };
}

/**
 * About you (#5284): the optional step after `How the chapter sees you` on
 * `/welcome`, shown only when phone, major, graduation year or birthday is
 * empty (`needsAboutYou`). The phone's s03 asks the same, in the same words
 * and order (`apps/mobile/app/(auth)/welcome.tsx`).
 *
 * The fields are `/profile`'s (`ProfileAboutFields`), and so are the rules:
 * Go to chat sends only what changed (`profileSaveBody`) after the same
 * checks (`profileSaveProblem`), and a failed save keeps the member here
 * with the reason. Skip for now saves nothing.
 *
 * Under them, the chapter's own fields (#5926), drawn by `/profile`'s More
 * details control (`OwnCustomFieldControl`), each saying who else sees it:
 * the `required` ones in place, the rest behind one More details row that
 * opens them where they stand (`aboutYouCustomFields`), so a chapter that
 * asks for two things shows two. They are checked and sent the way More
 * details sends them (`ownCustomFieldFormChanges`): only what changed, and
 * a required field left empty waits for later rather than holding the
 * member here.
 */
export function WelcomeAbout({
  saved,
  fields,
  leaving,
  onDone,
}: {
  saved: ProfileFields;
  /** The chapter's fields with the member's values, as loaded. */
  fields: readonly OwnCustomField[];
  /** The host is on its way to chat. */
  leaving: boolean;
  onDone: () => void;
}) {
  const updateUser = useUpdateUser();
  const updateCustom = useUpdateOwnCustomFields();
  // The chapter's majors under Major (#5778), as on `/profile`: the read
  // needs `members:view`.
  const canViewMembers = can("members:view", usePermissionList());
  const majors = useChapterMajors({ enabled: canViewMembers });
  // What the step opened on, so a refetch underneath doesn't move it.
  const [original, setOriginal] = useState(() => aboutYouFields(saved));
  const [draft, setDraft] = useState<ProfileFields>(original);
  // The chapter's fields as the step opened on them, and what was typed.
  const [customOriginal, setCustomOriginal] = useState(() => [...fields]);
  const [customDraft, setCustomDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field) => [field.field_id, ownCustomFieldShownValue(field)]),
    ),
  );
  const [customProblems, setCustomProblems] = useState<Record<string, string>>(
    {},
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const { asked, more } = aboutYouCustomFields(customOriginal);
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const [yearInvalid, setYearInvalid] = useState(false);
  const [birthdayProblem, setBirthdayProblem] =
    useState<BirthdayDraftProblem | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = saving || leaving;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const body = profileSaveBody(original, draft);
    const problem = profileSaveProblem(body, draft);
    if (problem?.field === "phone") {
      setPhoneInvalid(true);
      return;
    }
    if (problem?.field === "graduationYear") {
      setYearInvalid(true);
      return;
    }
    if (problem?.field === "birthday") {
      setBirthdayProblem(problem.problem);
      return;
    }
    const custom = ownCustomFieldFormChanges(customOriginal, customDraft);
    const refused = Object.keys(custom.problems);
    if (refused.length > 0) {
      setCustomProblems(custom.problems);
      // A refusal behind More details opens it, so the reason shows.
      if (more.some((field) => refused.includes(field.field_id))) {
        setMoreOpen(true);
      }
      return;
    }
    if (Object.keys(body).length > 0 || custom.values.length > 0) {
      setSaving(true);
      setSaveFailed(false);
      try {
        if (Object.keys(body).length > 0) {
          await updateUser.mutateAsync(body);
          // Saved: a retry after the next write fails doesn't send it again.
          setOriginal(draft);
        }
        if (custom.values.length > 0) {
          const savedFields = await updateCustom.mutateAsync(custom.values);
          setCustomOriginal(
            customOriginal.map(
              (field) =>
                savedFields.find((next) => next.field_id === field.field_id) ??
                field,
            ),
          );
        }
      } catch {
        setSaveFailed(true);
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    onDone();
  }

  const customControl = (field: OwnCustomField) => (
    <OwnCustomFieldControl
      key={field.field_id}
      field={field}
      value={customDraft[field.field_id] ?? ""}
      problem={customProblems[field.field_id] ?? null}
      disabled={busy}
      onChange={(value) => {
        setCustomProblems((prev) => {
          if (!(field.field_id in prev)) return prev;
          const rest = { ...prev };
          delete rest[field.field_id];
          return rest;
        });
        setSaveFailed(false);
        setCustomDraft((prev) => ({ ...prev, [field.field_id]: value }));
      }}
    />
  );

  return (
    <AuthScreen
      title={ONBOARDING_ABOUT_COPY.title}
      subtitle={ONBOARDING_ABOUT_COPY.lede}
    >
      <form
        noValidate
        className="grid gap-5"
        onSubmit={(event) => void submit(event)}
      >
        <ProfileAboutFields
          value={draft}
          majors={majors}
          phoneInvalid={phoneInvalid}
          yearInvalid={yearInvalid}
          birthdayProblem={birthdayProblem}
          disabled={busy}
          onChange={(patch) => {
            if ("phone" in patch) setPhoneInvalid(false);
            if ("graduation_year" in patch) setYearInvalid(false);
            if ("birthday_month" in patch) setBirthdayProblem(null);
            setSaveFailed(false);
            setDraft((prev) => ({ ...prev, ...patch }));
          }}
        />
        {asked.map(customControl)}
        {more.length > 0 && !moreOpen ? (
          // Opens the rest in place, once: nothing here closes it again.
          <button
            type="button"
            className={cn(
              "flex h-10 w-full items-center justify-between gap-3 rounded-md border border-border px-3 text-left text-body text-foreground transition-colors hover:bg-card-hover disabled:opacity-50",
              FOCUS_RING,
            )}
            disabled={busy}
            aria-expanded={false}
            onClick={() => setMoreOpen(true)}
          >
            <span>{ONBOARDING_ABOUT_COPY.moreDetails}</span>
            <span className="flex items-center gap-2 text-caption text-muted-foreground">
              {ONBOARDING_ABOUT_COPY.moreDetailsCount(more.length)}
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>
        ) : null}
        {moreOpen ? more.map(customControl) : null}
        {saveFailed ? (
          <p role="alert" className="text-sm text-destructive">
            {ONBOARDING_ABOUT_COPY.saveFailed}
          </p>
        ) : null}
        <div className="grid gap-2">
          <Button
            type="submit"
            className="w-full"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {ONBOARDING_ABOUT_COPY.goToChat}
          </Button>
          <button
            type="button"
            className={cn(QUIET_LINK, "justify-self-center")}
            disabled={busy}
            onClick={onDone}
          >
            {ONBOARDING_ABOUT_COPY.skip}
          </button>
        </div>
      </form>
    </AuthScreen>
  );
}
