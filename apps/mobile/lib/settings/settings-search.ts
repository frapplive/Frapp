import { useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import {
  searchSettings,
  settingPhoneTarget,
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
import { useIsCouncil } from "@/lib/tenant-kind";
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
  // A council has no Chapter tab pages (#5933): those open on the web.
  const chapterFeatures = !useIsCouncil();
  return useCallback(
    (query: string) =>
      searchSettings(query, {
        permissions,
        platform: "phone",
        aiAvailable,
        chapterFeatures,
        isModuleEnabled: modules
          ? (key) => isModuleEnabled(modules, key)
          : undefined,
      }),
    [permissions, aiAvailable, modules, chapterFeatures],
  );
}

/**
 * Where a setting opens on the phone, or null for one only web changes there:
 * on a council (`chapterFeatures: false`), the Chapter tab's config parts.
 */
export function settingPhoneRoute(
  entry: SettingEntry,
  options: { chapterFeatures?: boolean } = {},
): NotificationTarget | null {
  const phone = settingPhoneTarget(entry, options);
  if (!phone) return null;
  const params = {
    ...phone.params,
    ...(phone.anchor ? { setting: entry.id } : {}),
  };
  return Object.keys(params).length > 0
    ? { pathname: phone.screen, params }
    : { pathname: phone.screen };
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
    /** False on a council, whose Chapter tab parts open on the web. */
    chapterFeatures?: boolean;
  } = {},
): void {
  const route = settingPhoneRoute(entry, {
    chapterFeatures: options.chapterFeatures,
  });
  if (route) {
    if (options.here === entry.phone?.screen && options.jumpHere) {
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
