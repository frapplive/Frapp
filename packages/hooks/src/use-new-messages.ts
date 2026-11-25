"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  advancePill,
  dividerSide,
  NEW_MESSAGES_SEEK_MAX_PAGES,
  PILL_START,
  pillDirection,
  placeNewMessagesDivider,
  type NewMessagesMark,
  type NewMessagesRow,
  type PillProgress,
} from "@repo/chat-core/new-messages";

interface VisitState {
  channelKey: string | null;
  mark: NewMessagesMark | null;
  progress: PillProgress;
  /** The rows on screen, by index into `rows`, or `null` before a report. */
  visible: { first: number; last: number } | null;
  /** Older pages read looking for the divider, while a pill tap seeks it. */
  seekPages: number | null;
}

function freshVisit(
  channelKey: string | null,
  mark: NewMessagesMark | null,
): VisitState {
  return {
    channelKey,
    mark,
    progress: PILL_START,
    visible: null,
    seekPages: null,
  };
}

/**
 * A channel thread's "New messages" divider and the pill pointing to it
 * (#6052): the rules in `@repo/chat-core/new-messages`, kept per visit. Both
 * threads use it: web's timeline (`components/chat/message-timeline.tsx`) and
 * the phone's (`app/(app)/chat-thread.tsx`). Each owns its own scroll, as with
 * `useJumpToLatest`, and speaks to this in rows oldest first: the phone's
 * list is inverted, so it turns its indices round on the way in and out.
 *
 * `mark` is what the counts said as the channel opened (the shell takes it
 * once per channel), so the stamps that follow, the open's own included, move
 * nothing here. A new `mark` or channel starts a new visit.
 *
 * `rows` are the thread's, oldest first; `reportRange` and `scrollToRow` index
 * into them. `atNewest` is the jump control's (`useJumpToLatest`),
 * so the two controls agree on where the newest message is. `scrollToRow`
 * puts a row at the top of the screen; `loadOlder` reads one older page, and
 * a pill tap pages back through it for a divider in history not loaded yet,
 * up to `NEW_MESSAGES_SEEK_MAX_PAGES`.
 */
export function useNewMessages({
  channelKey,
  mark,
  rows,
  hasOlder,
  isLoadingOlder,
  olderError,
  atNewest,
  scrollToRow,
  loadOlder,
  onMarkRead,
}: {
  channelKey: string | null;
  mark: NewMessagesMark | null;
  rows: readonly NewMessagesRow[];
  hasOlder: boolean;
  isLoadingOlder: boolean;
  olderError: boolean;
  atNewest: boolean;
  scrollToRow: (index: number) => void;
  loadOlder?: () => void;
  onMarkRead?: () => void;
}) {
  const [visit, setVisit] = useState<VisitState>(() =>
    freshVisit(channelKey, mark),
  );
  // Reset during render, as the jump control does, so no frame draws the last
  // channel's divider over this one's rows.
  const current =
    visit.channelKey === channelKey && visit.mark === mark
      ? visit
      : freshVisit(channelKey, mark);
  if (current !== visit) setVisit(current);

  const { progress, visible, seekPages } = current;
  const place = useMemo(
    () =>
      placeNewMessagesDivider(rows, progress.dismissed ? null : mark, hasOlder),
    [rows, progress.dismissed, mark, hasOlder],
  );
  const dividerKey = place?.at === "row" ? place.id : null;
  const dividerIndex = useMemo(
    () =>
      dividerKey === null ? -1 : rows.findIndex((row) => row.id === dividerKey),
    [rows, dividerKey],
  );
  const side =
    place?.at === "older" ? "above" : dividerSide(dividerIndex, visible, true);
  const direction = pillDirection(place, side, progress);
  // At the newest message by the list's own report too, not only the jump
  // control's: that one starts every channel at `newest` and learns a landing
  // on the divider a frame later, and the pill must not retire in between.
  const atEnd = atNewest && visible !== null && visible.last >= rows.length - 1;

  // What the member has done this visit: seen the divider, and read through
  // to the newest message after it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- records what the list reported on screen; `advancePill` returns the same object when nothing changed, so this settles
    setVisit((previous) => {
      const next = advancePill(previous.progress, side, atEnd);
      return next === previous.progress
        ? previous
        : { ...previous, progress: next };
    });
  }, [side, atEnd]);

  const reportRange = useCallback(
    (first: number, last: number) =>
      setVisit((previous) =>
        previous.visible?.first === first && previous.visible.last === last
          ? previous
          : { ...previous, visible: { first, last } },
      ),
    [],
  );

  // A pill tap with the divider in history not loaded yet: one older page at a
  // time, until the divider is placed, history runs out, a read fails, or the
  // budget is spent. The next page is asked for only once the last one landed
  // (the oldest row changed) or its read was seen in flight and ended, so a render before the read
  // reports itself in flight never asks twice.
  const oldestKey = rows[0]?.id;
  const lastRead = useRef<{
    from: string | undefined;
    seenInFlight: boolean;
  } | null>(null);
  useEffect(() => {
    if (lastRead.current && isLoadingOlder)
      lastRead.current.seenInFlight = true;
  }, [isLoadingOlder]);
  useEffect(() => {
    if (seekPages === null) {
      lastRead.current = null;
      return;
    }
    if (place?.at === "row" && dividerIndex >= 0) {
      scrollToRow(dividerIndex);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ends the seek the scroll above completed
      setVisit((previous) => ({ ...previous, seekPages: null }));
      return;
    }
    const canRead =
      place?.at === "older" &&
      hasOlder &&
      !olderError &&
      seekPages < NEW_MESSAGES_SEEK_MAX_PAGES &&
      loadOlder !== undefined;
    if (!canRead) {
      setVisit((previous) => ({ ...previous, seekPages: null }));
      return;
    }
    if (isLoadingOlder) return;
    const last = lastRead.current;
    if (last && last.from === oldestKey && !last.seenInFlight) return;
    lastRead.current = { from: oldestKey, seenInFlight: false };
    setVisit((previous) => ({
      ...previous,
      seekPages: (previous.seekPages ?? 0) + 1,
    }));
    loadOlder();
  }, [
    oldestKey,
    seekPages,
    place,
    dividerIndex,
    hasOlder,
    isLoadingOlder,
    olderError,
    loadOlder,
    scrollToRow,
  ]);

  const jump = useCallback(() => {
    if (dividerIndex >= 0) {
      scrollToRow(dividerIndex);
      return;
    }
    setVisit((previous) =>
      previous.seekPages === null ? { ...previous, seekPages: 0 } : previous,
    );
  }, [dividerIndex, scrollToRow]);

  const markRead = useCallback(() => {
    setVisit((previous) => ({
      ...previous,
      progress: { ...previous.progress, dismissed: true },
      seekPages: null,
    }));
    onMarkRead?.();
  }, [onMarkRead]);

  return {
    /** The row the divider is drawn above, by key. */
    dividerKey,
    dividerIndex,
    /** The pill's arrow, or `null` for no pill. */
    direction,
    /** The server's count as the channel opened. */
    count: mark?.count ?? 0,
    jump,
    markRead,
    /** The list's on-screen rows, by index into `rows`. */
    reportRange,
  };
}
