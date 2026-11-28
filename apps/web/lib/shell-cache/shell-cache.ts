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
import {
  removeShellKey,
  SHELL_CACHE_PREFIX,
  shellCacheClosed,
  shellKeys,
  shellStorage,
} from "./shell-cache-clear";

export { SHELL_CACHE_PREFIX, clearShellCache } from "./shell-cache-clear";

/** A row older than this is dropped unread, as the first-chunk cache does. */
export const SHELL_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A row bigger than this isn't kept. The answers here are a few kilobytes to a
 * few hundred; a chapter whose events list outgrows this just loads it live.
 */
export const SHELL_CACHE_MAX_ROW_CHARS = 500_000;

/**
 * The build that wrote a row. A row from another build is dropped unread, so
 * a deploy that changes an answer's shape never draws an old one (#6061 step
 * 4): the first visit after a deploy loads live, the next one paints. The
 * release is Vercel's commit SHA (`next.config` derives it); a local build
 * has none and keeps its own rows.
 */
export const SHELL_CACHE_BUILD =
  process.env.NEXT_PUBLIC_SENTRY_RELEASE || "local";

/** A query whose last answer this cache keeps. */
export interface ShellQueryPart {
  name: string;
  /** The key the reading hook uses, for this chapter. */
  key: (chapterId: string) => QueryKey;
  /** The part of the answer worth keeping; the whole answer when omitted. */
  keep?: (data: unknown) => unknown;
}

/**
 * The chapter row: what the chapter head draws, and which modules are on, so
 * the nav doesn't draw a row a switched-off module then takes back. Nothing
 * about billing.
 */
function chapterHead(data: unknown): unknown {
  if (!data || typeof data !== "object") return undefined;
  const row = data as {
    name?: unknown;
    logo_url?: unknown;
    branding?: unknown;
    enabled_modules?: unknown;
  };
  if (typeof row.name !== "string") return undefined;
  const modules = row.enabled_modules;
  return {
    name: row.name,
    logo_url: typeof row.logo_url === "string" ? row.logo_url : null,
    branding: row.branding ?? null,
    enabled_modules:
      modules && typeof modules === "object" && !Array.isArray(modules)
        ? modules
        : null,
  };
}

/**
 * The fields the Calendar's list draws and files a row by (its line, its
 * timing, its series, who it's for). An event's notes, agenda, description,
 * attachments and check-in zone are left out: the list never reads them, and
 * the detail sheet loads its own copy (Paul, 2026-11-26: "leave out anything
 * sensitive").
 */
const EVENT_LIST_FIELDS = [
  "id",
  "name",
  "location",
  "start_time",
  "end_time",
  "timing",
  "start_date",
  "end_date",
  "is_tentative",
  "calendar_only",
  "recurrence_rule",
  "parent_event_id",
  "event_type_id",
  "point_value",
  "check_in_opens_minutes",
  "is_mandatory",
  "required_role_ids",
  "optional_role_ids",
  "excluded_role_ids",
  "others_invited",
  "attendance_picks",
] as const;

/** The events list, each row cut to {@link EVENT_LIST_FIELDS}. */
function eventList(data: unknown): unknown {
  if (!Array.isArray(data)) return undefined;
  return data.map((event: unknown) => {
    if (!event || typeof event !== "object") return event;
    const row = event as Record<string, unknown>;
    const kept: Record<string, unknown> = {};
    for (const field of EVENT_LIST_FIELDS) {
      if (field in row) kept[field] = row[field];
    }
    return kept;
  });
}

/** The queries kept. */
export const SHELL_QUERY_PARTS: readonly ShellQueryPart[] = [
  { name: "roster", key: (c) => rosterQueryKey(c) },
  { name: "permissions", key: (c) => myPermissionsQueryKey(c) },
  { name: "chapter", key: (c) => currentChapterQueryKey(c), keep: chapterHead },
  { name: "events", key: (c) => eventsQueryKey(c), keep: eventList },
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
  /** The {@link SHELL_CACHE_BUILD} that wrote it. */
  build: string;
  data: unknown;
}

function scopePrefix(scope: ShellScope): string {
  return `${SHELL_CACHE_PREFIX}${scope.authUserId}|${scope.chapterId}|`;
}

function rowKey(scope: ShellScope, part: string): string {
  return `${scopePrefix(scope)}${part}`;
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
  const store = shellStorage();
  if (!store || data === undefined || shellCacheClosed()) return;
  try {
    const value = JSON.stringify({
      at,
      build: SHELL_CACHE_BUILD,
      data,
    } satisfies StoredRow);
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
  const store = shellStorage();
  if (!store) return rows;
  const mine = scopePrefix(scope);
  for (const key of shellKeys(store)) {
    // Another scope's, or another version's: the read can't reach it.
    if (!key.startsWith(mine)) {
      removeShellKey(store, key);
      continue;
    }
    const part = key.slice(mine.length);
    try {
      const row = JSON.parse(store.getItem(key) ?? "null") as StoredRow | null;
      if (
        !row ||
        typeof row.at !== "number" ||
        row.build !== SHELL_CACHE_BUILD ||
        now - row.at > SHELL_CACHE_MAX_AGE_MS ||
        row.at > now + 60_000
      ) {
        removeShellKey(store, key);
        continue;
      }
      rows.set(part, row);
    } catch {
      removeShellKey(store, key);
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
