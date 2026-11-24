import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  SCHOOL_SEARCH_MIN_LENGTH,
  schoolStepErrorCopy,
  useConfirmSchoolVerification,
  useSchoolSearch,
  useStartSchoolVerification,
  type SchoolSummary,
} from "@repo/hooks";
import { useDebouncedValue } from "@repo/hooks/use-debounced-value";
import { SignetTokens } from "@repo/theme/signet";
import {
  SCHOOL_CODE_LENGTH,
  SCHOOL_CODE_RESEND_SECONDS,
  SCHOOL_STEP_COPY,
  schoolCodeSentLine,
  schoolEmailPlaceholder,
  schoolResendWaitLine,
  schoolVerifiedLine,
} from "@repo/validation";
import { ChoiceRow } from "@/components/auth/choice-row";
import {
  OnboardingFieldLabel,
  OnboardingTextInput,
} from "@/components/onboarding/onboarding-field";
import {
  ONBOARDING_COLUMN_WIDTH,
  OnboardingPrimaryButton,
} from "@/components/onboarding/onboarding-primary-button";
import { OnboardingPressable } from "@/components/onboarding/onboarding-pressable";
import { KeyboardAvoidingArea } from "@/lib/keyboard";
import {
  MONO_FONT_FAMILY,
  fieldTypeRole,
  typeRole,
  useFrappTheme,
} from "@/lib/theme";

type Stage = "pick" | "email" | "code" | "done";

/**
 * "Where do you go to school?", s03's optional beat after the name (#5929;
 * `spec/behavior/onboarding.md` § After joining). The web's `/welcome` draws
 * the same stages in the same words (`apps/web/components/onboarding/school-step.tsx`):
 * pick the school, type its email, type the six-digit code from that email,
 * then "You're verified at <school>".
 *
 * Only an address on the school's own domain counts, proved by a code sent to
 * it, as Handshake, Discord Student Hubs and Slack's domain sign-up do. The
 * code field is sign-in's (`email-code-sign-in.tsx`): six digits typed,
 * pasted or filled from the email check themselves.
 *
 * One gold button per stage, pinned above the inset (the #3348 screen rules),
 * and `Not a student? Skip for now` as the quiet line under it. `onLeave`
 * runs for a skip, for a school that can't verify yet, and after done, when
 * it carries the school.
 *
 * Starting a council needs the check (#5933, `school-layer.md` § 5.3), so its
 * setup draws this step `required`: no skip, and a school that can't verify
 * yet ends the step there, with the setup's own back row (`header`) the way
 * out.
 */
