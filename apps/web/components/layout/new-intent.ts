"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
 */
export const NEW_INTENT_PARAM = "new";

/** The address that opens `href`'s create form. */
export function newIntentHref(href: string): string {
  return `${href}?${NEW_INTENT_PARAM}=1`;
}

export function useNewIntent(open: () => void, ready: boolean): void {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const asked = searchParams?.get(NEW_INTENT_PARAM) === "1";
  // The latest `open`, read when the intent fires: pages pass a fresh
  // closure each render, and the effect must not re-run for that.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    if (!asked || !ready) return;
    const rest = new URLSearchParams(searchParams?.toString() ?? "");
    rest.delete(NEW_INTENT_PARAM);
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : (pathname ?? "/"));
    openRef.current();
    // The address changing is what ends this; `searchParams` is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, ready]);
}
