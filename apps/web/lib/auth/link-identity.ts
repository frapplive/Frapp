import type { LinkableSignInMethodKey } from "@repo/hooks";
import { buildAuthCallbackUrl } from "@/lib/auth/redirect";

/**
 * Where Settings → Account sends a Link round trip back to (#2223), and the
 * provider it was for, so the page can say "Google linked" or why it wasn't.
 * `/auth/callback` adds `linkError` on a failed return
 * (`LINK_ERROR_PARAM` in `lib/auth/redirect.ts`).
 */
export const LINKING_PARAM = "linking";
export const ACCOUNT_SETTINGS_PATH = "/preferences?section=account";

export function linkReturnPath(provider: LinkableSignInMethodKey): string {
  return `${ACCOUNT_SETTINGS_PATH}&${LINKING_PARAM}=${provider}`;
}

/**
 * Link Google or Apple to the signed-in account (#2223): Supabase's manual
 * identity linking, through the same `/auth/callback` PKCE exchange a sign-in
 * uses, tagged `intent=link` so a failure returns here, not to `/sign-in`.
 *
 * Supabase asks GoTrue for the provider's address first, which is where a
 * project with Manual linking off refuses (`manual_linking_disabled`). On
 * success the client navigates the window to the provider, so a resolved call
 * with no error means the page is leaving. Google gets `select_account`, as
 * the sign-in does, so a member signed in to one Google account in this
 * browser can pick a different one.
 *
 * No email match is required: a Hide My Email Apple ID links like any other.
 */
export async function startWebLink(
  supabase: {
    auth: {
      linkIdentity: (credentials: {
        provider: LinkableSignInMethodKey;
        options?: {
          redirectTo?: string;
          queryParams?: Record<string, string>;
        };
      }) => Promise<{ error: { message: string; code?: string } | null }>;
    };
  },
  provider: LinkableSignInMethodKey,
  origin: string,
): Promise<{ error: { message: string; code?: string } | null }> {
  const { error } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo: buildAuthCallbackUrl(origin, linkReturnPath(provider), {
        intent: "link",
      }),
      queryParams:
        provider === "google" ? { prompt: "select_account" } : undefined,
    },
  });
  return { error: error ? { message: error.message, code: error.code } : null };
}
