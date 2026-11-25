import { createContext, useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useRouter } from "expo-router";
import {
  activityMinutesMeeting,
  useSetMeetingNoMinutes,
  type ActivityRow,
} from "@repo/hooks";
import { errorCopy } from "@repo/hooks/error-copy";
import { MEETING_COPY, MEETING_LIST_COPY } from "@repo/validation";
import { CloseGlyph } from "@/components/control-glyphs";
import type { ItemMenuAction } from "@/components/item-actions-menu";
import { NOTICE_MS } from "@/components/quick-actions/quick-actions-host";
import {
  MinutesStartError,
  useStartMinutesFor,
} from "@/lib/minutes/start-minutes";

export type MinutesToWriteRow = Extract<
  ActivityRow,
  { kind: "minutes-to-write" }
>;

/** A line the To do list shows a few seconds, with Undo when it has one. */
export interface ActivityMinutesNotice {
  text: string;
  undo: (() => void) | null;
}

/** What the screen's minutes rows need (#5949). */
export interface ActivityMinutesActions {
  /** The event whose minutes are being started, one at a time. */
  startingId: string | null;
  /** Starts minutes on the row's meeting and opens them. */
  write: (row: MinutesToWriteRow) => void;
  /** The row's long press: No minutes for this meeting. */
  menuActions: (row: ActivityRow) => ItemMenuAction[];
  notice: ActivityMinutesNotice | null;
}

/**
 * The screen's minutes actions, for its rows without threading them through
 * each list (`ActivityRowItem` reads it for Write minutes). `null` draws a
 * Write minutes row with no button.
 */
export const ActivityMinutesContext =
  createContext<ActivityMinutesActions | null>(null);

/**
 * Activity's Write minutes rows on the phone (#5949), doing what the Minutes
 * list's rows did, in its words: Write minutes starts them on that event
 * (`useStartMinutesFor`, the start the + menu's New minutes and the event's
 * Minutes row make, with the type the name suggests) and opens them;
 * another officer's minutes this member can't see answer "already started",
 * and the read is taken again, which leaves the row out. The long press's
 * "No minutes for this meeting" settles it, and the list says so in a line,
 * read out, with Undo, as web's toast offers it.
 *
 * Held by the screen: marking takes the row off the list, and the line has
 * to outlive it. `reread` takes Activity's read again after each write.
 */
export function useActivityMinutesActions(
  reread: () => void,
): ActivityMinutesActions {
  const router = useRouter();
  const starter = useStartMinutesFor();
  const setNoMinutes = useSetMeetingNoMinutes();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActivityMinutesNotice | null>(null);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const say = (text: string, undo: (() => void) | null = null) => {
    setNotice({ text, undo });
    AccessibilityInfo.announceForAccessibility(text);
  };

  async function write(row: MinutesToWriteRow) {
    if (startingId) return;
    const event = activityMinutesMeeting(row);
    setStartingId(event.id);
    try {
      const meeting = await starter.start({
        kind: "event",
        event: { id: event.id, name: event.name },
      });
      reread();
      router.push({ pathname: "/minutes-details", params: { id: meeting.id } });
    } catch (error) {
      if (error instanceof MinutesStartError && error.alreadyStarted) reread();
      say(error instanceof Error ? error.message : MEETING_COPY.tryAgain);
    } finally {
      setStartingId(null);
    }
  }

  function markNoMinutes(row: MinutesToWriteRow, noMinutes: boolean) {
    const event = activityMinutesMeeting(row);
    setNoMinutes.mutateAsync({ eventId: event.id, noMinutes }).then(
      () => {
        reread();
        if (noMinutes) {
          say(MEETING_LIST_COPY.markedNoMinutes(event.name), () => {
            setNotice(null);
            markNoMinutes(row, false);
          });
        } else {
          setNotice(null);
        }
      },
      (error: unknown) =>
        say(errorCopy(error, MEETING_LIST_COPY.noMinutesFailed)),
    );
  }

  return {
    startingId,
    write: (row) => void write(row),
    menuActions: (row) =>
      row.kind === "minutes-to-write"
        ? [
            {
              key: "no-minutes",
              label: MEETING_LIST_COPY.markNoMinutes,
              glyph: (color) => <CloseGlyph color={color} />,
              run: () => markNoMinutes(row, true),
            },
          ]
        : [],
    notice,
  };
}
