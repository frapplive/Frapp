"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  IDENTITY_PART,
  readShellRows,
  SHELL_QUERY_PARTS,
  shellIdentityFrom,
  writeShellRow,
  type ShellIdentity,
  type ShellScope,
} from "./shell-cache";

const ShellIdentityContext = createContext<ShellIdentity | null>(null);

/**
 * The member's name and photo as this browser last saw them, for this auth
 * uid and chapter, or null. The account row reads it only while
 * `/v1/users/me` hasn't answered (#5049); the live answer always wins.
 */
export function useShellIdentity(): ShellIdentity | null {
  return useContext(ShellIdentityContext);
}

/**
 * Paints the last answers into the query cache, layer by layer, wherever a
 * query has nothing yet. Each is marked stale, so its readers fetch it again
 * as they mount; a query already fetching just replaces it when it answers.
 * A query that has failed is left alone: a cached answer never covers an
 * error.
 */
export function seedShellCache(
  queryClient: QueryClient,
  scope: ShellScope,
  now: number = Date.now(),
): ShellIdentity | null {
  const rows = readShellRows(scope, now);
  for (const layer of [1, 2] as const) {
    for (const part of SHELL_QUERY_PARTS) {
      if (part.layer !== layer) continue;
      const row = rows.get(part.name);
      if (!row) continue;
      const key = part.key(scope.chapterId);
      const state = queryClient.getQueryState(key);
      if (state?.data !== undefined || state?.status === "error") continue;
      queryClient.setQueryData(key, row.data, { updatedAt: row.at });
      void queryClient.invalidateQueries({
        queryKey: key,
        exact: true,
        refetchType: "none",
      });
    }
  }
  const identity = rows.get(IDENTITY_PART);
  return identity ? shellIdentityFrom(identity.data) : null;
}

/** Same key, element by element (query keys here are flat strings and nulls). */
function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((part, i) => part === b[i]);
}

/**
 * Keeps each fetched answer for the next visit. Only a fetch's own answer is
 * kept (`manual` writes, optimistic updates and this cache's own seeds are
 * not), only for a key built for the current chapter, and only while that
 * query is still in the cache: an identity change clears the cache first, so
 * a fetch that lands after it belongs to nobody here and is dropped.
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
    if (part) writeShellRow(scope, part.name, query.state.data);
  });
}

/**
 * Seeds and keeps the shell cache for the signed-in member's chapter.
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
  const [identity, setIdentity] = useState<{
    scope: string;
    value: ShellIdentity | null;
  } | null>(null);
  const scopeKey =
    authUserId && chapterId ? `${authUserId}|${chapterId}` : null;

  useEffect(() => {
    if (!authUserId || !chapterId) return;
    const scope = { authUserId, chapterId };
    setIdentity({
      scope: `${authUserId}|${chapterId}`,
      value: seedShellCache(queryClient, scope),
    });
    return keepShellAnswers(queryClient, scope);
  }, [authUserId, chapterId, queryClient]);

  // Disowned the moment the scope moves, before the next seed runs.
  const value = identity && identity.scope === scopeKey ? identity.value : null;
  return (
    <ShellIdentityContext.Provider value={value}>
      {children}
    </ShellIdentityContext.Provider>
  );
}
