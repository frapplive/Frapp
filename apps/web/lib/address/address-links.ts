"use client";

import type { MouseEvent } from "react";
import { closeToAddress, pushAddressHref } from "./address";

/**
 * Marks a link that closes a page to its parent (a back arrow): a plain
 * click on it goes through `closeToAddress`, and `pushSameRouteLink` leaves
 * it alone.
 */
export const ADDRESS_CLOSE_ATTR = "data-address-close";

/** A plain left click: no modifier, so the browser would follow it here. */
function isPlainClick(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/** The relative address of `anchor` when it points at this page's route. */
function sameRouteHref(anchor: HTMLAnchorElement): string | null {
  if (anchor.hasAttribute("download")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if ((anchor.getAttribute("href") ?? "").startsWith("#")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname !== window.location.pathname) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The pane a full-width tool page scrolls in, back to its top. */
function scrollToolPageToTop(): void {
  document.querySelector("[data-tool-page]")?.scrollTo?.({ top: 0 });
}

/**
 * `onClickCapture` for a page whose rows are links to its own pages
 * (Chapter settings, #6049): a plain click on a link to this route pushes it
 * marked with the address it came from (`pushAddressHref`), in place of the
 * `<Link>`'s own push, which carries no mark. So the page's back arrow can
 * go Back to the row that opened it, and Forward reopens it. A modified
 * click, another route, a download or a back arrow is left to the link.
 */
export function pushSameRouteLink(event: MouseEvent): void {
  if (!isPlainClick(event)) return;
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return;
  if (anchor.hasAttribute(ADDRESS_CLOSE_ATTR)) return;
  const href = sameRouteHref(anchor);
  if (href === null) return;
  event.preventDefault();
  pushAddressHref(href);
  scrollToolPageToTop();
}

/**
 * `onClick` for a back arrow's link: a plain click closes to `href` by the
 * address's rule (`closeToAddress`), Back when this tab opened the page and
 * otherwise a replace. A link to another route is left to the link.
 */
export function closeToLink(event: MouseEvent<HTMLAnchorElement>): void {
  if (!isPlainClick(event)) return;
  const href = sameRouteHref(event.currentTarget);
  if (href === null) return;
  event.preventDefault();
  closeToAddress(href);
  scrollToolPageToTop();
}
