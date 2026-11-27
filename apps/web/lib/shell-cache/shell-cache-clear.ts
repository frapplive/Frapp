/**
 * Deleting the shell cache (`shell-cache.ts`), and nothing else, with no
 * imports: sign-out and the identity-change handler call it, and neither
 * should pull the cache's query-key helpers (and `@repo/hooks` behind them)
 * into its bundle. The same split as `lib/chat/first-chunk-wipe.ts`.
 */

/**
 * What every shell-cache key starts with, in any version. Clears and the
 * prune match this, not {@link SHELL_CACHE_PREFIX}, so rows an older build
 * wrote under another version are still found and deleted.
 */
export const SHELL_CACHE_ROOT = "frapp.shell.";

/** Every key this build writes starts with this. */
export const SHELL_CACHE_PREFIX = `${SHELL_CACHE_ROOT}v1|`;

/**
 * Set by sign-out and lifted when a member's scope next starts in this tab
 * (`ShellCacheSync`): an answer that lands during the sign-out round trip,
 * or before the page navigates away, must not be written back after the
 * clear.
 */
let closed = false;

/** Whether writes are refused until the next member's scope starts. */
export function shellCacheClosed(): boolean {
  return closed;
}

/** Clear every row and refuse writes until {@link reopenShellCache}. */
export function closeShellCache(): void {
  closed = true;
  clearShellCache();
}

/** A member's scope started: writes are kept again. */
export function reopenShellCache(): void {
  closed = false;
}

/** Storage that may be missing or refuse (a private window, blocked site data). */
export function shellStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Every shell-cache key in `store`, any version, read up front so removing
 * one doesn't skip the next. Empty when the store refuses to be listed.
 */
export function shellKeys(store: Storage): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(SHELL_CACHE_ROOT)) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

/** Remove one key, quietly: keying still keeps it from anyone else. */
export function removeShellKey(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // Ignore.
  }
}

/**
 * Delete every row, every member's and every chapter's, in every version.
 * Runs on the events that drop the in-memory cache (a chapter change, an
 * auth-uid change) and on sign-out; synchronous, so the navigation straight
 * after can't outrun it. Never throws: a refused store can't fail the
 * sign-out that called it.
 */
export function clearShellCache(): void {
  const store = shellStorage();
  if (!store) return;
  for (const key of shellKeys(store)) removeShellKey(store, key);
}

/**
 * Delete every row that isn't `authUserId`'s in this build's version, once
 * the signed-in member is known and before any chapter is: a member with no
 * chapter yet (`/join`) never reads a scope, so the read's own sweep would
 * never run for them.
 */
export function pruneOtherMembers(authUserId: string): void {
  const store = shellStorage();
  if (!store) return;
  const mine = `${SHELL_CACHE_PREFIX}${authUserId}|`;
  for (const key of shellKeys(store)) {
    if (!key.startsWith(mine)) removeShellKey(store, key);
  }
}
