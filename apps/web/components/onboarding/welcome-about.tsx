"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  useChapterMajors,
  usePermissionList,
  useUpdateUser,
} from "@repo/hooks";
import { formatPhone } from "@repo/formatting";
import {
  type BirthdayDraftProblem,
  can,
  ONBOARDING_ABOUT_COPY,
} from "@repo/validation";
import { AuthScreen } from "@/components/auth/auth-screen";
import { ProfileAboutFields } from "@/components/profile/profile-about-fields";
import {
  type ProfileFields,
  profileSaveBody,
  profileSaveProblem,
} from "@/components/profile/profile-save-body";
import { Button } from "@/components/ui/button";
import { QUIET_LINK } from "@/components/ui/quiet-link";
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
 */
export function WelcomeAbout({
  saved,
  leaving,
  onDone,
}: {
  saved: ProfileFields;
  /** The host is on its way to chat. */
  leaving: boolean;
  onDone: () => void;
}) {
  const updateUser = useUpdateUser();
  // The chapter's majors under Major (#5778), as on `/profile`: the read
  // needs `members:view`.
  const canViewMembers = can("members:view", usePermissionList());
  const majors = useChapterMajors({ enabled: canViewMembers });
  // What the step opened on, so a refetch underneath doesn't move it.
  const [original] = useState(() => aboutYouFields(saved));
  const [draft, setDraft] = useState<ProfileFields>(original);
  const [phoneInvalid, setPhoneInvalid] = useState(false);
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
    if (problem?.field === "birthday") {
      setBirthdayProblem(problem.problem);
      return;
    }
    if (Object.keys(body).length > 0) {
      setSaving(true);
      setSaveFailed(false);
      try {
        await updateUser.mutateAsync(body);
      } catch {
        setSaveFailed(true);
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    onDone();
  }

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
          birthdayProblem={birthdayProblem}
          disabled={busy}
          onChange={(patch) => {
            if ("phone" in patch) setPhoneInvalid(false);
            if ("birthday_month" in patch) setBirthdayProblem(null);
            setSaveFailed(false);
            setDraft((prev) => ({ ...prev, ...patch }));
          }}
        />
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
