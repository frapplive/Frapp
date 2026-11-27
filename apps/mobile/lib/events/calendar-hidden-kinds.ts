import { useCallback, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  hiddenCalendarKindsOrDefault,
  parseHiddenCalendarKinds,
  serializeHiddenCalendarKinds,
  toggleCalendarKind,
  type CalendarKind,
} from "@repo/hooks/calendar-tasks";

/**
 * The kinds the Calendar's key has switched off (#5948), kept on the phone
 * per member, as web keeps them per member in its browser
 * (`apps/web/lib/events/events-view.ts`, the same stored form). Nothing
 * stored is the shared defaults: tasks off, events and birthdays on
 * (`DEFAULT_HIDDEN_CALENDAR_KINDS`).
 *
 * One store for the process, so the month and the Day screen pushed over it
 * read the same choice the moment it changes. Read once per member, then
 * held in memory. Best-effort both ways: a storage error reads as the
 * defaults, and a failed write keeps the choice until the app restarts.
 *
 * Not built on `createStoredPreference` (`lib/stored-preference.ts`), which
 * holds one string per key and lets a choice made before its read win
 * outright. This holds a set per member, and a tap waits on the member's
 * stored read so it switches only the kind tapped.
 */

function storageKey(userId: string): string {
  return `frapp.calendar.hidden-kinds.${userId}`;
}

/** Per member: the stored choice, `null` while nothing is stored or read. */
const chosen = new Map<string, Set<CalendarKind> | null>();
const reads = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Reads the member's stored choice once; later calls return the same read. */
function hydrate(userId: string): Promise<void> {
  const pending = reads.get(userId);
  if (pending) return pending;
  const read = AsyncStorage.getItem(storageKey(userId))
    .then((raw) => {
      if (chosen.has(userId)) return;
      chosen.set(userId, parseHiddenCalendarKinds(raw));
      notify();
    })
    .catch(() => {
      // The defaults stand, and count as read, so a toggle has a base.
      if (!chosen.has(userId)) chosen.set(userId, null);
    });
  reads.set(userId, read);
  return read;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The member's hidden kinds, and the key's toggle. With no member yet (a
 * cold start before the session reads), the defaults, and the toggle does
 * nothing to storage.
 */
export function useHiddenCalendarKinds(userId: string | null | undefined): {
  hidden: ReadonlySet<CalendarKind>;
  toggle: (kind: CalendarKind) => void;
} {
  if (userId) void hydrate(userId);
  const stored = useSyncExternalStore(
    subscribe,
    () => (userId ? (chosen.get(userId) ?? null) : null),
    () => null,
  );
  const hidden = hiddenCalendarKindsOrDefault(stored);
  const toggle = useCallback(
    (kind: CalendarKind) => {
      if (!userId) return;
      // Switched against what the member has stored, never against the
      // defaults standing in for it: a tap before the read lands waits for
      // it (milliseconds), so switching Birthdays can't also write Tasks
      // back off for a member who had turned them on.
      const apply = () => {
        const next = toggleCalendarKind(
          hiddenCalendarKindsOrDefault(chosen.get(userId) ?? null),
          kind,
        );
        chosen.set(userId, next);
        notify();
        AsyncStorage.setItem(
          storageKey(userId),
          serializeHiddenCalendarKinds(next),
        ).catch(() => {
          /* Best-effort: the choice holds until the app restarts. */
        });
      };
      if (chosen.has(userId)) apply();
      else void hydrate(userId).then(apply);
    },
    [userId],
  );
  return { hidden, toggle };
}

/** Test seam: back to a fresh process. */
export function resetHiddenCalendarKindsForTests(): void {
  chosen.clear();
  reads.clear();
  listeners.clear();
}

/** Test seam: a member's stored choice, as if read from storage. */
export function seedHiddenCalendarKindsForTests(
  userId: string,
  hidden: ReadonlySet<CalendarKind>,
): void {
  chosen.set(userId, new Set(hidden));
  reads.set(userId, Promise.resolve());
}
