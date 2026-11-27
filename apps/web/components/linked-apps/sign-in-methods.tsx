"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, Unlink } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserIdentity } from "@supabase/supabase-js";
import {
  isLinkableSignInMethod,
  loadSignInMethods,
  SIGN_IN_LINK_COPY,
  signInMethodsQueryKey,
  type LinkableSignInMethodKey,
  type SignInMethod,
  type SignInMethodKey,
} from "@repo/hooks";
import { describeIdentityLinkError } from "@repo/hooks/auth-error-copy";
import { AppleMark, GoogleMark } from "@/components/auth/oauth-brand-icons";
import { LinkedAppRow } from "@/components/linked-apps/linked-app-row";
import { NestedError } from "@/components/shared/nested-states";
import { ActionMenuButton } from "@/components/shared/row-menu";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { LINK_ERROR_PARAM } from "@/lib/auth/redirect";
import { LINKING_PARAM, startWebLink } from "@/lib/auth/link-identity";
import { desktopBridge } from "@/lib/desktop/bridge";
import { useToast } from "@/lib/hooks/use-toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const ICONS: Record<SignInMethodKey, React.ReactNode> = {
  email: <Mail className="text-foreground" />,
  google: <GoogleMark />,
  apple: <AppleMark />,
};

const LABELS: Record<LinkableSignInMethodKey, string> = {
  google: "Google",
  apple: "Apple",
};

/**
 * The ways this account signs in (#5407), read from Supabase Auth's
 * identities: email (a password or a sign-in link), Google, Apple. Each is a
 * Linked apps row, checked when the account has it, the way Google's "Ways you
 * sign in" and GitHub's sign-in methods list them.
 *
 * Google and Apple can be linked and unlinked here (#2223), as GitHub's
 * sign-in methods and Discord's Connections offer: Link on a missing one
 * goes through the provider and comes back here, and ⋯ → Unlink, with a
 * confirm, takes one off while the account keeps another way in. Email is the
 * account's own address and only shows its state. A Hide My Email Apple ID
 * links too, since linking doesn't match addresses. Both need Supabase's
 * Manual linking switched on for the project; where it is off, Link says so
 * (`describeIdentityLinkError`).
 *
 * The desktop app can't show Google's or Apple's page (both refuse embedded
 * windows), and its browser hand-off carries a sign-in, not a link, so Link
 * is disabled there with the reason. Unlink works everywhere.
 */
export function SignInMethodRows() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [busy, setBusy] = useState<LinkableSignInMethodKey | null>(null);
  const identities = useQuery({
    queryKey: signInMethodsQueryKey,
    queryFn: () =>
      loadSignInMethods<UserIdentity>(createSupabaseBrowserClient().auth),
    staleTime: 60_000,
  });

  // A Link round trip comes back here with `?linking=<provider>`, and
  // `linkError` when it failed. Read once on mount, said, then stripped, so a
  // reload doesn't say it again.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const url = new URL(window.location.href);
    const provider = url.searchParams.get(LINKING_PARAM);
    const failure = url.searchParams.get(LINK_ERROR_PARAM);
    if (!provider && !failure) return;
    const label =
      provider === "google" || provider === "apple"
        ? LABELS[provider]
        : "that account";
    if (failure) {
      toast({
        variant: "destructive",
        title: SIGN_IN_LINK_COPY.linkFailedTitle(label),
        description: describeIdentityLinkError({ code: failure }, label),
      });
    } else {
      toast({ description: SIGN_IN_LINK_COPY.linked(label) });
    }
    url.searchParams.delete(LINKING_PARAM);
    url.searchParams.delete(LINK_ERROR_PARAM);
    window.history.replaceState(null, "", url.toString());
  }, [toast]);

  const onDesktop = desktopBridge() !== null;

  async function link(provider: LinkableSignInMethodKey) {
    setBusy(provider);
    const { error } = await startWebLink(
      createSupabaseBrowserClient(),
      provider,
      window.location.origin,
    );
    // Without an error the page is on its way to the provider.
    if (!error) return;
    setBusy(null);
    toast({
      variant: "destructive",
      title: SIGN_IN_LINK_COPY.linkFailedTitle(LABELS[provider]),
      description: describeIdentityLinkError(error, LABELS[provider]),
    });
  }

  async function unlink(method: SignInMethod<UserIdentity>) {
    if (!isLinkableSignInMethod(method.key) || !method.identity) return;
    const label = LABELS[method.key];
    const answer = await confirm({
      title: SIGN_IN_LINK_COPY.unlinkTitle(label),
      description: SIGN_IN_LINK_COPY.unlinkBody(label),
      confirmLabel: SIGN_IN_LINK_COPY.unlink,
      tone: "destructive",
    });
    if (!answer) return;
    setBusy(method.key);
    try {
      const { error } = await createSupabaseBrowserClient().auth.unlinkIdentity(
        method.identity,
      );
      if (error) throw error;
      toast({ description: SIGN_IN_LINK_COPY.unlinked(label) });
    } catch (error) {
      toast({
        variant: "destructive",
        title: SIGN_IN_LINK_COPY.unlinkFailedTitle(label),
        description: describeIdentityLinkError(error, label),
      });
    } finally {
      setBusy(null);
      // Either way the account's identities are what GoTrue says now.
      void queryClient.invalidateQueries({ queryKey: signInMethodsQueryKey });
    }
  }

  if (identities.isPending) return null;
  if (identities.isError) {
    return (
      <li className="px-4 py-3">
        <NestedError
          title="Couldn't load how you sign in"
          description="Check your connection and try again."
          onRetry={() => void identities.refetch()}
        />
      </li>
    );
  }
  return (
    <>
      {identities.data.map((method) => (
        <LinkedAppRow
          key={method.key}
          icon={ICONS[method.key]}
          name={method.label}
          state={method}
        >
          {method.canLink && isLinkableSignInMethod(method.key) ? (
            <Button
              variant="secondary"
              size="toolbar"
              aria-label={`Link ${method.label}`}
              title={onDesktop ? SIGN_IN_LINK_COPY.desktopLinkReason : undefined}
              disabled={busy !== null || onDesktop}
              onClick={() =>
                isLinkableSignInMethod(method.key) && void link(method.key)
              }
            >
              {SIGN_IN_LINK_COPY.link}
            </Button>
          ) : method.canUnlink ? (
            <ActionMenuButton
              label={`More for ${method.label}`}
              busy={busy === method.key}
              disabled={busy !== null}
              entries={[
                {
                  type: "item",
                  key: "unlink",
                  label: `${SIGN_IN_LINK_COPY.unlink}…`,
                  icon: Unlink,
                  destructive: true,
                  onSelect: () => void unlink(method),
                },
              ]}
            />
          ) : null}
        </LinkedAppRow>
      ))}
      {confirmDialog}
    </>
  );
}
