"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks/use-toast";
import { PERSONAL_SETTINGS_COPY } from "@repo/validation";
import { LinkedGroup } from "@/components/linked-apps/linked-apps-section";
import { SignInMethodRows } from "@/components/linked-apps/sign-in-methods";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import {
  DELETE_ACCOUNT_FAILED,
  useDeleteAccountFlow,
} from "@/components/profile/use-delete-account-flow";
import { signOutCurrentSession } from "@/lib/auth/session";
import { useConfirmDropBulkUploads } from "@/components/backwork/bulk/use-confirm-drop-bulk-uploads";
import { getErrorMessage } from "@/lib/utils";

/**
 * Settings → Account: the ways the account signs in, then sign out and delete
 * the account. Moved here from `/profile` (#3856), which keeps the profile
 * itself; the sign-in methods came over from Linked apps with #6032, as
 * Google Account and Discord keep them with the account. The phone's Account
 * page holds the same two groups.
 *
 * Delete account's words, its confirm and what it does are unchanged: a
 * change there is raised with Paul first (`AGENTS.md` § ADR discipline).
 */
export function AccountSection() {
  const { toast } = useToast();
  const deleteFlow = useDeleteAccountFlow({
    onFailed: () => toast({ ...DELETE_ACCOUNT_FAILED, variant: "destructive" }),
  });
  const isDeletingAccount = deleteFlow.isDeleting;
  const { confirmDrop, confirmDropDialog } = useConfirmDropBulkUploads();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    if (!(await confirmDrop("sign-out"))) return;
    setIsSigningOut(true);
    try {
      await signOutCurrentSession();
      // Deliberately not in a `finally`: on the success path this line never
      // returns, and resetting the flag after it would only ever run on the
      // failure path — where the member does need the control back.
      window.location.assign("/sign-in");
    } catch (error) {
      setIsSigningOut(false);
      toast({
        title: "Couldn't sign out",
        description: getErrorMessage(
          error,
          "Retry in a moment, or close this tab to end the session locally.",
        ),
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <div id="account" className="flex scroll-mt-16 flex-col gap-8">
        <LinkedGroup heading={PERSONAL_SETTINGS_COPY.signIn}>
          <SignInMethodRows />
        </LinkedGroup>
        <SettingsGroup heading={PERSONAL_SETTINGS_COPY.session}>
          <SettingsRow
            label="Sign out"
            description="Signing in again refreshes your permissions."
            control={
              <Button
                variant="secondary"
                size="toolbar"
                onClick={handleSignOut}
                disabled={isSigningOut || isDeletingAccount}
              >
                {isSigningOut ? "Signing out..." : "Sign out"}
              </Button>
            }
          />
          <SettingsRow
            label="Delete account"
            description="Permanently deletes your account. You'll be asked to confirm."
            control={
              <Button
                variant="destructive"
                size="toolbar"
                onClick={() => void deleteFlow.start()}
                disabled={isDeletingAccount || isSigningOut}
              >
                {isDeletingAccount ? "Deleting account…" : "Delete account…"}
              </Button>
            }
          />
        </SettingsGroup>
      </div>
      {deleteFlow.confirmDialog}
      {confirmDropDialog}
    </>
  );
}
