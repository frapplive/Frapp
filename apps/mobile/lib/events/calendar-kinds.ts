import { useCallback, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useViewerUserId } from "@repo/hooks";
import {
  type CalendarKind,
  DEFAULT_HIDDEN_CALENDAR_KINDS,
  parseHiddenCalendarKinds,
  serializeHiddenCalendarKinds,
} from "@repo/hooks/calendar-tasks";

/**
 * The kinds the phone's Calendar key has switched off (#5948), per member on
 * this phone, as web keeps them per member on a browser
 * (`apps/web/lib/events/events-view.ts`). Until a member touches the key,
 * Tasks are off (`DEFAULT_HIDDEN_CALENDAR_KINDS`; Paul's decision 1 on #5943:
 * the Calendar is the chapter's, and a member's own tasks live in Activity).
 *
 * Read once per member per app process and held in memory after that, so the
 * month and the Day screen agree without a second read. Best-effort: a
 * storage error reads as the default, and a failed write keeps the choice
 * until the app restarts. A tap made before the stored read lands is applied
 * once it has, on top of what was kept.
 */

const KEY_PREFIX = "frapp.mobile.calendar-hidden-kinds:";

type Storage = Pick<typeof AsyncStorage, "getItem" | "setItem">;

const values = new Map<string, ReadonlySet<CalendarKind>>();
const reads = new Map<string, Promise<void>>();
const chosen = new Set<string>();
const listeners = new Set<() => void>();
let storage: Storage = AsyncStorage;

function notify() {
  for (const listener of listeners) listener();
}

function hydrate(userId: string) {
  if (reads.has(userId)) return;
  reads.set(
    userId,
    storage
      .getItem(KEY_PREFIX + userId)
      .then((raw) => {
        if (chosen.has(userId)) return;
        const stored = parseHiddenCalendarKinds(raw);
        if (stored) {
          values.set(userId, stored);
          notify();
        }
      })
      .catch(() => {
        /* The default stands. */
      }),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The kinds hidden for the signed-in member, and the key's toggle. */
export function useHiddenCalendarKinds(): {
  hidden: ReadonlySet<CalendarKind>;
  toggle: (kind: CalendarKind) => void;
} {
  const userId = useViewerUserId();
  if (userId) hydrate(userId);
  const read = () =>
    (userId ? values.get(userId) : undefined) ?? DEFAULT_HIDDEN_CALENDAR_KINDS;
  const hidden = useSyncExternalStore(subscribe, read, read);
  const toggle = useCallback(
    (kind: CalendarKind) => {
      if (!userId) return;
      const apply = () => {
        const next = new Set(
          values.get(userId) ?? DEFAULT_HIDDEN_CALENDAR_KINDS,
        );
        if (next.has(kind)) next.delete(kind);
        else next.add(kind);
        chosen.add(userId);
        values.set(userId, next);
        notify();
        storage
          .setItem(KEY_PREFIX + userId, serializeHiddenCalendarKinds(next))
          .catch(() => {
            /* Best-effort: the choice holds until the app restarts. */
          });
      };
      // A tap before the stored choice is read waits for it, so it changes
      // what the member kept rather than the default.
      const read = reads.get(userId);
      if (read) void read.then(apply);
      else apply();
    },
    [userId],
  );
  return { hidden, toggle };
}

/**
 * Test seam: a fresh process, optionally over a fake storage, and optionally
 * with members' choices already read (no read is then made for them).
 */
export function resetCalendarKindsForTests(
  next: Storage = AsyncStorage,
  seed: Record<string, ReadonlySet<CalendarKind>> = {},
) {
  values.clear();
  reads.clear();
  chosen.clear();
  storage = next;
  for (const [userId, hidden] of Object.entries(seed)) {
    values.set(userId, hidden);
    reads.set(userId, Promise.resolve());
  }
}
