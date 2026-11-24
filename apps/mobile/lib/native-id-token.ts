/**
 * Supabase Auth refusing a native ID token because its provider is not set up
 * for this build, where the browser flow still works. Anything else (an
 * expired token, a network failure) is a real error for the sign-in screen.
 *
 * - The build's client ID missing from the provider's **Client IDs**
 *   ("Unacceptable audience in id_token"), for Apple and Google alike.
 *   `docs/ops/deployment/supabase.md` owns which IDs each project lists.
 * - For Google only, **Skip nonce check** off while iOS's Google SDK puts its
 *   own nonce in the token. Apple's nonce is the app's own, so a nonce
 *   refusal there is a bug in the app, not setup, and is not matched.
 */
export function isProviderConfigRejection(
  provider: "apple" | "google",
  error: { message?: string },
): boolean {
  const pattern = provider === "google" ? /audience|nonce/i : /audience/i;
  return pattern.test(error.message ?? "");
}

/**
 * What a native sign-in calls when Supabase refused its token for setup
 * reasons and it is falling back to the browser. The member never sees it;
 * the caller reports it, because only a dashboard change fixes it.
 */
export type OnProviderRejected = (error: unknown) => void;
