import { useRef, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useQueryClient } from "@tanstack/react-query";
import { errorCopy } from "@repo/hooks/error-copy";
import {
  CHANNEL_LIST_KEY,
  councilStepErrorCopy,
  useCreateCouncil,
  useMySchools,
} from "@repo/hooks";
import { SignetTokens } from "@repo/theme/signet";
import {
  COUNCIL_CUSTOM_TITLE_KEY,
  COUNCIL_NAME_MAX,
  COUNCIL_PROFILES,
  COUNCIL_TITLE_MAX,
  SCHOOL_STEP_COPY,
} from "@repo/validation";
import { TermsAcceptance } from "@/components/auth/terms-acceptance";
import { ChoiceRow, ChoiceRowSkeleton } from "@/components/auth/choice-row";
import { BackRow } from "@/components/back-row";
import { OptionSheet } from "@/components/option-sheet";
import { SkeletonRegion } from "@/components/state-block";
import { SchoolStep } from "@/components/onboarding/school-step";
import {
  SignedInAs,
  useOnboardingSignOut,
} from "@/components/onboarding/signed-in-as";
import {
  OnboardingFieldLabel,
  OnboardingTextInput,
} from "@/components/onboarding/onboarding-field";
import {
  ONBOARDING_COLUMN_WIDTH,
  OnboardingPrimaryButton,
} from "@/components/onboarding/onboarding-primary-button";
import { OnboardingPressable } from "@/components/onboarding/onboarding-pressable";
import { useAuthSession } from "@/lib/auth-session";
import { useHoldSwipeBack } from "@/lib/back-target";
import { successHaptic } from "@/lib/haptics";
import { KeyboardAvoidingArea } from "@/lib/keyboard";
import {
  COUNCIL_FORM_COPY,
  EMPTY_COUNCIL_DRAFT,
  councilCreateBody,
  councilDraftComplete,
  councilDraftProblem,
  councilSteps,
  councilTitleChoices,
  councilTitleValue,
  councilTypeChoices,
  createCouncilLabel,
  openCouncilLabel,
  withCouncilName,
  withCouncilSchool,
  withCouncilType,
  type CouncilDraft,
  type CouncilStep,
} from "@/lib/onboarding/council-form";
import { stepFadeIn } from "@/lib/onboarding/step-fade";
import { useBackToClose } from "@/lib/overlay";
import { useSelectChapter } from "@/lib/select-chapter";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * Start a council (#5933; `spec/architecture/school-layer.md` § 5.3): a
 * council is a tenant like a chapter (ADR-27), so its setup is chapter
 * setup's sibling, on the same route (`/create-chapter?kind=council`) and in
 * the same language: one column, a house-gold `‹ Back` with progress ticks,
 * each step's title, and one gold button pinned above the inset.
 *
 * The steps, as Discord's Create a server asks them (what kind, then name
 * it), after the one thing a council needs first:
 *
 * 1. **Verify** (only with no verified school): s03's school-email check
 *    (`SchoolStep`), required here, because only a student verified at the
 *    school may start its council (§ 5.3 rule 4). Several schools are a pick
 *    instead; one is taken as given.
 * 2. **Type**: the five profiles, each its name over its one line; a tap
 *    moves on, as a directory row does on chapter setup's find step.
 * 3. **Details**: the name, offered as "<school> <type>" until typed over,
 *    the founder's own title from the type's seeded titles plus "Something
 *    else" (an `OptionSheet`; "Something else" opens a field), and the Terms
 *    checkbox. Create names the council.
 *
 * On success the new council becomes the active tenant the way a new
 * chapter does (`useSelectChapter`: activate, then refresh the session), and
 * the founder lands on its home (the Activity tab draws it for a council).
 * A council made whose switch failed stays here with the button reading
 * Open, so a retry never makes a second council.
 */
