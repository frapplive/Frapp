"use client";

import { useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  closeAddress,
  pushAddressHref,
  replaceAddress,
} from "@/lib/address/address";
import { scrollToolPageToTop } from "@/lib/address/address-links";
import { SETTINGS_SUBPAGE_PARAMS } from "@/components/settings/settings-paths";

/**
 * The rail's address on Chapter settings and on council settings (#6049;
 * `spec/ui/web-dashboard/README.md` § Addresses): a row is a step Back
 * returns from, the way iOS Settings and Discord's server settings walk back
 * through the rows visited.
 */
export function useSettingsRowsAddress() {
  const searchParams = useSearchParams();
  const onSubpage = SETTINGS_SUBPAGE_PARAMS.some(
    (param) => searchParams?.has(param) ?? false,
  );
  // A row pushes its address without the params that opened a page inside
  // the last one, so Chat shows its own page when the officer comes back to
  // it. The rail activates a row on click or Enter only (`activationMode`
  // manual), so arrowing past rows pushes nothing.
  const changeTab = useCallback((next: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    for (const param of SETTINGS_SUBPAGE_PARAMS) url.searchParams.delete(param);
    pushAddressHref(`${url.pathname}${url.search}`);
    scrollToolPageToTop();
  }, []);
  // The lit row closes a page opened inside it (a channel's settings, a
  // role, a pledge class, the plan table) by the address's rule: Back when
  // this tab opened the page, else a replace with the row's own page.
  const closeSubpage = useCallback(() => {
    closeAddress(SETTINGS_SUBPAGE_PARAMS);
    scrollToolPageToTop();
  }, []);
  const onRowClick = useCallback(
    (value: string, shownTab: string) => {
      if (value === shownTab && onSubpage) closeSubpage();
    },
    [onSubpage, closeSubpage],
  );
  return { changeTab, onRowClick };
}

/**
 * Writes the row on screen into the address in place when the address
 * names it another way (bare `/settings`, or an old alias such as
 * `?tab=groups`), so a page opened from it records the address its back
 * arrow closes to, and closing goes Back rather than leaving a duplicate.
 * A tab the viewer doesn't get is left as it is: the page shows their first
 * row without rewriting a link they may yet be allowed.
 */
export function SettingsTabAddress({
  rawTab,
  resolvedTab,
  shownTab,
}: {
  /** `?tab=` as the address spells it. */
  rawTab: string | null;
  /** What it resolves to (an alias followed, the default for none). */
  resolvedTab: string;
  /** The row on screen. */
  shownTab: string;
}) {
  useEffect(() => {
    if (!shownTab || resolvedTab !== shownTab || rawTab === shownTab) return;
    replaceAddress({ tab: shownTab });
  }, [rawTab, resolvedTab, shownTab]);
  return null;
}
