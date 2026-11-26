"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AuthFailureInput } from "@repo/observability";
import {
  cooldownCopy,
  describeEmailCodeError,
  describeEmailSendError,
  EMAIL_CODE_COPY,
  EMAIL_CODE_LENGTH,
  EMAIL_RESEND_COOLDOWN_SECONDS,
  emailCooldownSeconds,
} from "@repo/hooks/auth-error-copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reportAuthFailure } from "@/lib/sentry/auth-failures";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * The code box every Auth email leads to (#6134). Every one of them carries a
 * 6-digit code and no link (Paul, 2026-11-26: "codes are the new standard"),
 * typed here on web and in the desktop app, which loads these same pages. It
 * is what Slack, Notion and Linear ask for on sign-in, and what the phone
 * draws as its twin (`apps/mobile/components/onboarding/email-code-step.tsx`).
 *
 * Four places ask for it: the invite card's Continue with email (#5625),
 * sign-in's Email me a code, sign-up's Confirm your email, and an unconfirmed
 * password sign-in. Each owns the email that went out and passes `resend` to
 * send another; this step owns the code.
 *
 * One `verifyOtp` type serves all four. GoTrue's `email` type checks the
 * code against the address's confirmation token and then its sign-in token,
 * so the same call confirms a new account and signs an old one in, and either
 * way this browser holds a session after it.
 *
 * Six digits typed or pasted (or filled from the mail app by iOS or Android,
 * `autocomplete="one-time-code"`) are sent at once, never the same wrong code
 * twice. A wrong or expired code clears the field; anything else (offline, an
 * Auth outage, too many tries) keeps it for another go and is reported.
 */
export function EmailCodeStep({
  email,
  idPrefix,
  screen,
  title,
  lead,
  initialCooldownSeconds,
  initialNotice,
  resend,
  resendFlow,
  onVerified,
  backLabel,
  onBack,
  disabled = false,
}: {
  /** The address the code went to, as typed (trimmed here). */
  email: string;
  /** Keeps the field's id unique on its page. */
  idPrefix: string;
  /** The route, for the auth-failure report. */
  screen: string;
  /** Drawn inline above the lead (the invite card); auth screens title the page instead. */
  title?: string;
  /** What the step says above the box; the sent line by default. */
  lead?: string;
  /**
   * Seconds before Send a new code is offered: the full minute right after an
   * email went out, GoTrue's own remaining seconds when it refused one inside
   * it, else 0.
   */
  initialCooldownSeconds: number;
  /** A line to show on arrival (the email minute's notice). */
  initialNotice?: string | null;
  /** Sends another email to `email`; throws GoTrue's refusal. */
  resend: () => Promise<void>;
  /** How a refused resend is reported. */
  resendFlow: AuthFailureInput["flow"];
  /** This browser now holds a session from the code. */
  onVerified: () => void;
  backLabel: string;
  onBack: () => void;
  disabled?: boolean;
}) {
  const address = email.trim();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(initialCooldownSeconds);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  const codeRef = useRef<HTMLInputElement>(null);
  const lastTried = useRef<string | null>(null);
  /** `onVerified` runs once, whichever way the session arrives. */
  const finished = useRef(false);
  const onVerifiedRef = useRef(onVerified);
  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onVerifiedRef.current();
  };

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  // Production's emails keep a link beside the code until its switch (#6134,
  // `docs/ops/deployment/supabase.md` § Auth email templates). Opened in
  // another tab, that link signs this browser in there: the session is a
  // cookie this tab can read, so a sign-in reported by the client, or a
  // session found when the member comes back to this tab, carries it on too.
  // Goes with the rest of the link handling in #6136.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const check = async () => {
      if (document.visibilityState !== "visible" || finished.current) return;
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) finish();
      } catch {
        // A failed read leaves the code box up; the next focus tries again.
      }
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) finish();
    });
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  async function verify(value: string) {
    if (verifying || value.length < EMAIL_CODE_LENGTH) return;
    lastTried.current = value;
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: address,
        token: value,
        type: "email",
      });
      if (verifyError) throw verifyError;
      finish();
    } catch (caught) {
      const { message, wrongCode } = describeEmailCodeError(caught);
      setError(message);
      if (wrongCode) {
        setCode("");
      } else {
        // Not the code's fault: keep it, and let the same code go again.
        lastTried.current = null;
        reportAuthFailure({ flow: "email_code_verify", screen, error: caught });
      }
      codeRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  }

  async function sendAgain() {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      await resend();
      setCooldown(EMAIL_RESEND_COOLDOWN_SECONDS);
      setNotice(EMAIL_CODE_COPY.resent(address));
      setCode("");
      lastTried.current = null;
    } catch (caught) {
      // Every refusal is reported, the email minute included (at info:
      // `spec/behavior/observability.md` § Signed-out auth failures).
      reportAuthFailure({ flow: resendFlow, screen, error: caught });
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
      codeRef.current?.focus();
    }
  }

  const fieldId = `${idPrefix}-code`;
  const errorId = `${idPrefix}-code-error`;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void verify(code);
      }}
    >
      <div>
        {title ? (
          <p className="text-base font-semibold text-foreground">{title}</p>
        ) : null}
        <p className={title ? "mt-1 text-sm text-muted-foreground" : "text-sm text-muted-foreground"}>
          {lead ?? EMAIL_CODE_COPY.sent(address)}
        </p>
      </div>
      <label htmlFor={fieldId} className="sr-only">
        {EMAIL_CODE_COPY.codeLabel}
      </label>
      <Input
        ref={codeRef}
        id={fieldId}
        // A machine value read character by character: foundations §7's mono.
        className="h-14 text-center font-mono text-title tracking-[0.5em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={10}
        value={code}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          setCode(digits);
          setError(null);
          if (digits.length === EMAIL_CODE_LENGTH && digits !== lastTried.current) {
            void verify(digits);
          }
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled || verifying}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      <Button
        type="submit"
        className="w-full"
        disabled={disabled || verifying || code.length < EMAIL_CODE_LENGTH}
      >
        {verifying ? <Loader2 className="animate-spin" /> : null}
        Continue
      </Button>
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="link"
          size="sm"
          // 36 to a mouse, 44 to a finger: components.md §2's compact carve-out.
          className="h-9 px-0 pointer-coarse:h-11"
          onClick={onBack}
          disabled={verifying}
        >
          {backLabel}
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-9 px-0 pointer-coarse:h-11"
          onClick={() => void sendAgain()}
          disabled={disabled || verifying || sending || cooldown > 0}
        >
          {sending ? <Loader2 className="animate-spin" /> : null}
          {cooldown > 0 ? EMAIL_CODE_COPY.sendAgainIn(cooldown) : EMAIL_CODE_COPY.sendAgain}
        </Button>
      </div>
    </form>
  );
}
