"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChannelListSkeleton } from "@/components/chat/channel-list-skeleton";
import { cn } from "@/lib/utils";

/**
 * Where the chapter's channel list is drawn: the sidebar (#5946).
 *
 * The list is chat's own (`chat-shell.tsx` owns the open channel, the unread
 * counts, the row menus, the drag reorder and their realtime reads), and it
 * moved out of the chat panel into the sidebar so it is always in view. It
 * moved as a portal, not as a copy: the sidebar offers a slot, and the one
 * mounted chat shell draws its list into it. Nothing is subscribed twice,
 * because nothing is mounted twice.
 *
 * `ChannelListSlotProvider` wraps the shell. The sidebar renders
 * `ChannelListSlot` where the list goes (the column, or the rail's Channels
 * popover while it is open); the chat shell reads `useChannelListSlot` and
 * portals into it. A pick is announced back through `onPicked`, so the rail's
 * popover can close behind it.
 */
type SlotContext = {
  slot: HTMLElement | null;
  setSlot: (element: HTMLElement | null) => void;
  /** Called by the list when the member picks a row. */
  notifyPicked: () => void;
  /** Subscribes to picks; returns the unsubscribe. */
  onPicked: (listener: () => void) => () => void;
};

const ChannelListSlotContext = createContext<SlotContext | null>(null);

export function ChannelListSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const listeners = useRef(new Set<() => void>());
  const notifyPicked = useCallback(() => {
    for (const listener of listeners.current) listener();
  }, []);
  const onPicked = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const value = useMemo(
    () => ({ slot, setSlot, notifyPicked, onPicked }),
    [slot, notifyPicked, onPicked],
  );
  return (
    <ChannelListSlotContext.Provider value={value}>
      {children}
    </ChannelListSlotContext.Provider>
  );
}

/**
 * The sidebar's slot, for the chat shell: the element to portal the channel
 * list into (null while no slot is on screen), and how to announce a pick.
 * Outside a provider (a chat shell rendered alone, as its specs do) there is
 * no slot and the list has nowhere to go but in place.
 */
export function useChannelListSlot(): {
  slot: HTMLElement | null;
  notifyPicked: () => void;
} {
  const context = useContext(ChannelListSlotContext);
  return useMemo(
    () => ({
      slot: context?.slot ?? null,
      notifyPicked: context?.notifyPicked ?? (() => {}),
    }),
    [context?.slot, context?.notifyPicked],
  );
}

/** The list body the chat shell portals in carries this, so the slot knows. */
export const CHANNEL_LIST_BODY_ATTRIBUTE = "data-channel-list-body";

/**
 * The place in the sidebar the channel list fills. Until the chat shell has
 * drawn into it (the server render, hydration, a first load) it holds the
 * list's own skeleton, so the column is never an empty band.
 */
export function ChannelListSlot({
  onPicked,
  className,
}: {
  /** The member picked a row (the rail's popover closes on it). */
  onPicked?: () => void;
  className?: string;
}) {
  const context = useContext(ChannelListSlotContext);
  const setSlot = context?.setSlot;
  const subscribe = context?.onPicked;
  const ref = useCallback(
    (element: HTMLDivElement | null) => setSlot?.(element),
    [setSlot],
  );
  useEffect(() => {
    if (!onPicked || !subscribe) return;
    return subscribe(onPicked);
  }, [onPicked, subscribe]);
  return (
    <div
      ref={ref}
      data-channel-list-slot=""
      className={cn("flex min-h-0 flex-1 flex-col", className)}
    >
      <div
        aria-hidden="true"
        // Gone once the list is here. The attribute is spelled out because
        // Tailwind only compiles a class it can read whole
        // (`CHANNEL_LIST_BODY_ATTRIBUTE`).
        className="p-2 [&:has(~[data-channel-list-body])]:hidden"
      >
        <ChannelListSkeleton />
      </div>
    </div>
  );
}
