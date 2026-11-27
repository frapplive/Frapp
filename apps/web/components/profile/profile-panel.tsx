"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { closeAddress } from "@/lib/address/address";
import { NEW_INTENT_PARAM } from "@/components/layout/new-intent-href";
import { Loader2 } from "lucide-react";
import {
  profileIdentityLine,
  useActiveChapterId,
  useChapterMajors,
  useCurrentUser,
  useMemberByUserId,
  useMemberDisplayNames,
  usePermissionList,
  useUpdateUser,
} from "@repo/hooks";
import { formatPhone } from "@repo/formatting";
import {
  type BirthdayDraftProblem,
  type BirthdayVisibility,
  can,
  DISPLAY_NAME_MAX_LENGTH,
  isDisplayNameLocked,
  NAME_LOCK_COPY,
  PROFILE_ALUMNI_SECTION,
  PROFILE_FIELD_COPY,
  showsAfterGraduation,
  USER_BIO_MAX_LENGTH,
  USER_CITY_MAX_LENGTH,
  USER_COMPANY_MAX_LENGTH,
} from "@repo/validation";
import { StandingCards } from "@/components/activity/standing-cards";
import { StandingPanels } from "@/components/standing/standing-panels";
import { StandingStats } from "@/components/standing/standing-stats";
import {
  STANDING_PARAM,
  standingDoorFrom,
} from "@/components/standing/standing-doors";
import { useIsCouncil } from "@/lib/hooks/use-tenant-kind";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/use-toast";
import { ProfileSection } from "@/components/profile/profile-section";
import { OwnCustomFieldsSection } from "@/components/profile/own-custom-fields-section";
import {
  profileSaveBody,
  profileSaveProblem,
} from "@/components/profile/profile-save-body";
import { ProfileAboutFields } from "@/components/profile/profile-about-fields";
import { PickRolesSection } from "@/components/roles/pick-roles-section";
import { ProfilePhotoControl } from "@/components/profile/profile-photo-control";
import { MemberPledgeClassSection } from "@/components/members/member-pledge-class-section";
import { anyReadUncached, pausedRead } from "@/components/shared/async-states";
import { NestedError, NestedOffline } from "@/components/shared/nested-states";
import { useNetwork } from "@/lib/providers/network-provider";
import { getErrorMessage, initials } from "@/lib/utils";
import { ProfilePageSkeleton } from "@/components/profile/profile-skeleton";

type CurrentUser = {
  id?: string;
  email?: string | null;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  graduation_year?: number | null;
  major?: string | null;
  current_city?: string | null;
  current_company?: string | null;
  phone?: string | null;
  birthday_month?: number | null;
  birthday_day?: number | null;
  birthday_year?: number | null;
  birthday_visibility?: BirthdayVisibility;
};

/**
 * `/profile`: who you are in the directory. Name, photo, phone, major, year,
 * bio and the after-graduation fields, with your standing above the form:
 * your points, service hours and study hours, each opening its own panel in
 * place (`components/standing/`, #5950), then your pledge class and order
 * number, read-only (#4137). Nothing else: quiet hours, chapter alerts,
 * chat density, blocked members, Discord history and the account controls
 * moved to the personal Settings page (`/preferences`,
 * `components/personal-settings/`, #3856).
 */
