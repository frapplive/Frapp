import { useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import {
  searchSettings,
  settingWebPath,
  aiAvailableFrom,
  useAiConsent,
  useCurrentChapter,
  usePermissionList,
  type SettingEntry,
  type SettingMatch,
  type SettingPhoneScreen,
} from "@repo/hooks";
import { isModuleEnabled } from "@repo/validation";
import { webAppOrigin } from "@/lib/onboarding/chapter-wizard/invite-link";
import {
  openNotificationTarget,
  type NotificationTarget,
} from "@/lib/notifications/targets";

/**
 * Settings search on the phone: the same index and the same rule as web
 * (`settings-search.ts` in `@repo/hooks`), so the same words find the same
 * settings, listed only where the member can change them. Read by the search
 * field atop Chapter settings and Settings, and by the Search screen's
 * Settings group.
 */
export function usePhoneSettingsSearch(): (query: string) => SettingMatch[] {
  const permissions = usePermissionList();
  const aiAvailable = aiAvailableFrom(useAiConsent()) === true;
  const modules = useCurrentChapter().data?.enabled_modules;
  return useCallback(
    (query: string) =>
      searchSettings(query, {
        permissions,
        platform: "phone",
        aiAvailable,
        isModuleEnabled: modules
          ? (key) => isModuleEnabled(modules, key)
          : undefined,
      }),
    [permissions, aiAvailable, modules],
  );
}

/** Where a setting opens on the phone, or null for one only web changes. */
export function settingPhoneRoute(
  entry: SettingEntry,
): NotificationTarget | null {
  if (!entry.phone) return null;
  const params: Record<string, string> = {};
  // A page pushed inside the screen (Settings' `?page=`, #6032) opens as its
  // own stack entry, so back returns to the screen's first page.
  if (entry.phone.page) params.page = entry.phone.page;
  if (entry.phone.anchor) params.setting = entry.id;
  return Object.keys(params).length > 0
    ? { pathname: entry.phone.screen, params }
    : { pathname: entry.phone.screen };
}

/** The dashboard address for a setting the phone has no screen for. */
export function settingWebUrl(entry: SettingEntry): string | null {
  const path = settingWebPath(entry);
  return path ? `${webAppOrigin()}${path}` : null;
}

type Router = Parameters<typeof openNotificationTarget>[0];

/**
 * Opens a setting: lit in place when it is on the screen the member is on
 * (`here`), pushed with its `setting` param when it is on another, and on the
 * web dashboard, in the browser, when the phone has no screen for it.
 */
export function openSetting(
  router: Router,
  entry: SettingEntry,
  options: {
    here?: SettingPhoneScreen;
    jumpHere?: (settingId: string) => void;
    onBrowserFailed?: () => void;
  } = {},
): void {
  const route = settingPhoneRoute(entry);
  if (route) {
    // Only the first page carries a search field, so a match on one of its
    // pushed pages opens that page rather than lighting it in place.
    if (
      options.here === entry.phone?.screen &&
      !entry.phone?.page &&
      options.jumpHere
    ) {
      options.jumpHere(entry.id);
      return;
    }
    openNotificationTarget(router, route);
    return;
  }
  const url = settingWebUrl(entry);
  if (url) {
    WebBrowser.openBrowserAsync(url).catch(() => options.onBrowserFailed?.());
  }
}
