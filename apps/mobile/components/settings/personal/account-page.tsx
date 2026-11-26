import { useRouter } from "expo-router";
import { useDeleteAccount } from "@repo/hooks";
import {
  PERSONAL_SETTINGS_COPY,
  personalSettingsPageLabel,
} from "@repo/validation";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { SignInSection } from "@/components/settings/linked-apps-section";
import { SettingAnchor } from "@/components/settings/setting-anchor";
import { SettingsPageShell } from "@/components/settings/personal/settings-page-shell";
import { confirmDeleteAccount } from "@/lib/account/delete-account-prompt";
import { useAuthSession } from "@/lib/auth-session";

/**
 * Settings → Account (#6032): the ways the account signs in, then Sign out
 * and Delete account, as web's Settings → Account. Sign out and Delete
 * account sat at the foot of the one Settings page, among the legal links,
 * until then.
 *
 * Delete account's words, its confirm (`confirmDeleteAccount`) and what it
 * does are unchanged: a change there is raised with Paul first
 * (`AGENTS.md` § ADR discipline).
 */
export function AccountSettingsPage() {
  const router = useRouter();
  const { signOut } = useAuthSession();
  const deleteAccount = useDeleteAccount();

  async function handleSignOut() {
    // `signOut` drops the query cache itself (`lib/auth-session.tsx`), so every
    // sign-out path gets it without each screen remembering to.
    await signOut();
    router.replace("/(auth)/sign-in");
  }

  function handleDeleteAccount() {
    confirmDeleteAccount({
      deleteAccount,
      onDeleted: () => {
        void handleSignOut();
      },
    });
  }

  return (
    <SettingsPageShell title={personalSettingsPageLabel("account")}>
      <SettingAnchor id="sign-in">
        <SignInSection />
      </SettingAnchor>
      <SectionHeader>{PERSONAL_SETTINGS_COPY.session}</SectionHeader>
      <ListSection>
        <SettingAnchor id="sign-out">
          <ListRow
            label="Sign out"
            action
            destructive
            onPress={() => {
              void handleSignOut();
            }}
          />
        </SettingAnchor>
        <SettingAnchor id="delete-account">
          <ListRow
            label={
              deleteAccount.isPending ? "Deleting account…" : "Delete account"
            }
            action
            destructive
            disabled={deleteAccount.isPending}
            accessibilityHint="Permanently deletes your account. You'll be asked to confirm."
            onPress={handleDeleteAccount}
          />
        </SettingAnchor>
      </ListSection>
    </SettingsPageShell>
  );
}