export function SchoolStep({
  initialQuery,
  onLeave,
  busy = false,
  alreadyVerified = null,
  required = false,
  leaveLabel = SCHOOL_STEP_COPY.goToChat,
  header = null,
}: {
  /** The chapter's school name, so the member's school is usually first. */
  initialQuery: string;
  /** The school verified at, when the step ends on done; else `null`. */
  onLeave: (verified: SchoolSummary | null) => void;
  /** The screen behind is already leaving (notifications or chat next). */
  busy?: boolean;
  /**
   * A school the member just verified at, when they come back to this beat
   * (Android back from notifications): it opens on the verified line rather
   * than an empty search.
   */
  alreadyVerified?: SchoolSummary | null;
  /** No skip: the screen behind can't go on without a verified school. */
  required?: boolean;
  /** The gold button once verified: s03 goes on to chat. */
  leaveLabel?: string;
  /** Drawn above the title: a flow's own back row. */
  header?: ReactNode;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const [stage, setStage] = useState<Stage>(alreadyVerified ? "done" : "pick");
  const [query, setQuery] = useState(initialQuery);
  const [school, setSchool] = useState<SchoolSummary | null>(alreadyVerified);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const lastTried = useRef<string | null>(null);
  const codeRef = useRef<TextInput>(null);

  const debounced = useDebouncedValue(query, 250);
  const search = useSchoolSearch(debounced, { enabled: stage === "pick" });
  const start = useStartSchoolVerification();
  const confirm = useConfirmSchoolVerification();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send() {
    if (!school || start.isPending) return;
    const address = email.trim();
    if (!address.includes("@")) {
      setError(SCHOOL_STEP_COPY.notAnEmail);
      return;
    }
    setError(null);
    try {
      const sent = await start.mutateAsync({
        schoolId: school.id,
        email: address,
      });
      setSentTo(sent.email);
      setCode("");
      lastTried.current = null;
      setCooldown(sent.resend_after_seconds ?? SCHOOL_CODE_RESEND_SECONDS);
      setStage("code");
    } catch (caught) {
      setError(schoolStepErrorCopy(caught, SCHOOL_STEP_COPY.sendFailed));
    }
  }

  async function verify(value: string) {
    if (!school || confirm.isPending || value.length < SCHOOL_CODE_LENGTH) {
      return;
    }
    lastTried.current = value;
    setError(null);
    try {
      await confirm.mutateAsync({ schoolId: school.id, code: value });
      setStage("done");
    } catch (caught) {
      setError(schoolStepErrorCopy(caught, SCHOOL_STEP_COPY.verifyFailed));
      setCode("");
      codeRef.current?.focus();
    }
  }

  const trimmed = debounced.trim();
  const hasQuery = trimmed.length >= SCHOOL_SEARCH_MIN_LENGTH;
  const results = search.data ?? [];
  const notSetUp = stage === "pick" && school !== null && !school.verifiable;
  const title =
    stage === "done" && school
      ? schoolVerifiedLine(school.name)
      : SCHOOL_STEP_COPY.title;

  // The one gold button: what moves this stage on. A school that can't
  // verify yet ends a required step: there is nothing to go on to.
  const primary =
    stage === "done" || (notSetUp && !required) ? (
      <OnboardingPrimaryButton
        label={leaveLabel}
        busy={busy}
        disabled={busy}
        onPress={() => onLeave(stage === "done" ? school : null)}
      />
    ) : stage === "email" ? (
      <OnboardingPrimaryButton
        label={SCHOOL_STEP_COPY.sendCode}
        busy={start.isPending}
        disabled={start.isPending || busy}
        onPress={() => void send()}
      />
    ) : stage === "code" ? (
      <OnboardingPrimaryButton
        label={SCHOOL_STEP_COPY.verify}
        busy={confirm.isPending}
        disabled={confirm.isPending || busy || code.length < SCHOOL_CODE_LENGTH}
        onPress={() => void verify(code)}
      />
    ) : null;

  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "right", "bottom", "left"]}
    >
      <KeyboardAvoidingArea style={styles.flex} atScreenBottom>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scroll,
            header ? styles.scrollUnderHeader : null,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>

          {stage === "pick" ? (
            <View style={styles.stack}>
              <OnboardingTextInput
                value={query}
                onChangeText={(value) => {
                  setQuery(value);
                  setSchool(null);
                }}
                placeholder={SCHOOL_STEP_COPY.searchPlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel={SCHOOL_STEP_COPY.searchLabel}
              />
              {hasQuery && search.isError ? (
                <Text style={styles.muted}>
                  {SCHOOL_STEP_COPY.searchFailed}
                </Text>
              ) : null}
              {hasQuery && search.isSuccess && results.length === 0 ? (
                <Text style={styles.muted}>{SCHOOL_STEP_COPY.noMatch}</Text>
              ) : null}
              {results.map((row) => (
                <ChoiceRow
                  key={row.id}
                  title={row.name}
                  body={
                    row.short_name !== row.name ? row.short_name : undefined
                  }
                  dimmed={school !== null && school.id !== row.id}
                  onPress={() => {
                    setSchool(row);
                    setError(null);
                    if (row.verifiable) setStage("email");
                  }}
                />
              ))}
              {notSetUp ? (
                <Text style={styles.muted} accessibilityLiveRegion="polite">
                  {SCHOOL_STEP_COPY.notSetUp}
                </Text>
              ) : null}
            </View>
          ) : null}

          {(stage === "email" || stage === "code") && school ? (
            <View style={styles.stack}>
              <ChoiceRow
                title={school.name}
                body={
                  school.short_name !== school.name
                    ? school.short_name
                    : undefined
                }
                accessibilityHint={SCHOOL_STEP_COPY.change}
                trailing={
                  <Text style={styles.gold}>{SCHOOL_STEP_COPY.change}</Text>
                }
                onPress={() => {
                  setStage("pick");
                  setError(null);
                }}
              />
              {stage === "email" ? (
                <View style={styles.field}>
                  <OnboardingFieldLabel>
                    {SCHOOL_STEP_COPY.emailLabel}
                  </OnboardingFieldLabel>
                  <OnboardingTextInput
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value);
                      setError(null);
                    }}
                    placeholder={schoolEmailPlaceholder(school.email_domains)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    autoFocus
                    editable={!start.isPending}
                    accessibilityLabel={SCHOOL_STEP_COPY.emailLabel}
                    returnKeyType="send"
                    onSubmitEditing={() => void send()}
                  />
                </View>
              ) : (
                <View style={styles.field}>
                  <Text style={styles.muted}>{schoolCodeSentLine(sentTo)}</Text>
                  <OnboardingTextInput
                    ref={codeRef}
                    value={code}
                    onChangeText={(value) => {
                      const digits = value.replace(/\D/g, "");
                      setCode(digits);
                      setError(null);
                      // Six digits typed, pasted or filled is the answer;
                      // never the same wrong code twice.
                      if (
                        digits.length === SCHOOL_CODE_LENGTH &&
                        digits !== lastTried.current
                      ) {
                        void verify(digits);
                      }
                    }}
                    autoFocus
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    maxLength={10}
                    editable={!confirm.isPending}
                    accessibilityLabel={SCHOOL_STEP_COPY.codeLabel}
                    // A machine value read character by character, in mono.
                    style={styles.codeInput}
                  />
                  <View style={styles.codeActions}>
                    <OnboardingPressable
                      accessibilityRole="button"
                      onPress={() => {
                        setStage("email");
                        setCode("");
                        setError(null);
                      }}
                      quiet
                      style={styles.quietLine}
                    >
                      <Text style={styles.gold}>
                        {SCHOOL_STEP_COPY.useAnotherEmail}
                      </Text>
                    </OnboardingPressable>
                    <OnboardingPressable
                      accessibilityRole="button"
                      accessibilityState={{
                        disabled: cooldown > 0 || start.isPending,
                      }}
                      disabled={cooldown > 0 || start.isPending}
                      onPress={() => void send()}
                      quiet
                      style={styles.quietLine}
                    >
                      <Text style={cooldown > 0 ? styles.quiet : styles.gold}>
                        {cooldown > 0
                          ? schoolResendWaitLine(cooldown)
                          : SCHOOL_STEP_COPY.resend}
                      </Text>
                    </OnboardingPressable>
                  </View>
                </View>
              )}
            </View>
          ) : null}

          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {primary}
          {stage !== "done" && !notSetUp && !required ? (
            <OnboardingPressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => onLeave(null)}
              quiet
              style={styles.skip}
            >
              <Text style={styles.quiet}>{SCHOOL_STEP_COPY.skip}</Text>
            </OnboardingPressable>
          ) : null}
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
    // s03's column: as wide as the join and setup screens', centred on a
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
    // Under a flow's back row, the row starts the column where chapter
    // setup's does.
    scrollUnderHeader: {
      paddingTop: tokens.spacing.sm,
    },
    title: {
      ...typeRole(tokens.typography.role.headline),
      letterSpacing: -0.3,
      color: tokens.color.text.foreground,
    },
    stack: {
      marginTop: tokens.spacing.lg,
      gap: tokens.spacing.sm,
    },
    field: {
      marginTop: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    muted: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
    },
    codeInput: {
      minHeight: 56,
      ...fieldTypeRole(tokens.typography.role.title),
      fontFamily: MONO_FONT_FAMILY,
      letterSpacing: 8,
      textAlign: "center",
    },
    codeActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
    },
    quietLine: {
      minHeight: tokens.touch.minimum,
      alignItems: "center",
      justifyContent: "center",
    },
    gold: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.gold.house,
    },
    quiet: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.mutedForeground,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
    footer: {
      paddingHorizontal: tokens.spacing.xl,
      paddingVertical: tokens.spacing.lg,
    },
    skip: {
      alignSelf: "center",
      minHeight: tokens.touch.minimum,
      paddingHorizontal: tokens.spacing.lg,
      justifyContent: "center",
      marginTop: tokens.spacing.xs,
    },
  });
}
