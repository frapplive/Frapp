"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  cooldownCopy,
  describeEmailSendError,
  EMAIL_CODE_COPY,
  EMAIL_RESEND_COOLDOWN_SECONDS,
  emailCooldownSeconds,
} from "@repo/hooks/auth-error-copy";
import { EmailCodeStep } from "@/components/auth/email-code-step";
import { FloatingField } from "@/components/auth/floating-field";
import { Button } from "@/components/ui/button";
import { requestEmailCode } from "@/lib/auth/email-code";
import { reportAuthFailure } from "@/lib/sentry/auth-failures";

/**
 * Continue with email on the invite card (#5625): one address, then the
 * six-digit code from the email typed right here (`EmailCodeStep`), so nobody
 * leaves the page (Slack's and Notion's sign-in work the same way). It works
 * for a new address too: Auth creates the account on the first code.
 *
 * Every Auth email carries only the code since #6134. Production's templates
 * still carry a link beside it until Paul pastes the code-only ones, after
 * the last phone build that can only follow a link is retired; until then the
 * send still names `redirectTo` for that link (`requestEmailCode`), and
 * `onSending` lets the card remember what the member came to do should the
 * link bring them back instead.
 *
 * `onSignedIn` runs once this browser holds a session from the code.
 */
export function EmailCodeSignIn({
  redirectTo,
  onSending,
  onSignedIn,
  onCodeSent,
  onCodeVerified,
  onBack,
  disabled = false,
}: {
  redirectTo: string;
  /** The email is about to go out: a transition-era link may come back to this card. */
  onSending: () => void;
  onSignedIn: () => void;
  /** The email went out (the invite card's funnel, #5663). */
  onCodeSent?: () => void;
  /** The code was right (the invite card's funnel, #5663). */
  onCodeVerified?: () => void;
  onBack: () => void;
  disabled?: boolean;
}) {
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrival, setArrival] = useState<{ cooldown: number; notice: string | null }>({
    cooldown: 0,
    notice: null,
  });

  async function requestCode(address: string): Promise<void> {
    onSending();
    await requestEmailCode(address, redirectTo);
    onCodeSent?.();
  }

  async function send() {
    const address = email.trim();
    if (!address.includes("@")) {
      setError(EMAIL_CODE_COPY.invalidEmail);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await requestCode(address);
      setArrival({ cooldown: EMAIL_RESEND_COOLDOWN_SECONDS, notice: null });
      setStage("code");
    } catch (caught) {
      // Every refusal is reported, the email minute included (at info).
      reportAuthFailure({
        flow: "magic_link_send",
        screen: "/join",
        error: caught,
      });
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
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        noValidate
      >
        <FloatingField
          id="join-email"
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "join-email-error" : undefined}
          disabled={disabled || sending}
        />
        {error ? (
          <p
            id="join-email-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={disabled || sending}>
          {sending ? <Loader2 className="animate-spin" /> : null}
          {EMAIL_CODE_COPY.sendLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={onBack}
          disabled={sending}
        >
          Back
        </Button>
      </form>
    );
  }

  return (
    <EmailCodeStep
      email={email}
      idPrefix="join"
      screen="/join"
      title={EMAIL_CODE_COPY.sentTitle}
      initialCooldownSeconds={arrival.cooldown}
      initialNotice={arrival.notice}
      resend={() => requestCode(email.trim())}
      resendFlow="magic_link_send"
      onVerified={() => {
        onCodeVerified?.();
        onSignedIn();
      }}
      backLabel={EMAIL_CODE_COPY.differentEmail}
      onBack={() => setStage("email")}
      disabled={disabled}
    />
  );
}
