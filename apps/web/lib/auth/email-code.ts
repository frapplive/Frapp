import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { magicLinkRedirectUrl } from "@/lib/auth/redirect";

/**
 * Emails a 6-digit sign-in code to `address` (#6134): GoTrue's Magic Link
 * template to a confirmed address, its Confirm signup template to a new one,
 * and either code signs in through `EmailCodeStep`. Throws GoTrue's refusal.
 *
 * The one send behind sign-in's Email me a code and the invite card's
 * Continue with email. It still names `redirectTo` for the link production's
 * templates print beside the code until its switch (`intent=sign-in-link`
 * keeps that link's Confirm-signup good-news path, `isEmailLinkIntent`); the
 * link handling's removal (#6136) drops `emailRedirectTo` here.
 */
export async function requestEmailCode(address: string, redirectTo: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: address,
    options: {
      emailRedirectTo: magicLinkRedirectUrl(window.location.origin, redirectTo),
    },
  });
  if (error) throw error;
}
