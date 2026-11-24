import { describeOAuthError } from "@repo/hooks/auth-error-copy";
import {
  type AuthCallbackIntent,
  buildAuthCallbackUrl,
  describeAuthError,
} from "@/lib/auth/redirect";
import { DESKTOP_SIGN_IN_PATH, desktopBridge } from "@/lib/desktop/bridge";

export type OAuthProvider = "apple" | "google";

/**
 * Member-facing copy when GoTrue will not auto-link a new OAuth identity onto
 * an existing email/password or magic-link user.
 *
 * Automatic linking is a hosted Auth setting (Ops checklist). When it is on,
 * this path is rare. When it is off, guessing a merge in `public.users` would
 * attach two auth ids to one chapter member — so we send them back to the
 * method that already owns that email.
 */
export const IDENTITY_COLLISION_COPY =
  "An account with this email already exists. Sign in with your password or a magic link. Google or Apple can attach to that same account on later visits.";

export const OAUTH_UNAVAILABLE_COPY =
  "This sign-in method isn't available yet. Use your password or a magic link.";

/**
 * A refused Google or Apple start, in the shared auth map's words
 * (`@repo/hooks/auth-error-copy`): never the provider's or GoTrue's sentence.
 */
export function describeOAuthKickoffError(error: unknown): string {
  return describeOAuthError(error, {
    identityCollision: IDENTITY_COLLISION_COPY,
    providerUnavailable: OAUTH_UNAVAILABLE_COPY,
    deadLink: describeAuthError("otp_expired"),
    fallback: "Unable to start sign-in. Retry in a moment.",
  });
}

/** The toast a screen shows once the desktop app has opened the browser. */
export const DESKTOP_HANDOFF_COPY = "Sign-in opened in your browser";

/**
 * Kick off Google or Apple on the browser client.
 *
 * `redirectTo` is the post-auth path (already open-redirect guarded). The
 * OAuth return lands on `/auth/callback?next=…`, the same PKCE `code` exchange
 * magic-link confirmations already use — so this must not invent a second
 * callback route. The sign-in screen still passes `intent: "sign-in"`, which
 * nothing reads since the "New account created" notice was retired.
 *
 * **Inside the desktop app** (`desktop` is the shell's bridge) the provider
 * page can't load in the window: Google and Apple refuse embedded browsers.
 * The start is the same PKCE call, so the verifier cookie is set in this
 * window, but the browser isn't sent anywhere. The shell opens the provider
 * page in the member's default browser, and the return lands there on
 * `/desktop-sign-in`, which hands the code back to the app; the shell then
 * loads `/auth/callback` here and the usual exchange runs (ADR-29 decision 5).
 * `handedOff` tells the screen to drop its pending state and say where the
 * sign-in went.
 */
export async function startWebOAuth(
  supabase: {
    auth: {
      signInWithOAuth: (credentials: {
        provider: OAuthProvider;
        options?: {
          redirectTo?: string;
          queryParams?: Record<string, string>;
          skipBrowserRedirect?: boolean;
        };
      }) => Promise<{
        data?: { url?: string | null } | null;
        error: { message: string; code?: string } | null;
      }>;
    };
  },
  provider: OAuthProvider,
  origin: string,
  redirectTo: string,
  intent?: AuthCallbackIntent,
  desktop: { openExternal(url: string): void } | null = desktopBridge(),
): Promise<{
  error: { message: string; code?: string } | null;
  handedOff: boolean;
}> {
  const callback = buildAuthCallbackUrl(origin, redirectTo, { intent });
  const queryParams =
    provider === "google" ? { prompt: "select_account" } : undefined;
  if (!desktop) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback, queryParams },
    });
    return {
      error: error ? { message: error.message, code: error.code } : null,
      handedOff: false,
    };
  }

  const handOff = new URL(callback);
  handOff.pathname = DESKTOP_SIGN_IN_PATH;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: handOff.toString(),
      queryParams,
      skipBrowserRedirect: true,
    },
  });
  if (error) {
    return {
      error: { message: error.message, code: error.code },
      handedOff: false,
    };
  }
  if (!data?.url) {
    return {
      error: { message: "Auth returned no sign-in address" },
      handedOff: false,
    };
  }
  desktop.openExternal(data.url);
  return { error: null, handedOff: true };
}
