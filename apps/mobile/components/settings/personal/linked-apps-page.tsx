import { personalSettingsPageLabel } from "@repo/validation";
import { InlineNote } from "@/components/inline-note";
import { LinkedAppsSection } from "@/components/settings/linked-apps-section";
import { SettingAnchor } from "@/components/settings/setting-anchor";
import { SettingsPageShell } from "@/components/settings/personal/settings-page-shell";
import { useIsCouncil, useServesChapterFeatures } from "@/lib/tenant-kind";

/**
 * Settings → Linked apps (#6032): Google Calendar, Calendar apps and Discord,
 * the chapter's links, as web's Settings → Linked apps lists them.
 *
 * Mounted only once the tenant is known to be a chapter: its reads are
 * chapter routes, which refuse a council (#5933). Settings' first page hides
 * the row for a council, but a search result or a link can still open this
 * page, so it holds the gate itself and says why the page is empty.
 */
export function LinkedAppsSettingsPage() {
  const chapterFeatures = useServesChapterFeatures();
  const council = useIsCouncil();
  return (
    <SettingsPageShell title={personalSettingsPageLabel("apps")}>
      {chapterFeatures ? (
        <SettingAnchor id="linked-apps">
          <LinkedAppsSection />
        </SettingAnchor>
      ) : council ? (
        <InlineNote>A council has no linked apps.</InlineNote>
      ) : null}
    </SettingsPageShell>
  );
}
