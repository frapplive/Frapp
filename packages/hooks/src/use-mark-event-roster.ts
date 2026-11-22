import { useCallback } from "react";
import {
  useMarkAttendanceByHand,
  useUpdateAttendanceStatus,
} from "./use-attendance";
import type { EventRosterRow, EventRosterStatus } from "./event-roster";

/**
 * Marks one person on an event's roster, both apps. A row with an attendance
 * record is changed in place (`PATCH`); a member with none yet (the "Not
 * here" rows while check-in is open) is recorded through the by-hand route,
 * since the `PATCH` only edits a row that exists. Rejects with words a
 * failure alert can show when the server leaves the member out.
 */
export function useMarkEventRosterRow(
  eventId: string,
): (
  row: Pick<EventRosterRow, "userId" | "displayName" | "attendanceId">,
  status: Exclude<EventRosterStatus, "UNRECORDED">,
) => Promise<void> {
  const { mutateAsync: update } = useUpdateAttendanceStatus();
  const { mutateAsync: byHand } = useMarkAttendanceByHand();
  return useCallback(
    async (row, status) => {
      const patch = () =>
        update({ eventId, userId: row.userId, body: { status } });
      if (row.attendanceId || status === "ABSENT") {
        await patch();
        return;
      }
      const result = await byHand({
        eventId,
        userIds: [row.userId],
        status,
      });
      if (result.marked.includes(row.userId)) return;
      // They checked in, or another officer marked them, since the roster
      // was read: the row exists now, so change it.
      if (result.already_marked > 0) {
        await patch();
        return;
      }
      throw new Error(`${row.displayName} isn't on this event's list.`);
    },
    [eventId, update, byHand],
  );
}
