import { useState } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { UserIdentity } from "@supabase/supabase-js";
import {
  isLinkableSignInMethod,
  SIGN_IN_LINK_COPY,
  signInMethodLabel,
  signInMethodsQueryKey,
  type LinkableSignInMethodKey,
  type SignInMethod,
} from "@repo/hooks";
import { describeIdentityLinkError } from "@repo/hooks/auth-error-copy";
import { MemberFacingError } from "@repo/hooks/error-copy";
import { useAuthSession } from "@/lib/auth-session";
import { confirmAlert } from "@/lib/minutes/meetings-on";
import { getSupabaseClient } from "@/lib/supabase";

function describe(error: unknown, label: string): string {
  return error instanceof MemberFacingError
    ? error.message
    : describeIdentityLinkError(error, label);
}

/**
 * Link and unlink Google or Apple from Settings → Account (#2223), the phone
 * half of web's `SignInMethodRows`: Link goes through the system auth sheet
 * (`linkOAuthProvider`), Unlink asks first, and either way the rows reread
 * the account's identities after. What a row may offer (`canLink`,
 * `canUnlink`) is `@repo/hooks`' rule, so the last way in is never offered.
 */
export function useSignInMethodLinking() {
  const { linkOAuthProvider } = useAuthSession();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<LinkableSignInMethodKey | null>(null);

  const reread = () =>
    void queryClient.invalidateQueries({ queryKey: signInMethodsQueryKey });

  async function link(provider: LinkableSignInMethodKey) {
    const label = signInMethodLabel(provider);
    setBusy(provider);
    try {
      const outcome = await linkOAuthProvider(provider);
      if (outcome === "linked") {
        Alert.alert(SIGN_IN_LINK_COPY.linked(label));
      }
    } catch (error) {
      Alert.alert(
        SIGN_IN_LINK_COPY.linkFailedTitle(label),
        describe(error, label),
      );
    } finally {
      setBusy(null);
      reread();
    }
  }

  async function confirmUnlink(method: SignInMethod<UserIdentity>) {
    if (!isLinkableSignInMethod(method.key) || !method.identity) return;
    const label = method.label;
    const ok = await confirmAlert({
      title: SIGN_IN_LINK_COPY.unlinkTitle(label),
      body: SIGN_IN_LINK_COPY.unlinkBody(label),
      confirmLabel: SIGN_IN_LINK_COPY.unlink,
      destructive: true,
    });
    if (!ok) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(method.key);
    try {
      const { error } = await supabase.auth.unlinkIdentity(method.identity);
      if (error) throw error;
      Alert.alert(SIGN_IN_LINK_COPY.unlinked(label));
    } catch (error) {
      Alert.alert(
        SIGN_IN_LINK_COPY.unlinkFailedTitle(label),
        describe(error, label),
      );
    } finally {
      setBusy(null);
      reread();
    }
  }

  return { link, confirmUnlink, busy };
}