export function ProfilePanel() {
  const { toast } = useToast();
  const { isOffline } = useNetwork();
  const userQuery = useCurrentUser();
  // Your initials wear the color the chapter sees on them (#3860).
  const { avatarTintFor } = useMemberDisplayNames();
  const ownId = (userQuery.data as CurrentUser | undefined)?.id;
  const updateUser = useUpdateUser();
  // Whether the chapter locks the member's own name (#5801).
  const nameLocked = isDisplayNameLocked(userQuery.data);
  // Standing is the chapter's: with no active chapter there is none to read.
  const hasChapter = !!useActiveChapterId();
  // A council keeps no points, service hours or standing (#5933): its routes
  // refuse those reads, so its Profile shows none of them.
  const isCouncil = useIsCouncil();
  // `/profile?open=points` (or `service`, `study`) opens that number's panel
  // in place of the page; the figures and gauges below link to it.
  const openDoor = standingDoorFrom(useSearchParams().get(STANDING_PARAM));
  // Your pledge class and order number live on your membership, not on
  // `/v1/users/me`, behind the Directory's gate (`members:view`); a viewer
  // without it reads neither and sees no rows, as on the phone (#3939).
  const canViewMembers = can("members:view", usePermissionList());
  // The chapter's majors, offered under Major (#5778), from the same
  // `members:view` read as the Directory's groups.
  const chapterMajors = useChapterMajors({ enabled: canViewMembers });
  const memberQuery = useMemberByUserId(canViewMembers ? (ownId ?? "") : "");
  const membership = memberQuery.data as
    | {
        id?: string;
        pledge_class_id?: string | null;
        order_number?: number | null;
      }
    | undefined;

  const [profileDraft, setProfileDraft] = useState<CurrentUser>({});
  // Set on a submit the phone refused, cleared when the member edits it
  // (validate on submit, not per keystroke: components.md § Text input).
  const [phoneError, setPhoneError] = useState(false);
  const [yearError, setYearError] = useState(false);
  // Set on a submit with half a birthday, or a day its month lacks (#4959).
  const [birthdayError, setBirthdayError] =
    useState<BirthdayDraftProblem | null>(null);

  // The server payload the draft was last seeded from, so a re-seed can tell a
  // field the member edited from one they left alone.
  const seededFrom = useRef<CurrentUser | null>(null);

  useEffect(() => {
    if (!userQuery.data) return;
    const loaded = userQuery.data as CurrentUser;
    // The Phone field shows the stored number formatted (#5798). Seeding it
    // formatted, and comparing re-seeds the same way, keeps a stored
    // `+15185550142` from reading as an edit the member made.
    const next: CurrentUser = loaded.phone
      ? { ...loaded, phone: formatPhone(loaded.phone) }
      : loaded;
    const previous = seededFrom.current;
    seededFrom.current = next;
    setProfileDraft((draft) => {
      if (!previous) return next;
      // Keep what the member has typed and not saved. A photo change refetches
      // this payload mid-edit (#732), as does a window-focus refetch, and a
      // wholesale re-seed would drop their unsaved name or bio without a word.
      const merged: CurrentUser = { ...next };
      for (const key of Object.keys(draft) as (keyof CurrentUser)[]) {
        if (draft[key] !== previous[key]) {
          (merged as Record<string, unknown>)[key] = draft[key];
        }
      }
      // The photo is never a draft field: it changes only on the server.
      merged.avatar_url = next.avatar_url;
      return merged;
    });
  }, [userQuery.data]);

  /*
   * Screen-scale states, in the order `spec/ui/design-system/README.md` §4
   * fixes: offline, then loading, then error, then the screen.
   *
   * There is **no entitlement branch**, deliberately. `useCurrentUser`
   * (`packages/hooks/src/use-user.ts`) sets no `enabled`, so
   * `isPending && fetchStatus === "idle"` is unreachable here — and there is no
   * `<Can>` either, because `/profile` is about the viewer rather than the
   * chapter and there is no permission that could deny it.
   *
   * `isError && data === undefined`, not bare `isError`, and that is the
   * defect this replaces rather than a stylistic preference. TanStack v5 keeps
   * `data` through a *background* refetch failure, so the old `if
   * (userQuery.isError)` unmounted the whole panel — including the draft
   * state — when a window-focus refetch failed. On a screen whose entire
   * purpose is holding text a member is part-way through typing, that discards
   * their work and says nothing about it. Same shape as `<Can>`'s branch since
   * #1211, met on a form.
   */
  const userPaused = pausedRead(userQuery);
  if (isOffline && anyReadUncached(userQuery)) {
    return (
      <>
        <NestedOffline
          title="Your profile is unavailable offline"
          description="Reconnect to load your directory entry."
          onRetry={() => void userQuery.refetch()}
          sole
        />
      </>
    );
  }
  if (userQuery.isLoading || userPaused) {
    return <ProfilePageSkeleton />;
  }
  if (userQuery.isError && anyReadUncached(userQuery)) {
    return (
      <>
        <NestedError
          title="Couldn't load your profile"
          description="You're signed in, but Frapp couldn't be reached. Try again in a moment."
          onRetry={() => void userQuery.refetch()}
          sole
        />
      </>
    );
  }

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Only what the member changed (`profileSaveBody`), so a value stored
    // before a limit never refuses an unrelated edit.
    const saved = (userQuery.data ?? {}) as CurrentUser;
    const body = profileSaveBody(saved, profileDraft);
    // A locked name is shown, never sent (#5801).
    if (nameLocked) delete body.display_name;
    const problem = profileSaveProblem(body, profileDraft);
    if (problem?.field === "phone") {
      setPhoneError(true);
      return;
    }
    if (problem?.field === "graduationYear") {
      setYearError(true);
      return;
    }
    if (problem?.field === "birthday") {
      setBirthdayError(problem.problem);
      return;
    }
    try {
      if (Object.keys(body).length > 0) {
        await updateUser.mutateAsync(body);
      }
      toast({
        title: "Profile saved",
        description: "Your chapter directory entry is up to date.",
      });
    } catch (error) {
      toast({
        title: "Couldn't save profile",
        description: getErrorMessage(
          error,
          "Try again or check your connection.",
        ),
        variant: "destructive",
      });
    }
  }

  const profile = profileDraft;
  // City and Company wait for the graduation year as typed; a stored value
  // keeps its field showing so it can be cleared (`showsAfterGraduation`).
  const afterGraduation = showsAfterGraduation({
    graduationYear: profile.graduation_year ?? null,
    city: (userQuery.data as CurrentUser | undefined)?.current_city,
    company: (userQuery.data as CurrentUser | undefined)?.current_company,
  });
  // Two different fallbacks, deliberately: the heading needs *something* to
  // say when a member has not set a display name, but the avatar must not
  // spell the initials of that placeholder — `initials("Your profile")` is
  // "YP", which reads as a person who is not them.
  const storedName = profile.display_name?.trim() ?? "";
  const displayName = storedName || "Your profile";
  // The phone's line under the name: major · company · '27, from what is
  // saved, so it doesn't change while the member types in the form below.
  const saved = userQuery.data as CurrentUser | undefined;
  const identityMeta = profileIdentityLine({
    major: saved?.major,
    company: saved?.current_company,
    graduationYear: saved?.graduation_year,
  });

  return (
    <div className="space-y-6">
      {/*
        One column, capped at a form's width: a 1,100px name field is not a
        form anyone reads. Each block is a section on the page surface under
        its label, not a card (`spec/ui/web-dashboard/README.md` Page grammar).
      */}
      <div className="max-w-2xl space-y-10">
        {/*
          s15's identity header. The initials take your member tint, as
          everywhere your face appears (#3860). s15 drew it in the house-gold
          family and this transcribed that as the chapter accent until
          2026-11-05, when the accent came off people's avatars
          (`foundations.md` §6). The untinted initials are measured in
          `profile-contrast.spec.ts`.

          Beside the photo rather than centred over the name, as the phone
          draws it: a desktop profile reads left to right, as Slack's and
          LinkedIn's do on the web, and the form under it is left-aligned
          (#4137, recorded in `spec/ui/web-dashboard/README.md`). The name, the
          major · company · year line and the photo controls are the phone's.
        */}
        <header className="flex items-center gap-4">
          <Avatar className="h-[84px] w-[84px] border border-border bg-popover">
            {profile.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt="" />
            ) : null}
            {/*
              The headline role (foundations §7), as mobile's profile photo
              draws the same 84px circle's initials (`profile-photo.tsx`), so
              both apps size them alike (#3830).
            */}
            <AvatarFallback
              tint={ownId ? avatarTintFor(ownId) : null}
              className="bg-popover text-headline font-bold text-foreground"
            >
              {initials(storedName || profile.email || "")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="truncate text-headline font-bold tracking-tight">
              {displayName}
            </h2>
            {identityMeta ? (
              <p className="truncate text-sm text-muted-foreground">
                {identityMeta}
              </p>
            ) : null}
            {/* An absent email is absent, not a sentence standing in for it. */}
            {profile.email ? (
              <p className="truncate text-sm text-muted-foreground">
                {profile.email}
              </p>
            ) : null}
            <div className="mt-2">
              <ProfilePhotoControl
                hasPhoto={!!profile.avatar_url}
                disabled={isOffline}
              />
            </div>
          </div>
        </header>

        {/*
          Your numbers, each a door to what is behind it (#5950): Points,
          Service hours and Study hours were sidebar pages until then.
        */}
        {isCouncil ? null : <StandingStats />}

        {/*
          Your class and number, read-only as on the phone: they are an
          officer's to set, from your Directory profile or Settings. Each
          shows only when set, so a chapter that keeps neither sees nothing.
        */}
        <MemberPledgeClassSection
          open
          memberId={membership?.id ?? null}
          displayName={displayName}
          pledgeClassId={membership?.pledge_class_id ?? null}
          orderNumber={
            typeof membership?.order_number === "number"
              ? membership.order_number
              : null
          }
          canEdit={false}
        />

        {/*
          Last week and This semester, beside your numbers (#5779): how you
          are standing, which Activity no longer shows. Its Points and Service
          hours are this semester's, beside a goal; the figures above are all
          time, so both stay.
        */}
        {hasChapter && !isCouncil ? <StandingCards /> : null}

        {/* Non-chapter business roles you pick yourself (#4958). */}
        {canViewMembers ? <PickRolesSection /> : null}

        <ProfileSection
          id="directory-profile"
          title="Directory profile"
          hint="Visible to the members of your active chapter."
        >
          <form className="space-y-4" onSubmit={handleProfileSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="display-name">
                {PROFILE_FIELD_COPY.displayName.label}
              </Label>
              {/*
                Locked by the chapter (#5801): the stored name, read-only, with
                the fact that officers set it. The save sends only changed
                fields, so a locked name is never sent.
              */}
              <Input
                id="display-name"
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                value={
                  nameLocked
                    ? ((userQuery.data as CurrentUser | undefined)
                        ?.display_name ?? "")
                    : (profile.display_name ?? "")
                }
                readOnly={nameLocked}
                aria-describedby={nameLocked ? "display-name-hint" : undefined}
                className={nameLocked ? "text-muted-foreground" : undefined}
                onChange={(event) =>
                  setProfileDraft((prev) => ({
                    ...prev,
                    display_name: event.target.value,
                  }))
                }
                placeholder={PROFILE_FIELD_COPY.displayName.placeholder}
              />
              {nameLocked ? (
                <p
                  id="display-name-hint"
                  className="text-caption text-muted-foreground"
                >
                  {NAME_LOCK_COPY.lockedLine}
                </p>
              ) : null}
            </div>
            <ProfileAboutFields
              value={profile}
              majors={chapterMajors}
              phoneInvalid={phoneError}
              yearInvalid={yearError}
              birthdayProblem={birthdayError}
              onChange={(patch) => {
                if ("phone" in patch) setPhoneError(false);
                if ("graduation_year" in patch) setYearError(false);
                if ("birthday_month" in patch) setBirthdayError(null);
                setProfileDraft((prev) => ({ ...prev, ...patch }));
              }}
            />
            <div className="grid gap-2">
              <Label htmlFor="bio">{PROFILE_FIELD_COPY.bio.label}</Label>
              <Textarea
                id="bio"
                maxLength={USER_BIO_MAX_LENGTH}
                value={profile.bio ?? ""}
                onChange={(event) =>
                  setProfileDraft((prev) => ({
                    ...prev,
                    bio: event.target.value,
                  }))
                }
                placeholder={PROFILE_FIELD_COPY.bio.placeholder}
                rows={3}
              />
            </div>
            {afterGraduation ? (
              <fieldset className="grid gap-4 pt-2">
                <legend className="mb-4 grid gap-1">
                  <span className="text-sm font-semibold text-foreground">
                    {PROFILE_ALUMNI_SECTION.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {PROFILE_ALUMNI_SECTION.hint}
                  </span>
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="current-city">
                      {PROFILE_FIELD_COPY.city.label}
                    </Label>
                    <Input
                      id="current-city"
                      maxLength={USER_CITY_MAX_LENGTH}
                      value={profile.current_city ?? ""}
                      onChange={(event) =>
                        setProfileDraft((prev) => ({
                          ...prev,
                          current_city: event.target.value,
                        }))
                      }
                      placeholder={PROFILE_FIELD_COPY.city.placeholder}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="current-company">
                      {PROFILE_FIELD_COPY.company.label}
                    </Label>
                    <Input
                      id="current-company"
                      maxLength={USER_COMPANY_MAX_LENGTH}
                      value={profile.current_company ?? ""}
                      onChange={(event) =>
                        setProfileDraft((prev) => ({
                          ...prev,
                          current_company: event.target.value,
                        }))
                      }
                      placeholder={PROFILE_FIELD_COPY.company.placeholder}
                    />
                  </div>
                </div>
              </fieldset>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Save profile
              </Button>
            </div>
          </form>
        </ProfileSection>

        {/*
          Your chapter's own fields, every tier, with who sees each (#581).
          Behind the Directory's gate, like your pledge class above.
        */}
        <OwnCustomFieldsSection enabled={canViewMembers} />
      </div>
      <StandingPanels
        open={isCouncil ? null : openDoor}
        // Closes by the address's rule (#6048, spec § Addresses): Back when
        // this tab opened it, so Forward reopens it; else replaced away.
        // A New link's unconsumed `new=1` goes with the panel it asked for.
        onClose={() => closeAddress([STANDING_PARAM, NEW_INTENT_PARAM])}
      />
    </div>
  );
}
