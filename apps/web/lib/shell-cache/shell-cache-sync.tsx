"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { CachedRosterProvider } from "@repo/hooks";
import { pruneOtherMembers, reopenShellCache } from "./shell-cache-clear";
import {
  IDENTITY_PART,
  readShellRows,
  SHELL_QUERY_PARTS,
  shellIdentityFrom,
  writeShellRow,
  type ShellIdentity,
  type ShellScope,
} from "./shell-cache";

/** The rows read for one scope, by part, and the scope they belong to. */
interface ShellSnapshot {
  scope: string;
  rows: ReadonlyMap<string, unknown>;
}

const ShellSnapshotContext = createContext<ShellSnapshot | null>(null);

/**
 * The last answer this browser kept for `part` (a {@link SHELL_QUERY_PARTS}
 * name, or `"me"`), for the signed-in member's chapter, or null.
 *
 * For drawing only, and only while the live read is out: the caller shows it
 * in place of a skeleton and drops it the moment its own query has data or
 * has failed. It never enters the query cache, so nothing that decides (a
 * redirect, a gate, a one-time reopen) can act on it (#5049).
 */
export function useShellCached<T = unknown>(part: string): T | null {
  const snapshot = useContext(ShellSnapshotContext);
  return (snapshot?.rows.get(part) as T | undefined) ?? null;
}

/**
 * The member's name and photo as this browser last saw them, for this auth
 * uid and chapter, or null. The account row reads it only while
 * `/v1/users/me` has no answer; the live answer always wins.
 */
export function useShellIdentity(): ShellIdentity | null {
  return shellIdentityFrom(useShellCached(IDENTITY_PART));
}

/** Same key, element by element (query keys here are flat strings and nulls). */
function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((part, i) => part === b[i]);
}

/**
 * Keeps each fetched answer for the next visit. Only a fetch's own answer is
 * kept (`manual` writes and optimistic updates are not), only for a key built
 * for the current chapter, and only while that query is still in the cache:
 * an identity change clears the cache first, so a fetch that lands after it
 * belongs to nobody here and is dropped. Sign-out closes the store
 * (`closeShellCache`), so an answer landing during the sign-out round trip
 * isn't written back either.
 */
export function keepShellAnswers(
  queryClient: QueryClient,
  scope: ShellScope,
): () => void {
  const cache = queryClient.getQueryCache();
  return cache.subscribe((event) => {
    if (event.type !== "updated") return;
    const action = event.action;
    if (action.type !== "success" || action.manual) return;
    const query = event.query;
    if (cache.get(query.queryHash) !== query) return;
    const key = query.queryKey;
    if (sameKey(key, ["user", "me"])) {
      const identity = shellIdentityFrom(query.state.data);
      if (identity) writeShellRow(scope, IDENTITY_PART, identity);
      return;
    }
    const part = SHELL_QUERY_PARTS.find((p) =>
      sameKey(key, p.key(scope.chapterId)),
    );
    if (!part) return;
    const kept = part.keep ? part.keep(query.state.data) : query.state.data;
    if (kept !== undefined) writeShellRow(scope, part.name, kept);
  });
}

/**
 * Reads the shell cache for the signed-in member's chapter once, offers it to
 * the screens that draw from it, and keeps fetched answers for next time.
 * Mounted inside `FrappProvider`, which owns both halves of the scope and
 * clears every row when either changes.
 */
export function ShellCacheSync({
  authUserId,
  chapterId,
  children,
}: {
  authUserId: string | null;
  chapterId: string | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<ShellSnapshot | null>(null);
  const scopeKey =
    authUserId && chapterId ? `${authUserId}|${chapterId}` : null;

  useEffect(() => {
    if (authUserId) pruneOtherMembers(authUserId);
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId || !chapterId) return;
    const scope = { authUserId, chapterId };
    // A member signed in again in this tab: writes resume for them.
    reopenShellCache();
    const rows = new Map<string, unknown>();
    for (const [part, row] of readShellRows(scope)) rows.set(part, row.data);
    setSnapshot({ scope: `${authUserId}|${chapterId}`, rows });
    return keepShellAnswers(queryClient, scope);
  }, [authUserId, chapterId, queryClient]);

  // Disowned the moment the scope moves, before the next read runs.
  const value = snapshot && snapshot.scope === scopeKey ? snapshot : null;
  const roster = value?.rows.get("roster");
  return (
    <ShellSnapshotContext.Provider value={value}>
      <CachedRosterProvider value={Array.isArray(roster) ? roster : null}>
        {children}
      </CachedRosterProvider>
    </ShellSnapshotContext.Provider>
  );
}
