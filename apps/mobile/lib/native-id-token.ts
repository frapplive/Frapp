/**
 * Supabase Auth refusing a native ID token because its provider is not set up
 * for this build, where the browser flow still works:
 *
 * - the build's client ID missing from the provider's **Client IDs**
 *   ("Unacceptable audience in id_token"). Apple's audience is the bundle ID,
 *   so each build (`live.frapp.mobile`, `live.frapp.mobile.staging`) needs its
 *   own entry; staging's was missing on 2026-11-20 (FRAPP-MOBILE-16);
 * - **Skip nonce check** off while iOS's Google SDK puts its own nonce in the
 *   token.
 *
 * Anything else (an expired token, a network failure) is a real error for the
 * sign-in screen.
 */
export function isProviderConfigRejection(error: { message?: string }): boolean {
  return /audience|nonce/i.test(error.message ?? "");
}

/**
 * What a native sign-in calls when Supabase refused its token for setup
 * reasons and it is falling back to the browser. The member never sees it;
 * the caller reports it, because only a dashboard change fixes it.
 */
export type OnProviderRejected = (error: unknown) => void;
