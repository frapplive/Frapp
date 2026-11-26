/**
 * The shell cache: the last answers a member's dashboard draws itself from,
 * kept per member and per chapter so a revisit paints them before the network
 * answers (#5049, Paul 2026-11-26: "some of this should be cached and queried
 * in layers").
 *
 * Named rows, never the query cache. Each row is one read's last answer,
 * stored under the Supabase auth uid and the chapter id it was fetched under,
 * so there is no key under which another member's or another chapter's answer
 * can be read back (`spec/ui/resilience/caching.md` § Shell cache).
 *
 * Read, never seeded. `ShellCacheSync` reads the rows once per scope and
 * offers them to the few screens that draw from them while their live read is
 * out (`useShellCached`): the account row, the nav, the chapter head, members'
 * names, and the Calendar. Nothing goes into the query cache, because a
 * seeded answer reads as a live one to everything else: a redirect, a module
 * gate or a one-time reopen would act on a week-old answer (the review of
 * #5049 found three that did).
 *
 * What is left out, on purpose: `["user","me"]` (only the name and photo are
 * kept, through their own row), nothing about money (the chapter row keeps
 * its name, logo and branding, not its billing state), nobody else's contact
 * details, no tokens, no messages (chat keeps its own first-chunk cache).
 *
 * `localStorage`, not IndexedDB: this sits on the shell path of every route,
 * and Dexie there would cost every page the bundle `first-chunk-wipe.ts`
 * keeps off it; reads are synchronous, so the rows are there in the first
 * effect after hydration; and a clear is a loop over keys that can't be
 * blocked by a second tab.
 */
import type { QueryKey } from "@tanstack/react-query";
import {
  currentChapterQueryKey,
  eventsQueryKey,
  myPermissionsQueryKey,
  rosterQueryKey,
} from "@repo/hooks";
import { SHELL_CACHE_PREFIX, shellCacheClosed } from "./shell-cache-clear";

export { SHELL_CACHE_PREFIX, clearShellCache } from "./shell-cache-clear";

/** A row older than this is dropped unread, as the first-chunk cache does. */
export const SHELL_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A row bigger than this isn't kept. The answers here are a few kilobytes to a
 * few hundred; a chapter whose events list outgrows this just loads it live.
 */
export const SHELL_CACHE_MAX_ROW_CHARS = 500_000;

/** The layer a row paints in: 1 identity and shell, 2 the open page. */
export type ShellLayer = 1 | 2;

/** A query whose last answer this cache keeps. */
export interface ShellQueryPart {
  name: string;
  layer: ShellLayer;
  /** The key the reading hook uses, for this chapter. */
  key: (chapterId: string) => QueryKey;
  /** The part of the answer worth keeping; the whole answer when omitted. */
  keep?: (data: unknown) => unknown;
}

/** The chapter row: what the chapter head draws, and nothing else. */
function chapterHead(data: unknown): unknown {
  if (!data || typeof data !== "object") return undefined;
  const row = data as {
    name?: unknown;
    logo_url?: unknown;
    branding?: unknown;
  };
  if (typeof row.name !== "string") return undefined;
  return {
    name: row.name,
    logo_url: typeof row.logo_url === "string" ? row.logo_url : null,
    branding: row.branding ?? null,
  };
}

/** The queries kept, by layer. */
export const SHELL_QUERY_PARTS: readonly ShellQueryPart[] = [
  { name: "roster", layer: 1, key: (c) => rosterQueryKey(c) },
  { name: "permissions", layer: 1, key: (c) => myPermissionsQueryKey(c) },
  {
    name: "chapter",
    layer: 1,
    key: (c) => currentChapterQueryKey(c),
    keep: chapterHead,
  },
  { name: "events", layer: 2, key: (c) => eventsQueryKey(c) },
];

/** The member's own name and photo, the one identity row (never `["user","me"]`). */
export interface ShellIdentity {
  display_name: string | null;
  avatar_url: string | null;
}

/** The part name the identity row is stored under. */
export const IDENTITY_PART = "me";

/** Who and where a row belongs to. */
export interface ShellScope {
  authUserId: string;
  chapterId: string;
}

interface StoredRow {
  /** When the answer was fetched, ms since the epoch. */
  at: number;
  data: unknown;
}

/** Storage that may be missing or refuse (a private window, blocked site data). */
function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function scopePrefix(scope: ShellScope): string {
  return `${SHELL_CACHE_PREFIX}${scope.authUserId}|${scope.chapterId}|`;
}

function rowKey(scope: ShellScope, part: string): string {
  return `${scopePrefix(scope)}${part}`;
}

/** Every key this cache owns, read up front so removing one doesn't skip the next. */
function ownKeys(store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith(SHELL_CACHE_PREFIX)) keys.push(key);
  }
  return keys;
}

/**
 * Keep one answer for this scope. Fails quietly: a full or refused store
 * costs the next visit its head start, never this one anything.
 */
export function writeShellRow(
  scope: ShellScope,
  part: string,
  data: unknown,
  at: number = Date.now(),
): void {
  const store = storage();
  if (!store || data === undefined || shellCacheClosed()) return;
  try {
    const value = JSON.stringify({ at, data } satisfies StoredRow);
    if (value.length > SHELL_CACHE_MAX_ROW_CHARS) {
      store.removeItem(rowKey(scope, part));
      return;
    }
    store.setItem(rowKey(scope, part), value);
  } catch {
    // Quota or a refused store: nothing to do.
  }
}

/**
 * This scope's rows, by part, with anything older than
 * {@link SHELL_CACHE_MAX_AGE_MS} dropped. Then every row of another scope is
 * deleted: the read can't reach them (it looks up this scope's keys), so the
 * sweep is hygiene after the paint, as `pruneForeignScopes` is for chat's.
 */
export function readShellRows(
  scope: ShellScope,
  now: number = Date.now(),
): Map<string, StoredRow> {
  const rows = new Map<string, StoredRow>();
  const store = storage();
  if (!store) return rows;
  const mine = scopePrefix(scope);
  for (const key of ownKeys(store)) {
    if (!key.startsWith(mine)) {
      try {
        store.removeItem(key);
      } catch {
        // Ignore: the key still can't be read under this scope.
      }
      continue;
    }
    const part = key.slice(mine.length);
    try {
      const row = JSON.parse(store.getItem(key) ?? "null") as StoredRow | null;
      if (
        !row ||
        typeof row.at !== "number" ||
        now - row.at > SHELL_CACHE_MAX_AGE_MS ||
        row.at > now + 60_000
      ) {
        store.removeItem(key);
        continue;
      }
      rows.set(part, row);
    } catch {
      try {
        store.removeItem(key);
      } catch {
        // Ignore.
      }
    }
  }
  return rows;
}

/** The identity row's two fields, from a `/v1/users/me` answer. */
export function shellIdentityFrom(user: unknown): ShellIdentity | null {
  if (!user || typeof user !== "object") return null;
  const row = user as { display_name?: unknown; avatar_url?: unknown };
  const name =
    typeof row.display_name === "string" && row.display_name.trim()
      ? row.display_name.trim()
      : null;
  const avatar = typeof row.avatar_url === "string" ? row.avatar_url : null;
  return name || avatar ? { display_name: name, avatar_url: avatar } : null;
}
