"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AuthScreen } from "@/components/auth/auth-screen";
import { Button } from "@/components/ui/button";
import { desktopAuthLink } from "@/lib/desktop/bridge";

/**
 * Where Google or Apple returns, in the member's browser, when the sign-in
 * was started in the desktop app (ADR-29 decision 5, #4841).
 *
 * The desktop app can't show the provider's page itself, so it opened this
 * browser. The session belongs in the app, not here: this page exchanges
 * nothing. It opens the app with the code (`frapp-desktop://auth/callback`),
 * and the app finishes the exchange against the verifier it has held since
 * the member pressed the button, so the code is no use to this browser or to
 * anyone who reads it here. Slack, Discord and Linear land on the same kind
 * of page ("We've redirected you to the desktop app").
 *
 * The browser asks before it opens another app, and may refuse a launch no
 * tap started, so the button is the same link for the member to press.
 *
 * Reachable signed out: `/desktop-sign-in` is not in `proxy.ts`'s matcher.
 */
function DesktopSignInContent() {
  const link = desktopAuthLink(useSearchParams());

  useEffect(() => {
    if (link) window.location.assign(link);
  }, [link]);

  if (!link) {
    return (
      <AuthScreen
        title="Sign-in didn't finish"
        subtitle="Go back to the Frapp app and try again."
      />
    );
  }
  return (
    <AuthScreen
      title="Opening Frapp"
      subtitle="This tab can be closed once the app is open."
    >
      <Button asChild className="w-full">
        <a href={link}>Open Frapp</a>
      </Button>
    </AuthScreen>
  );
}

export default function DesktopSignInPage() {
  return (
    <Suspense fallback={<AuthScreen title="Opening Frapp" />}>
      <DesktopSignInContent />
    </Suspense>
  );
}
