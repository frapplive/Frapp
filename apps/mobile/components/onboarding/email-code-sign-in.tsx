import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  cooldownCopy,
  describeEmailSendError,
  EMAIL_CODE_COPY,
  EMAIL_RESEND_COOLDOWN_SECONDS,
  emailCooldownSeconds,
} from "@repo/hooks/auth-error-copy";
import { SignetTokens } from "@repo/theme/signet";
import { EmailCodeStep } from "@/components/onboarding/email-code-step";
import {
  OnboardingFieldLabel,
  OnboardingTextInput,
} from "@/components/onboarding/onboarding-field";
import { OnboardingPrimaryButton } from "@/components/onboarding/onboarding-primary-button";
import { OnboardingPressable } from "@/components/onboarding/onboarding-pressable";
import { useAuthSession } from "@/lib/auth-session";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * Continue with email on the invite card (#5625), the phone's twin of web's
 * (`apps/web/components/join/email-code-sign-in.tsx`): one address, then the
 * six-digit code from the email typed right here (`EmailCodeStep`), so nobody
 * leaves the app for Mail and back (Slack's and Notion's sign-in work the
 * same way). A new address works too: Auth makes the account on the first
 * code. Every Auth email carries only the code since #6134.
 *
 * `onSending` runs before the email goes, so the card can remember what the
 * member came to do should the link production's transition-era template
 * still prints bring them back instead.
 */
export function EmailCodeSignIn({
  onSending,
  onCodeSent,
  onCodeVerified,
  onBack,
  disabled = false,
}: {
  onSending: () => void;
  /** The email went out (the invite card's funnel, #5663). */
  onCodeSent?: () => void;
  /** The code was right (the invite card's funnel, #5663). */
  onCodeVerified?: () => void;
  onBack: () => void;
  disabled?: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const { sendEmailCode } = useAuthSession();
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrival, setArrival] = useState<{
    cooldown: number;
    notice: string | null;
  }>({ cooldown: 0, notice: null });
  const address = email.trim().toLowerCase();

  async function requestCode(): Promise<void> {
    onSending();
    await sendEmailCode({ email: address });
    onCodeSent?.();
  }

  async function send() {
    if (sending) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError(EMAIL_CODE_COPY.invalidEmail);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await requestCode();
      setArrival({ cooldown: EMAIL_RESEND_COOLDOWN_SECONDS, notice: null });
      setStage("code");
    } catch (caught) {
      const wait = emailCooldownSeconds(caught);
      if (wait !== undefined) {
        // One went out under a minute ago; its code still works.
        setArrival({ cooldown: Math.max(1, wait), notice: cooldownCopy(wait) });
        setStage("code");
        return;
      }
      setError(describeEmailSendError(caught));
    } finally {
      setSending(false);
    }
  }

  if (stage === "email") {
    return (
      <View style={styles.column}>
        <View style={styles.field}>
          <OnboardingFieldLabel>Email</OnboardingFieldLabel>
          <OnboardingTextInput
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setError(null);
            }}
            placeholder="you@university.edu"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            autoFocus
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="send"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => void send()}
            editable={!disabled && !sending}
            accessibilityLabel="Email"
          />
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <OnboardingPrimaryButton
          label={EMAIL_CODE_COPY.sendLabel}
          busy={sending}
          disabled={disabled || sending}
          onPress={() => void send()}
        />
        <OnboardingPressable
          accessibilityRole="button"
          disabled={sending}
          onPress={onBack}
          quiet
          style={styles.quietLine}
        >
          <Text style={styles.quietText}>Back</Text>
        </OnboardingPressable>
      </View>
    );
  }

  return (
    <EmailCodeStep
      email={address}
      screen="/join"
      title={EMAIL_CODE_COPY.sentTitle}
      initialCooldownSeconds={arrival.cooldown}
      initialNotice={arrival.notice}
      resend={requestCode}
      // Signed in: the session change carries the card on from here.
      onVerified={onCodeVerified}
      backLabel={EMAIL_CODE_COPY.differentEmail}
      onBack={() => setStage("email")}
      disabled={disabled}
    />
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    column: {
      gap: tokens.spacing.md,
    },
    field: {
      gap: tokens.spacing.sm,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
    quietLine: {
      minHeight: tokens.touch.minimum,
      alignItems: "center",
      justifyContent: "center",
    },
    quietText: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.mutedForeground,
    },
  });
}
