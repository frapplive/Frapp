"use client";

import { useEffect, useRef } from "react";

/**
 * How New's actions open a page's own form (#5946).
 *
 * The New page lists what a member can start (`ask/new-actions.tsx`): New
 * event, New task, Log hours and the rest. Each of those forms already
 * exists on its own page behind that page's button, with that page's gates,
 * drafts and focus handling, so New does not carry a second copy: it links
 * to the page with `?new=1`, and the page opens the form its own button
 * opens. One form per job, reachable from two places.
 *
 * A page calls `useNewIntent` with what its button does and whether the
 * member may do it right now (the same checks the button is drawn behind).
 * The form opens once those are known to pass, and the mark is then taken
 * off the address, so a reload or Back does not open the form again.
 *
 * It reads the address once, after the page mounts: New is its own page, so
 * following one of its links always mounts the page it names. The chat
 * panel is the exception, mounted on every route, so it passes what its own
 * search-params read says (`asked`).
 */
export const NEW_INTENT_PARAM = "new";

/**
 * The address that opens `href`'s create form. `href` may carry a query of
 * its own (`/profile?open=service`, a panel that holds the form, #5950).
 */
export function newIntentHref(href: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}${NEW_INTENT_PARAM}=1`;
}

function addressAsks(): boolean {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get(NEW_INTENT_PARAM) === "1"
  );
}

/**
 * Takes the mark off the address in place. Next keeps its search params in
 * step with the History API, so no navigation runs and nothing remounts.
 */
function clearAddress(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(NEW_INTENT_PARAM);
  window.history.replaceState(window.history.state, "", url);
}

export function useNewIntent(
  open: () => void,
  ready: boolean,
  asked?: boolean,
): void {
  // Read once, after the page's first commit: Next writes the new address in
  // its own commit, so a read during the first render can still see the page
  // the member came from (New's own).
  const askedAtMount = useRef<boolean | null>(null);
  // The latest `open`, read when the intent fires: pages pass a fresh
  // closure each render, and the effect must not re-run for that.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  const done = useRef(false);
  useEffect(() => {
    if (askedAtMount.current === null) askedAtMount.current = addressAsks();
    const wanted = asked ?? askedAtMount.current;
    if (asked !== undefined && !asked) done.current = false;
    if (!wanted || !ready || done.current) return;
    done.current = true;
    clearAddress();
    openRef.current();
  }, [ready, asked]);
}
