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
} from "./new-messages";

interface VisitState {
  channelKey: string | null;
  mark: NewMessagesMark | null;
  progress: PillProgress;
  /**
   * The rows on screen, by index into `rows`, or `null` before a report;
   * `atNewest` says whether the last of them was the newest row when it was
   * reported. Rows that land after a report (a backfill, an arrival the list
   * follows) don't move a member who was at the newest message until the list
   * says so.
   */
  visible: {
    first: number;
    last: number;
    atNewest: boolean;
    /** How many rows there were when it was reported. */
    rowCount: number;
  } | null;
  /**
   * Older pages read looking for the divider. `fromOpen`: the open's own
   * landing started it, so the member moving away calls it off; a pill tap's
   * runs to the end.
   */
  seek: { pages: number; fromOpen: boolean } | null;
  /** Whether this visit has still to open on the divider. */
  landing: "pending" | "done";
}

function freshVisit(
  channelKey: string | null,
  mark: NewMessagesMark | null,
  previous: VisitState | null,
): VisitState {
  return {
    channelKey,
    mark,
    progress: PILL_START,
    // A mark that lands on the same channel (the counts answering after the
    // rows drew) starts a visit on a list that is already on screen: what is
    // on screen still holds, and no range report may come to say it again.
    visible:
      previous && previous.channelKey === channelKey ? previous.visible : null,
    seek: null,
    landing: "pending",
  };
}

/**
 * A channel thread's "New messages" divider and the pill pointing to it
 * (#6052): the rules in `./new-messages`, kept per visit. Both threads use it:
 * web's timeline (`components/chat/message-timeline.tsx`) and the phone's
 * (`app/(app)/chat-thread.tsx`). Each owns its own scroll, as with
 * `useJumpToLatest`, and speaks to this in rows oldest first: the phone's list
 * is inverted, so it turns its indices round on the way in and out.
 *
 * `mark` is what the counts said as the channel opened (each thread takes it
 * once per visit), so the stamps that follow, the open's own included, move
 * nothing here. A new `mark` or channel starts a new visit.
 *
 * `rows` are the thread's, oldest first; `reportRange` and `scrollToRow`
 * index into them. `reportRange` takes the rows at least half on screen, the
 * rule both threads count a row as seen by; the newest of them being the last
 * row is what "at the newest message" means here.
 *
 * **Opening.** A visit opens on the divider, `scrollToRow` putting it at the
 * top of the screen, as soon as its row is loaded and while the member is
 * still where the thread opened them (the newest message): on the first rows,
 * or when the mark or the unread rows arrive after them. A divider in history
 * not loaded yet is paged back for, up to `NEW_MESSAGES_SEEK_MAX_PAGES`, and
 * called off if the member scrolls meanwhile. `holdLanding` says a jump to one
 * message owns this open (a search hit, a push about one message), and the
 * divider stays where it is without being scrolled to.
 *
 * **The pill** shows while the divider is off screen (`pillDirection`); a tap
 * scrolls to it, paging back for it the same way, and Mark as read takes both
 * away.
 */
