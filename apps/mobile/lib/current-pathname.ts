import { useEffect } from "react";
import { useGlobalSearchParams, usePathname } from "expo-router";
import { replaceablePathname } from "@/lib/notifications/targets";

/**
 * The focused route's path, for code that opens a link outside a component
 * (`lib/chat/open-link.ts`) and so can't call `usePathname` itself, but must
 * still pass it to `openHref` so a link to the kind of screen already on top
 * replaces it rather than stacking a second (owner, 2026-11-07). The app's
 * stack layout keeps it current (`useTrackCurrentPathname`).
 */
let current: string | undefined;
let currentThreadRootId: string | string[] | undefined;

export function currentPathname(): string | undefined {
  return current;
}

/**
 * The focused path as `openHref` may replace it: `undefined` over a message
 * thread, which shares its channel's path, so a link tapped in a thread
 * pushes over the thread instead of replacing it (`replaceablePathname`).
 */
export function currentReplaceablePathname(): string | undefined {
  return current === undefined
    ? undefined
    : replaceablePathname(current, currentThreadRootId);
}

/** Mounted once, in `app/(app)/_layout.tsx`. */
export function useTrackCurrentPathname(): void {
  const pathname = usePathname();
  const { threadRootId } = useGlobalSearchParams<{
    threadRootId?: string | string[];
  }>();
  useEffect(() => {
    current = pathname;
    currentThreadRootId = threadRootId;
  }, [pathname, threadRootId]);
}
