"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { codeOf } from "@repo/api-sdk";
import {
  activityMinutesMeeting,
  useSetMeetingNoMinutes,
  useStartMeeting,
  type ActivityRow,
} from "@repo/hooks";
import {
  MEETING_ENTRY_COPY,
  MEETING_LIST_COPY,
  guessMeetingType,
} from "@repo/validation";
import type { RowMenuEntry } from "@/components/shared/row-menu";
import { ToastAction } from "@/components/ui/toast";
import { meetingHref } from "@/components/meetings/meeting-copy";
import { useToast } from "@/lib/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";

export type MinutesToWriteRow = Extract<
  ActivityRow,
  { kind: "minutes-to-write" }
>;

/** What a Write minutes row needs from the page (#5949). */
export interface ActivityMinutesActions {
  /** The event whose minutes are being started, one at a time. */
  startingId: string | null;
  /** Starts minutes on the row's meeting and opens them. */
  write: (row: MinutesToWriteRow) => void;
  /** The row's menu: No minutes for this meeting. */
  entriesFor: (row: MinutesToWriteRow) => RowMenuEntry[];
}

/**
 * Activity's Write minutes rows (#5949), doing what the Meetings list page's
 * did and in its words: Write minutes starts them on that event with the
 * type its name suggests (`guessMeetingType`), as the event's own Minutes
 * row does, and opens them; another officer's minutes that this member
 * can't see answer "already started", and the read is taken again, which
 * leaves the row out. The menu's "No minutes for this meeting" settles it at
 * once, with Undo, as Gmail's archive is.
 *
 * Held by the page, not the row: marking takes the row off the list, which
 * unmounts it, and its toast and Undo have to come from something that
 * stays. `reread` takes Activity's read again after each write.
 */
export function useActivityMinutesActions(
  reread: () => Promise<unknown>,
): ActivityMinutesActions {
  const router = useRouter();
  const { toast } = useToast();
  const start = useStartMeeting();
  const setNoMinutes = useSetMeetingNoMinutes();
  const [startingId, setStartingId] = useState<string | null>(null);

  async function write(row: MinutesToWriteRow) {
    if (startingId) return;
    const event = activityMinutesMeeting(row);
    setStartingId(event.id);
    try {
      const meeting = await start.mutateAsync({
        event_id: event.id,
        meeting_type: guessMeetingType(event.name),
      });
      void reread();
      router.push(meetingHref(meeting.id));
    } catch (error) {
      if (codeOf(error) === "meeting.already_started") {
        void reread();
        toast({
          title: MEETING_ENTRY_COPY.alreadyStartedTitle,
          description: MEETING_ENTRY_COPY.alreadyStartedBody,
        });
        return;
      }
      toast({
        title: MEETING_ENTRY_COPY.startFailed,
        description: getErrorMessage(error, "Try again in a moment."),
        variant: "destructive",
      });
    } finally {
      setStartingId(null);
    }
  }

  function markNoMinutes(row: MinutesToWriteRow, noMinutes: boolean) {
    const event = activityMinutesMeeting(row);
    const failed = (error: unknown) =>
      toast({
        title: MEETING_LIST_COPY.noMinutesFailed,
        description: getErrorMessage(error, "Try again in a moment."),
        variant: "destructive",
      });
    setNoMinutes.mutateAsync({ eventId: event.id, noMinutes }).then(() => {
      void reread();
      if (!noMinutes) return;
      toast({
        title: MEETING_LIST_COPY.markedNoMinutes(event.name),
        action: (
          <ToastAction
            altText={`${MEETING_LIST_COPY.undo}: ${MEETING_LIST_COPY.markedNoMinutes(event.name)}`}
            onClick={() => markNoMinutes(row, false)}
          >
            {MEETING_LIST_COPY.undo}
          </ToastAction>
        ),
      });
    }, failed);
  }

  return {
    startingId,
    write: (row) => void write(row),
    entriesFor: (row) => [
      {
        type: "item",
        key: "no-minutes",
        label: MEETING_LIST_COPY.markNoMinutes,
        onSelect: () => markNoMinutes(row, true),
      },
    ],
  };
}