export function useNewMessages({
  channelKey,
  mark,
  rows,
  hasOlder,
  isLoadingOlder,
  olderError,
  scrollToRow,
  loadOlder,
  onMarkRead,
  holdLanding = false,
}: {
  channelKey: string | null;
  mark: NewMessagesMark | null;
  rows: readonly NewMessagesRow[];
  hasOlder: boolean;
  isLoadingOlder: boolean;
  olderError: boolean;
  scrollToRow: (index: number) => void;
  loadOlder?: () => void;
  onMarkRead?: () => void;
  holdLanding?: boolean;
}) {
  const [visit, setVisit] = useState<VisitState>(() =>
    freshVisit(channelKey, mark, null),
  );
  // Reset during render, as the jump control does, so no frame draws the last
  // channel's divider over this one's rows.
  const current =
    visit.channelKey === channelKey && visit.mark === mark
      ? visit
      : freshVisit(channelKey, mark, visit);
  if (current !== visit) setVisit(current);

  const { progress, visible, seek, landing } = current;
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
  // A report from before the rows changed indexes rows that have since moved
  // (a page loaded above them), so it says nothing until the list reports
  // again, which both threads do in the same commit: the pill keeps the side
  // it had meanwhile, and nothing is recorded as seen.
  const fresh = visible !== null && visible.rowCount === rows.length;
  const freshSide =
    place?.at === "older"
      ? "above"
      : fresh
        ? dividerSide(dividerIndex, visible)
        : null;
  const trusted = fresh || place === null || place.at === "older";
  const [heldSide, setHeldSide] = useState(freshSide);
  if (trusted && heldSide !== freshSide) setHeldSide(freshSide);
  const side = trusted ? freshSide : heldSide;
  const direction = pillDirection(place, side, progress);
  // At the newest message by the rows on screen. A thread opens there, so
  // anywhere else before the landing means the member has moved.
  const atNewest = visible !== null && visible.atNewest;
  const moved = visible !== null && !visible.atNewest;

  // What the member has done this visit: seen the divider, and read through
  // to the newest message after it.
  useEffect(() => {
    if (!trusted) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- records what the list reported on screen; `advancePill` returns the same object when nothing changed, so this settles
    setVisit((previous) => {
      const next = advancePill(previous.progress, side, atNewest);
      return next === previous.progress
        ? previous
        : { ...previous, progress: next };
    });
  }, [trusted, side, atNewest]);

  const rowCount = useRef(rows.length);
  useEffect(() => {
    rowCount.current = rows.length;
  }, [rows.length]);
  const reportRange = useCallback((first: number, last: number) => {
    const atNewestNow = last >= rowCount.current - 1;
    setVisit((previous) =>
      previous.visible?.first === first &&
      previous.visible.last === last &&
      previous.visible.atNewest === atNewestNow &&
      previous.visible.rowCount === rowCount.current
        ? previous
        : {
            ...previous,
            visible: {
              first,
              last,
              atNewest: atNewestNow,
              rowCount: rowCount.current,
            },
          },
    );
  }, []);

  // Opening on the divider, once per visit.
  useEffect(() => {
    if (landing !== "pending" || !mark || rows.length === 0) return;
    const done = (next: Partial<VisitState> = {}) =>
      setVisit((previous) => ({ ...previous, landing: "done", ...next }));
    if (holdLanding || progress.dismissed || moved) {
      done();
      return;
    }
    if (place?.at === "row" && dividerIndex >= 0) {
      done();
      scrollToRow(dividerIndex);
      return;
    }
    if (place?.at === "older") done({ seek: { pages: 0, fromOpen: true } });
    // No divider yet: the unread rows may still be on their way (a reconnect
    // backfill under a cached page), so the landing waits for them.
  }, [
    landing,
    mark,
    rows.length,
    holdLanding,
    progress.dismissed,
    moved,
    place,
    dividerIndex,
    scrollToRow,
  ]);

  // Paging back for a divider not loaded yet: one older page at a time, until
  // the divider is placed, history runs out, a read fails, the budget is
  // spent, or (for the open's own seek) the member scrolls. The next page is
  // asked for only once the last one landed (the oldest row changed) or its
  // read was seen in flight and ended, so a render before the read reports
  // itself in flight never asks twice.
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
    if (seek === null) {
      lastRead.current = null;
      return;
    }
    const stop = () => setVisit((previous) => ({ ...previous, seek: null }));
    if (place?.at === "row" && dividerIndex >= 0) {
      stop();
      scrollToRow(dividerIndex);
      return;
    }
    const canRead =
      place?.at === "older" &&
      hasOlder &&
      !olderError &&
      !(seek.fromOpen && moved) &&
      seek.pages < NEW_MESSAGES_SEEK_MAX_PAGES &&
      loadOlder !== undefined;
    if (!canRead) {
      stop();
      return;
    }
    if (isLoadingOlder) return;
    const last = lastRead.current;
    if (last && last.from === oldestKey && !last.seenInFlight) return;
    lastRead.current = { from: oldestKey, seenInFlight: false };
    setVisit((previous) =>
      previous.seek
        ? {
            ...previous,
            seek: { ...previous.seek, pages: previous.seek.pages + 1 },
          }
        : previous,
    );
    loadOlder();
  }, [
    oldestKey,
    seek,
    moved,
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
    setVisit((previous) => ({
      ...previous,
      seek: { pages: 0, fromOpen: false },
    }));
  }, [dividerIndex, scrollToRow]);

  const markRead = useCallback(() => {
    setVisit((previous) => ({
      ...previous,
      progress: { ...previous.progress, dismissed: true },
      seek: null,
      landing: "done",
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
    /** The thread's rows at least half on screen, by index into `rows`. */
    reportRange,
  };
}
