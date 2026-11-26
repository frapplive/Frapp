/**
 * Deleting the shell cache (`shell-cache.ts`), and nothing else, with no
 * imports: sign-out and the identity-change handler call it, and neither
 * should pull the cache's query-key helpers (and `@repo/hooks` behind them)
 * into its bundle. The same split as `lib/chat/first-chunk-wipe.ts`.
 */

/** Every key the shell cache writes starts with this, so a clear can find them. */
export const SHELL_CACHE_PREFIX = "frapp.shell.v1|";

/**
 * Delete every row, every member's and every chapter's. Runs on the events
 * that drop the in-memory cache (a chapter change, an auth-uid change) and on
 * sign-out; synchronous, so the navigation straight after can't outrun it.
 * Never throws: a refused store can't fail the sign-out that called it.
 */
export function clearShellCache(): void {
  let store: Storage | null = null;
  try {
    store = typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return;
  }
  if (!store) return;
  const keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(SHELL_CACHE_PREFIX)) keys.push(key);
    }
  } catch {
    return;
  }
  for (const key of keys) {
    try {
      store.removeItem(key);
    } catch {
      // Ignore: keying still keeps it from anyone else.
    }
  }
}
