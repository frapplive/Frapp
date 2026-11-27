"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { resetObservabilityOnLogout } from "@/lib/observability/reset";
import {
  closeShellCache,
  reopenShellCache,
} from "@/lib/shell-cache/shell-cache-clear";

/**
 * When this tab last started signing itself out. A global sign-out revokes
 * the session on the server before it drops the local one, so a read that
 * 401s in between finds a stored session that Auth calls gone: the same
 * answer as a session revoked elsewhere. `handleRejectedSession` and
 * `getLiveSessionUser` read this so the member's own sign-out isn't counted,
 * or noticed, as one (#4440).
 */
let ownSignOutStartedAt: number | null = null;
const OWN_SIGN_OUT_WINDOW_MS = 30_000;

export function signingOutHere(now: number = Date.now()): boolean {
  return (
    ownSignOutStartedAt !== null &&
    now - ownSignOutStartedAt < OWN_SIGN_OUT_WINDOW_MS
  );
}

export async function signOutCurrentSession(
  options: { scope?: "global" | "local" } = {},
) {
  ownSignOutStartedAt = Date.now();
  // Before the sign-out, so the shell cache is gone even when the navigation
  // that follows outruns the identity-change effect, and closed, so an answer
  // landing during the round trip isn't written back (#5049).
  closeShellCache();
  try {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut(
      options.scope ? { scope: options.scope } : undefined,
    );
  } catch (error) {
    // A sign-out that threw leaves the member signed in on this page, with no
    // identity change to reopen the store: reopen it, or nothing is kept for
    // the rest of the tab. The rows are already gone and come back from the
    // next answers.
    reopenShellCache();
    throw error;
  }
  resetObservabilityOnLogout();
}
