"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { EVENT_PARAM, EXCUSE_PARAM } from "@/lib/events/event-links";
import { consumeAddressParam } from "@/lib/address/address";

/**
 * Opens the event `/events?event=<id>` names (`eventDeepLink`, Back, Forward
 * or a reload), once the list holds it and once per id while it stays in the
 * address. An id the list does not hold (deleted, or not visible to this
 * member) opens nothing here; the page says so and drops it.
 * Draws nothing. `excuse` says the link also asked for the sheet's Can't make it
 * line (`&excuse=1`, the chat card's button, #4660). That ask is acted on
 * every time it arrives, even for an id already opened (the page stays
 * mounted beside the docked chat), and then dropped from the URL, so the
 * card's next tap is a fresh ask rather than a URL that hasn't changed.
 */
export function OpenLinkedEvent<T>({
  events,
  idOf,
  onOpen,
}: {
  events: readonly T[];
  idOf: (event: T) => string;
  onOpen: (event: T, linked: { excuse: boolean }) => void;
}) {
  const search = useSearchParams();
  const linkedId = search?.get(EVENT_PARAM) ?? null;
  const excuse = search?.get(EXCUSE_PARAM) === "1";
  const opened = useRef<string | null>(null);
  // Set once an `excuse=1` ask is handled, until the URL drops it, so a list
  // refresh in between doesn't hand it on twice.
  const excuseHandled = useRef(false);

  useEffect(() => {
    if (!excuse) excuseHandled.current = false;
    if (!linkedId) {
      // Closed: the same event named again (Forward, a link) opens again.
      opened.current = null;
      return;
    }
    const fresh = excuse ? !excuseHandled.current : opened.current !== linkedId;
    if (!fresh) return;
    const target = events.find((event) => idOf(event) === linkedId);
    if (target === undefined) return;
    opened.current = linkedId;
    if (excuse) excuseHandled.current = true;
    onOpen(target, { excuse });
    // A one-shot mark: taken off in place once acted on (§ Addresses).
    if (excuse) consumeAddressParam(EXCUSE_PARAM);
    // `onOpen` may be a new function each render; the refs keep it to once.
  }, [linkedId, excuse, events, idOf, onOpen]);

  return null;
}
