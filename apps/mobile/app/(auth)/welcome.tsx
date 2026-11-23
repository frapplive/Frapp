import { useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { BackHandler, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  useChapterMajors,
  useCurrentUser,
  useFieldReveal,
  usePermissionList,
  useUpdateOnboarding,
  useUpdateUser,
} from "@repo/hooks";
import { formatPhone, formatPhoneInput } from "@repo/formatting";
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
import { AboutYouFields } from "@/components/onboarding/about-you-fields";
import { OnboardingQuietButton } from "@/components/onboarding/onboarding-quiet-button";
import {
  aboutYouPatch,
  applyEdit,
  draftFromProfile,
  hasChanges,
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
 * s03, the two screens after a member joins (`spec/ui/mobile/screens.md`,
 * #5627; Paul's pick 2026-11-19, "Two: name, then notifications"):
 *
 * 1. **How the chapter sees you**, always: the name, pre-filled when sign-in
 *    carried a real one (Apple or Google), and an optional photo. A name that
 *    is only the API's `Member` or the email before the `@` starts empty
 *    (`needsName` in `@repo/validation`); a typed name is required
 *    (`typedNameMissing`). Web shows the same
 *    screen after a join (`apps/web/app/(auth)/welcome`).
 * 2. **About you** (#5284), when phone, major, graduation year or birthday is
 *    empty (`needsAboutYou`): optional, the Edit sheet's fields and rules
 *    (`aboutYouPatch`). Continue saves only what changed; Skip for now saves
 *    nothing. Web asks the same after its name screen.
 * 3. **Turn on notifications**, when this build can push and push isn't on
 *    yet (`shouldOfferPrimer`, #2299). Either answer goes to chat; a "Not
 *    now" comes back once, days later, on the chat home (`usePushReminder`).
 *
 * The rest waits until the member wants it: chat display in Preferences,
 * roles in the Directory's Add roles, and Meet Frapp AI at the first use of
 * an AI feature (`useAiConsentGate`). They were three more beats here until
 * #5627.
 *
 * Which screen comes first waits on the push read only so the button can say
 * where it goes; nothing is drawn until the profile and push reads are back,
 * and a slow read is given up on after {@link DECIDE_TIMEOUT_MS}.
 *
 * Leaving PATCHes `has_completed_onboarding`, so the gate will not send the
 * member here again. One surface and one gold button pinned above the inset
 * on each screen (the #3348 screen rules).
 */
const DECIDE_TIMEOUT_MS = 4_000;

type Beat = "you" | "about" | "notifications";

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
  // `deciding` until the profile and push reads are back (or given up on).
  const [step, setStep] = useState<"deciding" | Beat>("deciding");
  const [waitedOut, setWaitedOut] = useState(false);
  const userQuery = useCurrentUser();
  const updateUser = useUpdateUser();
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
  // About you (#5284): shown when one of its fields is empty, decided from
  // the profile as it stands when the member leaves the name.
  const askAbout =
    profile !== null &&
    needsAboutYou({
      phone: profile.phone,
      major: profile.major,
      graduationYear: profile.graduationYear,
      birthdayMonth: profile.birthdayMonth,
      birthdayDay: profile.birthdayDay,
    });
  // What About you opened on (so a refetch underneath doesn't move it), what
  // was typed over it, and whether it was shown, for Android's back.
  const [aboutOriginal, setAboutOriginal] = useState<ProfileDraft | null>(null);
  const [aboutEdits, setAboutEdits] = useState<ProfileEdits | null>(null);
  const [aboutFailed, setAboutFailed] = useState(false);
  const [savingAbout, setSavingAbout] = useState(false);
  const reveal = useFieldReveal<ProfileDraftField>();
  const canViewMembers = can("members:view", usePermissionList());
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
  if (step === "deciding" && profileKnown && primerKnown) {
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
    if (askAbout && profile) {
      setAboutOriginal(draftFromProfile(profile));
      setStep("about");
    } else afterAbout();
  }

  // Notifications when there is one to ask, else chat.
  function afterAbout() {
    if (primer.showPrimer) setStep("notifications");
    else void finish();
  }

  function editAbout(field: ProfileDraftField, value: string) {
    if (!aboutOriginal) return;
    setAboutFailed(false);
    // The phone formats as it is typed (#5798), as on the Edit sheet.
    const next =
      field === "phone"
        ? formatPhoneInput(value, undefined, aboutShown?.phone ?? "").value
        : value;
    setAboutEdits((latest) => applyEdit(latest, aboutOriginal, field, next));
  }

  function leaveAboutField(field: ProfileDraftField) {
    reveal.blur(field);
    // A 7-digit local number reads `555-0142` once the member leaves it.
    const phone = aboutShown?.phone ?? "";
    if (field === "phone" && aboutOriginal && formatPhone(phone) !== phone) {
      const tidy = formatPhone(phone);
      setAboutEdits((latest) =>
        applyEdit(latest, aboutOriginal, "phone", tidy),
      );
    }
  }

  // Continue: only what changed, after the Edit sheet's checks; a refusal or
  // a failed save keeps the member here with the reason and what they typed.
  async function leaveAbout() {
    if (savingAbout || leaving || !aboutResult) return;
    if (!aboutResult.ok) {
      reveal.submit();
      return;
    }
    if (hasChanges(aboutResult.patch)) {
      setSavingAbout(true);
      setAboutFailed(false);
      try {
        await updateUser.mutateAsync(aboutResult.patch);
      } catch {
        setAboutFailed(true);
        return;
      } finally {
        setSavingAbout(false);
      }
    }
    afterAbout();
  }

  // Android's back steps back a screen (notifications to About you when it
  // was shown, else to the name; About you to the name), as a back gesture
  // between screens would; it never leaves onboarding half done. Held while
  // an answer is on its way out. The first screen leaves Android's back alone.
  const cameThroughAbout = aboutOriginal !== null;
  useEffect(() => {
    if (step !== "notifications" && step !== "about") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!answering) {
        setStep(step === "notifications" && cameThroughAbout ? "about" : "you");
      }
      return true;
    });
    return () => sub.remove();
  }, [step, answering, cameThroughAbout]);

  if (status === "unauthenticated") {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // Nothing drawn while the reads come back (usually a frame or two): no
  // spinner, and no screen that the next read would swap out.
  if (step === "deciding") {
    return <View style={styles.container} testID="welcome-deciding" />;
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
              {aboutFailed ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {ONBOARDING_ABOUT_COPY.saveFailed}
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
        One gold button per screen. On the name it moves on: to notifications
        when there is one to ask, else to chat. On notifications it asks, and
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
                  primer.showPrimer
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
                primer.showPrimer || askAbout
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
