import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import {
  cooldownCopy,
  describeEmailCodeError,
  describeEmailSendError,
  EMAIL_CODE_COPY,
  EMAIL_CODE_LENGTH,
  EMAIL_RESEND_COOLDOWN_SECONDS,
  emailCooldownSeconds,
} from "@repo/hooks/auth-error-copy";
import { SignetTokens } from "@repo/theme/signet";
import { OnboardingTextInput } from "@/components/onboarding/onboarding-field";
import { OnboardingPrimaryButton } from "@/components/onboarding/onboarding-primary-button";
import { OnboardingPressable } from "@/components/onboarding/onboarding-pressable";
import { useAuthSession } from "@/lib/auth-session";
import {
  fieldTypeRole,
  MONO_FONT_FAMILY,
  typeRole,
  useFrappTheme,
} from "@/lib/theme";

/**
 * The code box every Auth email leads to on the phone (#6134), the twin of
 * web's (`apps/web/components/auth/email-code-step.tsx`). Every Auth email
 * carries a 6-digit code and no link (Paul, 2026-11-26), typed here: on the
 * invite card's Continue with email (#5625), s01's email code, and s01's
 * Confirm your email for a password account that was never confirmed. Each
 * caller owns the email that went out and passes `resend` to send another.
 *
 * `textContentType="oneTimeCode"` lets iOS offer the code from Mail above the
 * keyboard, and `autoComplete="one-time-code"` lets Android's autofill do the
 * same. Six digits typed, pasted or filled are sent at once, never the same
 * wrong code twice. A wrong or expired code clears the field; anything else
 * keeps it for another go (`verifyEmailCode` reports that one).
 *
 * A right code signs the member in; the session change carries the screen on
 * from there (the auth gate on s01, the card on join).
 */
export function EmailCodeStep({
  email,
  screen,
  title,
  lead,
  initialCooldownSeconds,
  initialNotice,
  resend,
  onVerified,
  backLabel,
  onBack,
  disabled = false,
}: {
  /** The address the code went to, already trimmed and lowercased. */
  email: string;
  /** The route, for the failure report. */
  screen: string;
  title: string;
  /** What the step says above the box; the sent line by default. */
  lead?: string;
  /**
   * Seconds before Send a new code is offered: the full minute right after
   * an email went out, GoTrue's own remaining seconds when it refused one
   * inside it, else 0.
   */
  initialCooldownSeconds: number;
  /** A line to show on arrival (the email minute's notice). */
  initialNotice?: string | null;
  /** Sends another email to `email`; throws GoTrue's refusal. */
  resend: () => Promise<void>;
  /** The code was right. */
  onVerified?: () => void;
  backLabel: string;
  onBack: () => void;
  disabled?: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const { verifyEmailCode } = useAuthSession();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(initialCooldownSeconds);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  const codeRef = useRef<TextInput>(null);
  const lastTried = useRef<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function verify(value: string) {
    if (verifying || value.length < EMAIL_CODE_LENGTH) return;
    lastTried.current = value;
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      await verifyEmailCode({ email, code: value, screen });
      onVerified?.();
    } catch (caught) {
      const { message, wrongCode } = describeEmailCodeError(caught);
      setError(message);
      if (wrongCode) setCode("");
      // Not the code's fault: keep it, and let the same code go again.
      else lastTried.current = null;
      codeRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  }

  async function sendAgain() {
    if (sending) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      await resend();
      setCooldown(EMAIL_RESEND_COOLDOWN_SECONDS);
      setNotice(EMAIL_CODE_COPY.resent(email));
      setCode("");
      lastTried.current = null;
    } catch (caught) {
      const wait = emailCooldownSeconds(caught);
      if (wait !== undefined) {
        // One went out under a minute ago; its code still works.
        setCooldown(Math.max(1, wait));
        setNotice(cooldownCopy(wait));
      } else {
        setError(describeEmailSendError(caught));
      }
    } finally {
      setSending(false);
    }
  }

  const waiting = cooldown > 0;

  return (
    <View style={styles.column}>
      <View>
        <Text accessibilityRole="header" style={styles.sentTitle}>
          {title}
        </Text>
        <Text style={styles.sentBody}>{lead ?? EMAIL_CODE_COPY.sent(email)}</Text>
      </View>
      <OnboardingTextInput
        ref={codeRef}
        value={code}
        onChangeText={(value) => {
          const digits = value.replace(/\D/g, "");
          setCode(digits);
          setError(null);
          if (
            digits.length === EMAIL_CODE_LENGTH &&
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
        editable={!disabled && !verifying}
        accessibilityLabel={EMAIL_CODE_COPY.codeLabel}
        // A machine value read character by character, in mono.
        style={styles.codeInput}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <OnboardingPrimaryButton
        label="Continue"
        busy={verifying}
        disabled={disabled || verifying || code.length < EMAIL_CODE_LENGTH}
        onPress={() => void verify(code)}
      />
      <View style={styles.codeActions}>
        <OnboardingPressable
          accessibilityRole="button"
          disabled={verifying}
          onPress={onBack}
          quiet
          style={styles.quietLine}
        >
          <Text style={styles.quietGold}>{backLabel}</Text>
        </OnboardingPressable>
        <OnboardingPressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: disabled || verifying || sending || waiting,
          }}
          disabled={disabled || verifying || sending || waiting}
          onPress={() => void sendAgain()}
          quiet
          style={styles.quietLine}
        >
          <Text style={waiting || sending ? styles.quietText : styles.quietGold}>
            {waiting
              ? EMAIL_CODE_COPY.sendAgainIn(cooldown)
              : EMAIL_CODE_COPY.sendAgain}
          </Text>
        </OnboardingPressable>
      </View>
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    column: {
      gap: tokens.spacing.md,
    },
    sentTitle: {
      ...typeRole(tokens.typography.role.title),
      color: tokens.color.text.foreground,
    },
    sentBody: {
      marginTop: tokens.spacing.xs,
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
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
    notice: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
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
    quietText: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.mutedForeground,
    },
    quietGold: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.gold.house,
    },
  });
}
