import { personalSettingsPageLabel } from "@repo/validation";
import { LinkedAppsSection } from "@/components/settings/linked-apps-section";
import { SettingAnchor } from "@/components/settings/setting-anchor";
import { SettingsPageShell } from "@/components/settings/personal/settings-page-shell";

/**
 * Settings → Linked apps (#6032): Google Calendar, Calendar apps and Discord,
 * the chapter's links, as web's Settings → Linked apps lists them. Settings'
 * first page shows the row only once the tenant is a chapter: a council has
 * no calendar or Discord link (#5933).
 */
export function LinkedAppsSettingsPage() {
  return (
    <SettingsPageShell title={personalSettingsPageLabel("apps")}>
      <SettingAnchor id="linked-apps">
        <LinkedAppsSection />
      </SettingAnchor>
    </SettingsPageShell>
  );
}
