"use client";

import { EmailCodeStep } from "@/components/auth/email-code-step";
import { buildAuthCallbackUrl } from "@/lib/auth/redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EMAIL_RESEND_COOLDOWN_SECONDS } from "@repo/hooks/auth-error-copy";

/**
 * GoTrue sends one address one auth email a minute and refuses a second with
 * a 429. Counting the minute down means the member never meets that refusal
 * by sending again right after the first email went out. Shared with
 * mobile (`@repo/hooks/auth-error-copy`).
 */
export const RESEND_COOLDOWN_SECONDS = EMAIL_RESEND_COOLDOWN_SECONDS;

/**
 * Where a transition-era confirmation link lands: `/auth/callback` with
 * `next` and `intent=confirm`. The email carries only a code once a host's
 * Confirm signup template is the code-only one (#6134); production's keeps a
 * link beside the code until Paul pastes it, so the send still names one.
 */
export function confirmationRedirectUrl(origin: string, redirectTo: string): string {
  return buildAuthCallbackUrl(origin, redirectTo, { intent: "confirm" });
}

/**
 * "Confirm your email": the code box a new password account sees between
 * creating itself and signing in (#6134). Hosted projects require the
 * address to be confirmed (#3776), so a web sign-up never comes back with a
 * session; the code from the Confirm signup email gives it one here, and the
 * member carries on to `redirectTo` in this tab.
 *
 * It replaced "Check your email" with a link (2026-11-09, #3831), which
 * itself replaced a toast and a bounce to the sign-in form. That link could
 * confirm the address in another browser and sign nobody in; a code is
 * typed where it was asked for, on whichever device the email is read.
 *
 * Both the sign-up screen and the sign-in screen (on `email_not_confirmed`)
 * render it. The sign-in screen can't know when the last email went out, so
 * it says where the code came from (`lead`) and offers Send a new code at
 * once; a refusal inside the minute starts the count.
 */
export function CheckEmail({
  email,
  redirectTo,
  screen,
  lead,
  initialCooldownSeconds,
  backLabel,
  onBack,
  onConfirmed,
}: {
  email: string;
  redirectTo: string;
  /** The route, for the auth-failure report. */
  screen: string;
  /** Overrides the sent line (the sign-in screen's unconfirmed address). */
  lead?: string;
  /**
   * Seconds before Send a new code is offered: `RESEND_COOLDOWN_SECONDS` right
   * after an email went out, GoTrue's own remaining seconds (at least 1) when
   * it refused a send inside the minute, else 0.
   */
  initialCooldownSeconds: number;
  backLabel: string;
  onBack: () => void;
  /** This browser holds a session: the account is confirmed and signed in. */
  onConfirmed: () => void;
}) {
  return (
    <EmailCodeStep
      email={email}
      idPrefix="confirm"
      screen={screen}
      lead={lead}
      initialCooldownSeconds={initialCooldownSeconds}
      resend={async () => {
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.resend({
          type: "signup",
          email: email.trim(),
          options: {
            emailRedirectTo: confirmationRedirectUrl(window.location.origin, redirectTo),
          },
        });
        if (error) throw error;
      }}
      resendFlow="confirmation_resend"
      onVerified={onConfirmed}
      backLabel={backLabel}
      onBack={onBack}
    />
  );
}
