import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { readPushState, type PushState } from "@/lib/notifications/push-state";

/**
 * OS notification permission and the Android channel (`readPushState()`),
 * read once on mount and again on every foreground. Settings' first page
 * reads it for the Notifications row's "Off", and the Notifications page for
 * its switch.
 *
 * The re-read matters because turning push *off* (and back on, once the OS
 * stops asking) happens in the OS settings app, so the member leaves,
 * changes it, and comes back, and a row still reporting the old answer
 * would be worse than no row. `null` while unread, so the switch never
 * flashes off at a member who has granted it.
 */
export function usePushState() {
  const [pushState, setPushState] = useState<PushState | null>(null);
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      void readPushState()
        .then((next) => {
          if (!cancelled) setPushState(next);
        })
        .catch(() => {
          // An unreadable permission is unknown, not "off": the row draws no
          // switch rather than telling someone who has granted push to go turn
          // it on. Swallowed rather than surfaced: there is nothing a member
          // can do about it, and an unhandled rejection would be worse.
          if (!cancelled) setPushState(null);
        });
    };
    read();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") read();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
  return [pushState, setPushState] as const;
}