export function CreateCouncil() {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const router = useRouter();
  const { status } = useAuthSession();
  const queryClient = useQueryClient();
  const selectChapter = useSelectChapter();
  const createCouncil = useCreateCouncil();
  const { signOut, signingOut } = useOnboardingSignOut();
  const mySchools = useMySchools();
  const titleSheetRef = useRef<BottomSheetModal>(null);

  // The steps are fixed by the first answer about the founder's schools, so
  // verifying one mid-flow doesn't reshape the ticks under them.
  const [plan, setPlan] = useState<CouncilStep[] | null>(null);
  const [step, setStep] = useState<CouncilStep | null>(null);
  const [draft, setDraft] = useState<CouncilDraft>(EMPTY_COUNCIL_DRAFT);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // Set once the council exists: from then on the button opens it rather
  // than making another.
  const [createdId, setCreatedId] = useState<string | null>(null);

  const schools = mySchools.data;
  if (plan === null && schools) {
    const steps = councilSteps(schools.length);
    setPlan(steps);
    setStep(steps[0]!);
    if (schools.length === 1) {
      setDraft((prev) => withCouncilSchool(prev, schools[0]!.school));
    }
  }

  const locked = running || signingOut;
  const index = plan && step ? plan.indexOf(step) : -1;
  const created = createdId !== null;

  function leave() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/join");
    }
  }

  function goBack() {
    if (locked) return;
    setError(null);
    if (plan && index > 0 && !created) {
      setStep(plan[index - 1]!);
    } else {
      leave();
    }
  }

  // Android back steps back through the steps, which are one route; the iOS
  // swipe can't, so it is held where it would drop what was entered
  // (navigation.md § Going back), as chapter setup holds it.
  useBackToClose(index > 0, goBack);
  useHoldSwipeBack(index > 0);

  async function submit() {
    if (locked) return;
    const problem = councilDraftProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    const body = councilCreateBody(draft);
    if (!body || !acceptedLegal) return;
    setError(null);
    setRunning(true);
    try {
      const id = createdId ?? (await createCouncil.mutateAsync(body)).id;
      setCreatedId(id);
      if (!(await selectChapter(id))) {
        setError(COUNCIL_FORM_COPY.openFailed);
        return;
      }
      // Keyed without the tenant, so a list read before the council existed
      // would stand in for its seeded channels (as chapter setup drops it).
      queryClient.removeQueries({ queryKey: CHANNEL_LIST_KEY });
      // The auth gate reads the member's list: until it holds the council, a
      // founder who had no chapter still reads as one, and the tabs would
      // send them back to s02. Chapter setup's later steps give the list
      // time to come back; this lands at once, so it waits for it. A failed
      // read fails open in the gate, so it isn't fatal here.
      await queryClient
        .refetchQueries({ queryKey: ["chapters"] })
        .catch(() => undefined);
      successHaptic();
      router.dismissTo("/activity");
    } catch (caught) {
      setError(councilStepErrorCopy(caught, COUNCIL_FORM_COPY.createFailed));
    } finally {
      setRunning(false);
    }
  }

  if (status === "unauthenticated") {
    return <Redirect href="/(auth)/sign-in" />;
  }

  const backRow = (trailing: boolean) => (
    <BackRow
      house
      label="Back"
      accessibilityLabel="Back"
      disabled={locked}
      onPress={goBack}
      trailing={
        trailing && plan && index >= 0 ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={COUNCIL_FORM_COPY.progress}
            accessibilityValue={{ min: 1, max: plan.length, now: index + 1 }}
            style={styles.progressRow}
          >
            {plan.map((item, at) => (
              <View
                key={item}
                style={[
                  styles.progressTick,
                  at <= index ? styles.progressTickOn : null,
                ]}
              />
            ))}
          </View>
        ) : null
      }
    />
  );

  // No verified school: s03's check, the whole screen, with this flow's back
  // row over it. It leaves with the school it verified.
  if (step === "verify") {
    return (
      <SchoolStep
        initialQuery=""
        required
        leaveLabel={SCHOOL_STEP_COPY.continue}
        header={<View style={styles.header}>{backRow(true)}</View>}
        onLeave={(verified) => {
          if (!verified) return;
          setDraft((prev) => withCouncilSchool(prev, verified));
          setStep("type");
        }}
      />
    );
  }

  const profile = draft.type ? COUNCIL_PROFILES[draft.type] : null;
  const title =
    step === "school"
      ? COUNCIL_FORM_COPY.schoolTitle
      : step === "details"
        ? COUNCIL_FORM_COPY.detailsTitle
        : COUNCIL_FORM_COPY.typeTitle;
  const titleValue = councilTitleValue(draft);
  const custom = draft.titleKey === COUNCIL_CUSTOM_TITLE_KEY;
  const canSubmit = councilDraftComplete(draft) && acceptedLegal;

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top", "right", "bottom", "left"]}
    >
      <KeyboardAvoidingArea style={styles.flex} atScreenBottom>
        <View style={styles.container}>
          <View style={styles.header}>{backRow(true)}</View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <SignedInAs
              signOut={signOut}
              signingOut={signingOut}
              disabled={running}
            />

            <Animated.View
              key={step ?? "loading"}
              entering={stepFadeIn(tokens)}
              style={styles.stack}
            >
              {/* No title until the first step is known: it may be the
                  school check, whose screen draws its own. */}
              {step !== null ? (
                <Text accessibilityRole="header" style={styles.title}>
                  {title}
                </Text>
              ) : null}

              {step === null ? (
                mySchools.isError ? (
                  <View style={styles.centerRow}>
                    <Text style={[styles.errorText, styles.flex]}>
                      {errorCopy(
                        mySchools.error,
                        "Couldn't load your schools. Check your connection and try again.",
                      )}
                    </Text>
                    <OnboardingPressable
                      accessibilityRole="button"
                      onPress={() => {
                        void mySchools.refetch();
                      }}
                      quiet
                      style={styles.textButton}
                    >
                      <Text style={styles.textButtonText}>Retry</Text>
                    </OnboardingPressable>
                  </View>
                ) : (
                  // The choice rows the first step lands as, in their spacing.
                  <SkeletonRegion
                    label="Loading your schools"
                    style={styles.stack}
                  >
                    {[0, 1, 2].map((at) => (
                      <ChoiceRowSkeleton key={at} index={at} />
                    ))}
                  </SkeletonRegion>
                )
              ) : null}

              {step === "school"
                ? (schools ?? []).map(({ school }) => (
                    <ChoiceRow
                      key={school.id}
                      title={school.name}
                      body={
                        school.short_name !== school.name
                          ? school.short_name
                          : undefined
                      }
                      onPress={() => {
                        setDraft((prev) => withCouncilSchool(prev, school));
                        setStep("type");
                      }}
                    />
                  ))
                : null}

              {step === "type"
                ? councilTypeChoices().map((choice) => (
                    <ChoiceRow
                      key={choice.type}
                      title={choice.label}
                      body={choice.description}
                      onPress={() => {
                        setError(null);
                        setDraft((prev) => withCouncilType(prev, choice.type));
                        setStep("details");
                      }}
                    />
                  ))
                : null}

              {step === "details" && profile ? (
                <View style={styles.stack}>
                  {/* What was picked, and the way back to change it. */}
                  <ChoiceRow
                    title={profile.label}
                    body={draft.school?.name}
                    disabled={locked || created}
                    accessibilityHint="Goes back to the kinds of council."
                    trailing={<Text style={styles.gold}>Change</Text>}
                    onPress={() => {
                      setError(null);
                      setStep("type");
                    }}
                  />
                  <View style={styles.field}>
                    <OnboardingFieldLabel>
                      {COUNCIL_FORM_COPY.nameLabel}
                    </OnboardingFieldLabel>
                    <OnboardingTextInput
                      value={draft.name}
                      onChangeText={(value) => {
                        setError(null);
                        setDraft((prev) => withCouncilName(prev, value));
                      }}
                      autoCapitalize="words"
                      autoCorrect={false}
                      maxLength={COUNCIL_NAME_MAX}
                      editable={!locked && !created}
                      accessibilityLabel={COUNCIL_FORM_COPY.nameLabel}
                      returnKeyType="done"
                    />
                  </View>
                  <View style={styles.field}>
                    <OnboardingFieldLabel>
                      {COUNCIL_FORM_COPY.titleLabel}
                    </OnboardingFieldLabel>
                    <ChoiceRow
                      title={titleValue ?? COUNCIL_FORM_COPY.titlePlaceholder}
                      disabled={locked || created}
                      accessibilityHint="Opens the titles to pick yours from."
                      onPress={() => titleSheetRef.current?.present()}
                    />
                  </View>
                  {custom ? (
                    <View style={styles.field}>
                      <OnboardingFieldLabel>
                        {COUNCIL_FORM_COPY.customTitleLabel}
                      </OnboardingFieldLabel>
                      <OnboardingTextInput
                        value={draft.customTitle}
                        onChangeText={(value) => {
                          setError(null);
                          setDraft((prev) => ({ ...prev, customTitle: value }));
                        }}
                        placeholder={COUNCIL_FORM_COPY.customTitlePlaceholder}
                        autoCapitalize="words"
                        autoCorrect={false}
                        autoFocus
                        maxLength={COUNCIL_TITLE_MAX}
                        editable={!locked && !created}
                        accessibilityLabel={COUNCIL_FORM_COPY.customTitleLabel}
                        returnKeyType="done"
                      />
                    </View>
                  ) : null}
                  {/*
                    The founder's acceptance for the council and for
                    themselves, as chapter setup's color step carries it.
                  */}
                  <TermsAcceptance
                    accepted={acceptedLegal}
                    onAcceptedChange={setAcceptedLegal}
                  />
                </View>
              ) : null}
            </Animated.View>

            {error ? (
              <Text accessibilityLiveRegion="polite" style={styles.errorText}>
                {error}
              </Text>
            ) : null}
          </ScrollView>

          {step === "details" ? (
            <View style={styles.footer}>
              <OnboardingPrimaryButton
                label={
                  created
                    ? openCouncilLabel(draft.name)
                    : createCouncilLabel(draft.name)
                }
                onPress={() => {
                  void submit();
                }}
                disabled={!canSubmit || locked}
                busy={running}
              />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingArea>
      {draft.type ? (
        <OptionSheet
          ref={titleSheetRef}
          title={COUNCIL_FORM_COPY.titleLabel}
          options={councilTitleChoices(draft.type)}
          selected={draft.titleKey}
          onSelect={(value) => {
            setError(null);
            setDraft((prev) => ({ ...prev, titleKey: value }));
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    flex: { flex: 1 },
    safeArea: {
      flex: 1,
      backgroundColor: tokens.color.surface.background,
    },
    container: {
      flex: 1,
      width: "100%",
      maxWidth: ONBOARDING_COLUMN_WIDTH + tokens.spacing.xl * 2,
      alignSelf: "center",
      paddingHorizontal: tokens.spacing.xl,
    },
    // Chapter setup's header: `BackRow` spans the column, its ticks take the
    // width the `‹ Back` leaves.
    header: {
      minHeight: tokens.touch.minimum,
      justifyContent: "center",
      marginTop: tokens.spacing.sm,
      marginBottom: tokens.spacing.xs,
    },
    progressRow: {
      flex: 1,
      flexDirection: "row",
      gap: tokens.spacing.xs,
      marginLeft: tokens.spacing.lg,
    },
    progressTick: {
      flex: 1,
      height: 4,
      borderRadius: tokens.radius.control,
      backgroundColor: tokens.color.border.hairline,
    },
    progressTickOn: {
      backgroundColor: tokens.color.gold.house,
    },
    scroll: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.lg,
    },
    title: {
      ...typeRole(tokens.typography.role.headline),
      letterSpacing: -0.3,
      color: tokens.color.text.foreground,
    },
    stack: {
      gap: tokens.spacing.md,
    },
    field: { gap: tokens.spacing.sm },
    centerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    errorText: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
    gold: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.gold.house,
    },
    textButton: {
      alignSelf: "flex-start",
      minHeight: tokens.touch.minimum,
      justifyContent: "center",
    },
    textButtonText: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.gold.askText,
    },
    footer: {
      paddingVertical: tokens.spacing.lg,
    },
  });
}
