"use client";

import type { MouseEvent, ReactNode } from "react";
import {
  addressWith,
  closeToAddress,
  pushAddressTo,
} from "@/lib/address/address";
import { SETTINGS_SUBPAGE_PARAMS } from "@/components/settings/settings-paths";

/**
 * Marks a link as a page's back arrow (`SettingsBackLink`): it closes to
 * its parent by the address's rule rather than opening it.
 */
export const SETTINGS_BACK_LINK_ATTR = "data-settings-back";

/**
 * Settings' links, moved by the address's rules (#6049;
 * `spec/ui/web-dashboard/README.md` § Addresses). A row that opens a page in
 * place (a role, a tier, a channel, a class, Plan and billing's table) is a
 * `<Link>` to `/settings?…`; this pushes it marked with where it was opened
 * from, so the page's back arrow goes Back to it, and Forward reopens the
 * page, the way iOS Settings and Discord's server settings walk back. A back
 * arrow on a page that arrived from a link replaces the address with its
 * parent, so no Back press lands on the same page twice.
 *
 * It catches the click before `next/link` does (a link whose click is
 * already prevented is left to itself), so the pages keep plain links: a
 * middle-click or a modifier still opens a new tab.
 */
export function SettingsAddressLinks({ children }: { children: ReactNode }) {
  return <div onClickCapture={followSettingsLink}>{children}</div>;
}

function followSettingsLink(event: MouseEvent<HTMLDivElement>): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return;
  if (anchor.target && anchor.target !== "_self") return;
  if (anchor.hasAttribute("download")) return;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  if (url.pathname !== window.location.pathname) return;
  // An in-page anchor (`#section`) scrolls as the browser does.
  if (url.search === window.location.search && url.hash) return;
  event.preventDefault();
  const href = `${url.pathname}${url.search}${url.hash}`;
  if (anchor.hasAttribute(SETTINGS_BACK_LINK_ATTR)) closeToAddress(href);
  else pushAddressTo(href);
  scrollToolPageToTop();
}

/**
 * Opens a rail row (Chapter settings' or a council's): pushes `?tab=` with
 * none of the params that opened a page inside the last row and no `#…`, so
 * Chat shows its own page when the officer comes back to it. The entry is a
 * sibling of the row before (`fresh`), so Back walks the rows visited while a
 * back arrow inside a row only ever closes to that row.
 */
export function pushRailRow(tab: string): void {
  pushAddressTo(railRowAddress(tab), { fresh: true });
}

/**
 * Clicking the lit rail row: closes whatever page is open inside it, by the
 * address's rule (Back when this tab opened it, else a replace).
 */
export function closeRailRow(tab: string): void {
  closeToAddress(railRowAddress(tab));
}

/** A rail row's own address: `?tab=`, no page inside it and no `#…`. */
function railRowAddress(tab: string): string {
  return addressWith(`${window.location.pathname}${window.location.search}`, {
    tab,
    ...Object.fromEntries(SETTINGS_SUBPAGE_PARAMS.map((name) => [name, null])),
  });
}

/**
 * Starts the settings panel at its top, not wherever the last page was
 * scrolled to: it scrolls inside the shell's tool pane.
 */
export function scrollToolPageToTop(): void {
  document.querySelector("[data-tool-page]")?.scrollTo?.({ top: 0 });
}
