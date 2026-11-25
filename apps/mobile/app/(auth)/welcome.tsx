import { useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { BackHandler, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  errorCopy,
  type OwnCustomField,
  ownCustomFieldDraft,
  ownCustomFieldFormChanges,
  ownCustomFieldTidied,
  useChapterMajors,
  useCurrentChapter,
  useCurrentUser,
  useFieldReveal,
  useOnboardingCustomFields,
  useMySchools,
  usePermissionList,
  useUpdateOnboarding,
  useUpdateOwnCustomFields,
  useUpdateUser,
  withoutField,
} from "@repo/hooks";
import { SignetTokens } from "@repo/theme/signet";
import {
  can,
  DISPLAY_NAME_MAX_LENGTH,
  ONBOARDING_ABOUT_COPY,
  ONBOARDING_PROFILE_ANSWERED_EVENT,
  NAME_LOCK_COPY,
  ONBOARDING_YOU_COPY,
  initialNameField,
  needsAboutYou,
  needsName,
  typedNameMissing,
  onboardingProfileAnsweredProperties,
} from "@repo/validation";
import {
  PUSH_ASK_TITLE,
  PushAskActions,
  PushAskBody,
} from "@/components/notifications/push-ask";
import { KeyboardAvoidingArea } from "@/lib/keyboard";
import {
  OnboardingFieldLabel,
  OnboardingTextInput,
} from "@/components/onboarding/onboarding-field";
import { ProfilePhoto } from "@/components/profile/profile-photo";
import { AboutYouCustomFields } from "@/components/onboarding/about-you-custom-fields";
import { AboutYouFields } from "@/components/onboarding/about-you-fields";
import { OnboardingQuietButton } from "@/components/onboarding/onboarding-quiet-button";
import { SchoolStep } from "@/components/onboarding/school-step";
import {
  aboutYouPatch,
  applyEdit,
  draftFromProfile,
  hasChanges,
  tidiedPhone,
  typedPhone,
  type ProfileDraft,
  type ProfileDraftField,
  type ProfileEdits,
} from "@/lib/more/edit-profile";
import {
  ONBOARDING_COLUMN_WIDTH,
  OnboardingPrimaryButton,
} from "@/components/onboarding/onboarding-primary-button";
import { useAuthSession } from "@/lib/auth-session";
import { initialsFor } from "@/lib/more/narrow";
import { selectViewerProfile } from "@/lib/more/profile";
import { markWelcomeDue } from "@/lib/onboarding/welcome-due";
import { usePushPrimer } from "@/lib/notifications/use-push-primer";
import { useLatestTrack } from "@/lib/use-latest-track";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * s03, the screens after a member joins (`spec/ui/mobile/screens.md`,
 * #5627; Paul's pick 2026-11-19, "Two: name, then notifications"):
 *
 * 1. **How the chapter sees you**, always: the name, pre-filled when sign-in
 *    carried a real one (Apple or Google), and an optional photo. A name that
 *    is only the API's `Member` or the email before the `@` starts empty
 *    (`needsName` in `@repo/validation`); a typed name is required
 *    (`typedNameMissing`). Web shows the same
 *    screen after a join (`apps/web/app/(auth)/welcome`).
 * 2. **About you** (#5284), when phone, major, graduation year or birthday is
 *    empty, or one of the chapter's required fields is (#5926,
 *    `needsAboutYou`): optional, the Edit sheet's fields and rules
 *    (`aboutYouPatch`), then the chapter's own fields behind a collapsed See
 *    more (`AboutYouCustomFields`).
 *    Continue saves only what changed; Skip for now saves nothing. Web asks
 *    the same after its name screen.
 * 3. **Where do you go to school?**, for a member with no verified school
 *    (#5929, `components/onboarding/school-step.tsx`): the school, its email,
 *    the code, then "You're verified at <school>", with "Not a student? Skip
 *    for now" throughout. Web asks the same after About you. Changed for
 *    #5929 by gampheadband, 2026-11-23: Paul's "Two: name, then
 *    notifications" gains this optional beat before notifications.
 * 4. **Turn on notifications**, when this build can push and push isn't on
 *    yet (`shouldOfferPrimer`, #2299). Either answer goes to chat; a "Not
 *    now" comes back once, days later, on the chat home (`usePushReminder`).
 *
 * The rest waits until the member wants it: chat display in Preferences,
 * roles in the Directory's Add roles, and Meet Frapp Intelligence at the first use of
 * an AI feature (`useAiConsentGate`). They were three more beats here until
 * #5627.
 *
 * Which screen comes first waits on the push read only so the button can say
 * where it goes; nothing is drawn until the profile, push and chapter-fields reads are back,
 * and a slow read is given up on after {@link DECIDE_TIMEOUT_MS}.
 *
 * Leaving PATCHes `has_completed_onboarding`, so the gate will not send the
 * member here again. One surface and one gold button pinned above the inset
 * on each screen (the #3348 screen rules).
 */
const DECIDE_TIMEOUT_MS = 4_000;

type Beat = "you" | "about" | "school" | "notifications";

export default function Welcome() {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const router = useRouter();
  const { status, chapterId } = useAuthSession();
  const queryClient = useQueryClient();
  const updateOnboarding = useUpdateOnboarding();
  const primer = usePushPrimer();
  const [leaving, setLeaving] = useState(false);
  // The guard itself, since two taps in one frame both read `leaving` false.
  const leavingRef = useRef(false);
  // `deciding` until the profile, push and chapter-fields reads are back (or given up on).
  const [step, setStep] = useState<"deciding" | Beat>("deciding");
  const [waitedOut, setWaitedOut] = useState(false);
  const userQuery = useCurrentUser();
  const updateUser = useUpdateUser();
  const mySchools = useMySchools();
  const chapter = useCurrentChapter();
  // Whether the school beat was shown, so back from notifications returns
  // to it rather than skipping over it (#5929).
  const [askedSchool, setAskedSchool] = useState(false);
  const profile = useMemo(
    () => selectViewerProfile(userQuery.data),
    [userQuery.data],
  );
  // Whether there was a photo when the screen opened, so its event can tell
  // a photo chosen on it from one the member already had.
  const [hadPhoto, setHadPhoto] = useState(false);
  const track = useLatestTrack();
  // `null` until typed in: the field shows the loaded name until then.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  // A member already settled in a chapter that locks names (#5801) keeps the
  // name they have: it shows read-only, and isn't sent.
  const nameLocked = profile?.nameLocked === true;
  const canViewMembers = can("members:view", usePermissionList());
  // The chapter's own fields (#5926), with the permission read they wait on
  // (`useOnboardingCustomFields`).
  const customFields = useOnboardingCustomFields();
  // About you (#5284): shown when one of its fields, or a required field of
  // the chapter's, is empty. This drives the name's button label; leaving
  // the name decides again once the fields are loaded (`leaveYou`). A failed
  // fields read asks from the profile alone.
  const aboutProfile = profile && {
    phone: profile.phone,
    major: profile.major,
    graduationYear: profile.graduationYear,
    birthdayMonth: profile.birthdayMonth,
    birthdayDay: profile.birthdayDay,
  };
  const askAbout =
    aboutProfile !== null &&
    needsAboutYou(aboutProfile, customFields.data ?? []);
  // What About you opened on (so a refetch underneath doesn't move it), what
  // was typed over it, and whether it was shown, for Android's back.
  const [aboutOriginal, setAboutOriginal] = useState<ProfileDraft | null>(null);
  const [aboutEdits, setAboutEdits] = useState<ProfileEdits | null>(null);
  // A failed save's reason: the server's refusal, or the connection line.
  const [aboutError, setAboutError] = useState<string | null>(null);
  const [savingAbout, setSavingAbout] = useState(false);
  const reveal = useFieldReveal<ProfileDraftField>();
  // The chapter's fields as About you opened on them, what was typed, and
  // each refusal, shown once Continue is pressed.
  const updateCustom = useUpdateOwnCustomFields();
  const [customOriginal, setCustomOriginal] = useState<OwnCustomField[] | null>(
    null,
  );
  const [customDraft, setCustomDraft] = useState<Record<string, string>>({});
  const [customProblems, setCustomProblems] = useState<Record<string, string>>(
    {},
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const chapterMajors = useChapterMajors({
    enabled: canViewMembers && step === "about",
  });
  const aboutShown: ProfileDraft | null = aboutOriginal
    ? { ...aboutOriginal, ...aboutEdits }
    : null;
  const aboutResult =
    aboutOriginal && aboutShown
      ? aboutYouPatch(aboutOriginal, aboutShown)
      : null;
  const aboutRefusal =
    aboutResult && !aboutResult.ok && reveal.shows(aboutResult.field)
      ? aboutResult
      : null;
  const nameValue = nameLocked
    ? (profile?.displayName ?? "")
    : (nameDraft ??
      initialNameField(profile?.displayName ?? null, profile?.email ?? null));

  async function finish() {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    try {
      await updateOnboarding.mutateAsync({ has_completed_onboarding: true });
    } catch {
      // Non-fatal — the next session re-offers s03 if the write never landed.
    }
    // The welcome card in the default channel shows once, for the member who
    // just came through here (#5627).
    // A profile read that never landed is asked once more here, so a slow
    // read can't cost the member the landing and the card.
    const idOf = (data: unknown) => (data as { id?: string } | undefined)?.id;
    const userId =
      idOf(userQuery.data) ??
      (await userQuery
        .refetch()
        .then((result) => idOf(result.data))
        .catch(() => undefined));
    if (userId) await markWelcomeDue(userId, chapterId);
    await queryClient.invalidateQueries({ queryKey: ["chapters"] });
    router.replace("/");
  }

  // Latched when Continue opens it, not re-derived from `showPrimer`: an
  // answer is stored before the OS dialog opens and before the PATCH, and
  // the step must stay on screen (busy) until the member has left for chat.
  const asking = step === "notifications";
  const answering = primer.isRequesting || leaving || savingName || savingAbout;

  useEffect(() => {
    const timer = setTimeout(() => setWaitedOut(true), DECIDE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const profileKnown =
    userQuery.data !== undefined || userQuery.isError || waitedOut;
  const primerKnown = primer.ready || waitedOut;
  // The name's button label waits on the chapter's fields too, permissions
  // first, so a read still loading isn't read as "nothing required" (#5926).
  const customKnown = customFields.settled || waitedOut;
  // Whether the school beat comes next waits on the member's schools too, so
  // a list still loading isn't read as "no school" (#5929).
  const schoolsKnown = mySchools.isFetched || mySchools.isError || waitedOut;
  const hasSchool = (mySchools.data?.length ?? 0) > 0;
  if (
    step === "deciding" &&
    profileKnown &&
    primerKnown &&
    customKnown &&
    schoolsKnown
  ) {
    setHadPhoto(!!profile?.photoUrl);
    setStep("you");
  }

  // Validated on Continue, not per keystroke. A name that didn't change isn't
  // sent again; one that did is saved before the member moves on, so a
  // failure keeps them here with the reason rather than losing the name.
  async function leaveYou() {
    if (savingName || leaving) return;
    const name = nameValue.trim();
    if (!nameLocked && typedNameMissing(name)) {
      setNameError(ONBOARDING_YOU_COPY.nameRequired);
      return;
    }
    const nameChanged =
      !nameLocked && name !== (profile?.displayName ?? "").trim();
    if (nameChanged) {
      setSavingName(true);
      try {
        await updateUser.mutateAsync({ display_name: name });
      } catch {
        setNameError(ONBOARDING_YOU_COPY.saveFailed);
        return;
      } finally {
        setSavingName(false);
      }
    }
    track(
      ONBOARDING_PROFILE_ANSWERED_EVENT,
      onboardingProfileAnsweredProperties({
        hadPhoto,
        hasPhoto: !!profile?.photoUrl,
        hadName: !needsName(profile?.displayName, profile?.email ?? null),
        nameChanged,
      }),
    );
    // Decided with the chapter's fields loaded (or given up on), never from
    // a read still on its way (#5926).
    setSavingName(true);
    const fields = await customFields.load();
    setSavingName(false);
    if (aboutProfile && profile && needsAboutYou(aboutProfile, fields)) {
      // Seeded once there is something to seed: a return here from the name
      // keeps what was typed, and an empty first read is filled in later.
      if (!customOriginal || customOriginal.length === 0) {
        setCustomOriginal(fields);
        setCustomDraft(ownCustomFieldDraft(fields));
      }
      setAboutOriginal(draftFromProfile(profile));
      setStep("about");
    } else afterAbout();
  }

  // Notifications when there is one to ask, else chat.
  function afterAbout() {
    // A member already verified at a school isn't asked again; a failed or
    // given-up read asks, since the beat can be skipped (#5929).
    if (askedSchool || !hasSchool) {
      setAskedSchool(true);
      setStep("school");
      return;
    }
    leaveSchool();
  }

  function leaveSchool() {
    if (primer.showPrimer) setStep("notifications");
    else void finish();
  }

  function editAbout(field: ProfileDraftField, value: string) {
    if (!aboutOriginal) return;
    setAboutError(null);
    // The phone formats as it is typed (#5798), as on the Edit sheet.
    const next =
      field === "phone" ? typedPhone(value, aboutShown?.phone ?? "") : value;
    setAboutEdits((latest) => applyEdit(latest, aboutOriginal, field, next));
  }

  function leaveAboutField(field: ProfileDraftField) {
    reveal.blur(field);
    // A 7-digit local number reads `555-0142` once the member leaves it.
    const tidy =
      field === "phone" ? tidiedPhone(aboutShown?.phone ?? "") : null;
    if (tidy !== null && aboutOriginal) {
      setAboutEdits((latest) =>
        applyEdit(latest, aboutOriginal, "phone", tidy),
      );
    }
  }

  function editCustom(field: OwnCustomField, value: string) {
    setAboutError(null);
    setCustomProblems((prev) => withoutField(prev, field.field_id));
    setCustomDraft((prev) => ({ ...prev, [field.field_id]: value }));
  }

  // A number reads (518) 555-0142 once the member leaves it, as on the You
  // tab's More details.
  function leaveCustom(field: OwnCustomField) {
    setCustomDraft((prev) => {
      const typed = prev[field.field_id] ?? "";
      const tidy = ownCustomFieldTidied(field, typed);
      return tidy === typed ? prev : { ...prev, [field.field_id]: tidy };
    });
  }

  // Continue: only what changed, after the Edit sheet's checks and the
  // chapter's field rules (`ownCustomFieldFormChanges`); a refusal or a
  // failed save keeps the member here with the reason and what they typed.
  // A required field left empty waits for later, as on the You tab.
  async function leaveAbout() {
    if (savingAbout || leaving || !aboutResult) return;
    const custom = ownCustomFieldFormChanges(customOriginal ?? [], customDraft);
    const refused = Object.keys(custom.problems);
    if (!aboutResult.ok || refused.length > 0) {
      if (!aboutResult.ok) reveal.submit();
      setCustomProblems(custom.problems);
      // A refusal behind See more opens it, so the reason shows.
      if (refused.length > 0) setMoreOpen(true);
      return;
    }
    const profileChanged = hasChanges(aboutResult.patch);
    if (profileChanged || custom.values.length > 0) {
      setSavingAbout(true);
      setAboutError(null);
      try {
        if (profileChanged) {
          await updateUser.mutateAsync(aboutResult.patch);
          // What was saved is the new baseline, so a return here from
          // notifications, or a retry after the fields fail, compares
          // against it: clearing a saved field then sends the clear rather
          // than reading as no change.
          if (aboutShown) setAboutOriginal(aboutShown);
          setAboutEdits(null);
        }
        if (custom.values.length > 0) {
          // The answer is all the member's fields, the new baseline.
          setCustomOriginal(await updateCustom.mutateAsync(custom.values));
        }
      } catch (error) {
        // A refused value names its field and why (a choice an officer
        // removed since the step opened); anything else is the connection.
        setAboutError(
          errorCopy(error, ONBOARDING_ABOUT_COPY.saveFailed, {
            serverWritesForMembers: true,
          }),
        );
        return;
      } finally {
        setSavingAbout(false);
      }
    }
    afterAbout();
  }

  // Android's back steps back a screen, to whichever beat came before
  // (notifications to the school beat, About you or the name; the school beat
  // to About you or the name; About you to the name), as a back gesture
  // between screens would; it never leaves onboarding half done. Held while
  // an answer is on its way out. The first screen leaves Android's back alone.
  const cameThroughAbout = aboutOriginal !== null;
  useEffect(() => {
    if (step === "deciding" || step === "you") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!answering) {
        const before =
          step === "notifications" && askedSchool
            ? "school"
            : step !== "about" && cameThroughAbout
              ? "about"
              : "you";
        setStep(before);
      }
      return true;
    });
    return () => sub.remove();
  }, [step, answering, cameThroughAbout, askedSchool]);

  if (status === "unauthenticated") {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // Nothing drawn while the reads come back (usually a frame or two): no
  // spinner, and no screen that the next read would swap out.
  if (step === "deciding") {
    return <View style={styles.container} testID="welcome-deciding" />;
  }

  if (step === "school") {
    return (
      <SchoolStep
        initialQuery={chapter.data?.university ?? ""}
        alreadyVerified={mySchools.data?.[0]?.school ?? null}
        busy={leaving}
        onLeave={leaveSchool}
      />
    );
  }

  return (
    // Safe area on every edge (#3345): `(auth)` renders with `headerShown:
    // false`, and Android draws the app edge to edge, so nothing else keeps
    // this screen off the status bar or its last control off the swipe bar.
    <SafeAreaView
      style={styles.container}
      edges={["top", "right", "bottom", "left"]}
    >
      {/* The name field opens the keyboard, which must not cover it or the
          pinned Continue (#3354). */}
      <KeyboardAvoidingArea style={styles.flex} atScreenBottom>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {asking ? (
            <>
              <Text accessibilityRole="header" style={styles.title}>
                {PUSH_ASK_TITLE}
              </Text>
              <View style={styles.channels}>
                <PushAskBody />
              </View>
            </>
          ) : step === "about" && aboutShown ? (
            <>
              <Text accessibilityRole="header" style={styles.title}>
                {ONBOARDING_ABOUT_COPY.title}
              </Text>
              <Text style={styles.subtitle}>{ONBOARDING_ABOUT_COPY.lede}</Text>
              <AboutYouFields
                draft={aboutShown}
                onEdit={editAbout}
                onLeave={leaveAboutField}
                refusal={aboutRefusal}
                majors={chapterMajors}
                editable={!answering}
              />
              <AboutYouCustomFields
                fields={customOriginal ?? []}
                open={moreOpen}
                onToggle={() => setMoreOpen((open) => !open)}
                draft={customDraft}
                problems={customProblems}
                onEdit={editCustom}
                onLeave={leaveCustom}
                editable={!answering}
              />
              {aboutError ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {aboutError}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text accessibilityRole="header" style={styles.title}>
                {ONBOARDING_YOU_COPY.title}
              </Text>
              <Text style={styles.subtitle}>{ONBOARDING_YOU_COPY.lede}</Text>
              <View style={styles.photo}>
                <ProfilePhoto
                  photoUrl={profile?.photoUrl ?? null}
                  fetchedAt={userQuery.dataUpdatedAt}
                  initials={initialsFor(nameValue.trim() || null)}
                />
              </View>
              <View style={styles.nameField}>
                <OnboardingFieldLabel>
                  {ONBOARDING_YOU_COPY.nameLabel}
                </OnboardingFieldLabel>
                <OnboardingTextInput
                  value={nameValue}
                  onChangeText={(value) => {
                    setNameDraft(value);
                    setNameError(null);
                  }}
                  placeholder={ONBOARDING_YOU_COPY.namePlaceholder}
                  maxLength={DISPLAY_NAME_MAX_LENGTH}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="name"
                  textContentType="name"
                  accessibilityLabel={ONBOARDING_YOU_COPY.nameLabel}
                  editable={!savingName && !leaving && !nameLocked}
                  returnKeyType="done"
                  onSubmitEditing={() => void leaveYou()}
                />
                {nameLocked ? (
                  <Text style={styles.hint}>{NAME_LOCK_COPY.lockedLine}</Text>
                ) : nameError ? (
                  <Text style={styles.error} accessibilityLiveRegion="polite">
                    {nameError}
                  </Text>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>

        {/*
        One gold button per screen. On the name it moves on: to About you or
        the school beat when either is asked, else to notifications when there
        is one to ask, else to chat. On notifications it asks, and
        Not now is the quiet line under it; either answer leaves for chat,
        after the OS dialog closes.
      */}
        <View style={styles.footer}>
          {asking ? (
            <PushAskActions
              action={primer.action}
              busy={answering}
              onTurnOn={() => {
                void primer.turnOn().then((outcome) => {
                  if (outcome !== null) void finish();
                });
              }}
              onNotNow={() => {
                void primer.notNow().then((answered) => {
                  if (answered) void finish();
                });
              }}
            />
          ) : step === "about" ? (
            <>
              <OnboardingPrimaryButton
                label={
                  primer.showPrimer || askedSchool || !hasSchool
                    ? ONBOARDING_ABOUT_COPY.continue
                    : ONBOARDING_ABOUT_COPY.goToChat
                }
                disabled={answering}
                busy={answering}
                onPress={() => void leaveAbout()}
              />
              <OnboardingQuietButton
                label={ONBOARDING_ABOUT_COPY.skip}
                disabled={answering}
                onPress={afterAbout}
              />
            </>
          ) : (
            <OnboardingPrimaryButton
              label={
                primer.showPrimer || askAbout || askedSchool || !hasSchool
                  ? ONBOARDING_YOU_COPY.continue
                  : ONBOARDING_YOU_COPY.goToChat
              }
              disabled={answering}
              busy={answering}
              onPress={() => void leaveYou()}
            />
          )}
        </View>
      </KeyboardAvoidingArea>
    </SafeAreaView>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.color.surface.background,
    },
    flex: { flex: 1 },
    // One column, as wide as the join and setup screens', centred on a
    // tablet.
    scroll: {
      width: "100%",
      maxWidth: ONBOARDING_COLUMN_WIDTH + tokens.spacing.xl * 2,
      alignSelf: "center",
      paddingHorizontal: tokens.spacing.xl,
      paddingTop: tokens.spacing["3xl"],
      paddingBottom: tokens.spacing.lg,
      gap: tokens.spacing.sm,
    },
    title: {
      ...typeRole(tokens.typography.role.headline),
      letterSpacing: -0.3,
      color: tokens.color.text.foreground,
    },
    subtitle: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
    },
    channels: {
      marginTop: tokens.spacing.lg,
    },
    photo: {
      marginTop: tokens.spacing.xl,
      alignItems: "center",
    },
    nameField: {
      marginTop: tokens.spacing.xl,
      gap: tokens.spacing.xs,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
    hint: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    footer: {
      paddingHorizontal: tokens.spacing.xl,
      paddingVertical: tokens.spacing.lg,
    },
  });
}
