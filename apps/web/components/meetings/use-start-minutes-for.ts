"use client";

import { useRouter } from "next/navigation";
import { codeOf } from "@repo/api-sdk";
import { useStartMeeting } from "@repo/hooks";
import { MEETING_ENTRY_COPY } from "@repo/validation";
import {
  guessMeetingType,
  meetingHref,
} from "@/components/meetings/meeting-copy";
import { useToast } from "@/lib/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";

/**
 * Write minutes on an event that has none: start them with the type the
 * event's name suggests and open them. One flow for every web door to it,
 * the event's Minutes row and Activity's Minutes run (#5949), as the phone's
 * `useStartMinutesFor` is.
 *
 * Minutes someone else started meanwhile, which this member may not open,
 * answer "already started": `onStale` takes the caller's read again, which
 * leaves the stale offer out, and a toast says why nothing opened.
 */
export function useStartMinutesFor(onStale: () => unknown) {
  const router = useRouter();
  const { toast } = useToast();
  const start = useStartMeeting();

  async function startFor(event: { id: string; name: string }) {
    try {
      const meeting = await start.mutateAsync({
        event_id: event.id,
        meeting_type: guessMeetingType(event.name),
      });
      router.push(meetingHref(meeting.id));
      return true;
    } catch (error) {
      if (codeOf(error) === "meeting.already_started") {
        void onStale();
        toast({
          title: MEETING_ENTRY_COPY.alreadyStartedTitle,
          description: MEETING_ENTRY_COPY.alreadyStartedBody,
        });
        return false;
      }
      toast({
        title: MEETING_ENTRY_COPY.startFailed,
        description: getErrorMessage(error, "Try again in a moment."),
        variant: "destructive",
      });
      return false;
    }
  }

  return { startFor, isPending: start.isPending };
}
