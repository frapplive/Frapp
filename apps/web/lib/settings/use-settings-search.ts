"use client";

import { useCallback } from "react";
import { aiAvailableFrom, useAiConsent, usePermissionList } from "@repo/hooks";
import { searchSettings, type SettingMatch } from "@repo/hooks/settings-search";
import { useChapterModuleGate } from "@/lib/hooks/use-chapter-module-gate";
import { useIsCouncil } from "@/lib/hooks/use-tenant-kind";

/**
 * Settings search for this viewer on web: what they can change, found by the
 * shared index (`settings-search.ts` in `@repo/hooks`). The settings pages'
 * field and the Find dialog's Settings group both ask through this, so the
 * two never list different settings for the same words.
 */
export function useSettingsSearch(): (query: string) => SettingMatch[] {
  const permissions = usePermissionList();
  const aiAvailable = aiAvailableFrom(useAiConsent()) === true;
  const isModuleEnabled = useChapterModuleGate();
  // The index names a chapter's settings; a council's few are on one page
  // with no search (#5933).
  const isCouncil = useIsCouncil();
  return useCallback(
    (query: string) =>
      isCouncil
        ? []
        : searchSettings(query, {
            permissions,
            platform: "web",
            aiAvailable,
            isModuleEnabled,
          }),
    [permissions, aiAvailable, isModuleEnabled, isCouncil],
  );
}
