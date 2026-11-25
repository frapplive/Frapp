"use client";

import { useMemo } from "react";
import {
  countsAddressMember,
  sidebarUnreadCounts,
  useChannelNotificationPreferences,
  useChannelUnreadCounts,
  useChannels,
} from "@repo/hooks";
import { isDirectChannel } from "@repo/validation";
import { asArray } from "@/lib/utils";

/**
 * What is new in chat, split the way the sidebar splits it (#3774, #5946):
 * the chapter's channels, and the member's conversations, which the Messages
 * row counts. Both stay until the counts say the member has read them, and
 * the shell-wide inbox binding keeps the counts live on every route
 * (`use-chat-realtime-binding.ts`, #3745).
 *
 * - **Channels** show their own unread in the sidebar's list. Where the list
 *   is out of sight (the rail and the drawer, which hold a Channels button in
 *   its place) that button lights (#3824) two ways, the same two the channel
 *   list draws: an @-mention, which gets past a mute as it does for push and
 *   for the list's Hide muted filter (`countsAddressMember`, foundations §5);
 *   or anything unread in a channel known not to be muted. Levels are read
 *   from the last good preferences, so a failed refetch keeps a muted channel
 *   muted; while they have never loaded, plain unread lights nothing.
 * - **Direct messages** are counted, not lit: the number of conversations
 *   with anything unread. A direct message addresses the member, so it counts
 *   past a mute. The phone's Messages tab badge also counts a group DM whose thread
 *   has new replies (#5277); this count doesn't yet, since that would read the
 *   member's threads on every route (#5346).
 *
 * Counts are the server's (`GET /v1/channels/unread`, the read the list uses),
 * never a local re-derivation, and unknown counts light nothing. Until the
 * channel list has loaded a row's kind is unknown, and it is read as a
 * channel, so a DM lights Channels for that moment rather than nothing at all.
 */
type ChatUnread = {
  channels: boolean;
  directConversations: number;
};

const NOTHING_UNREAD: ChatUnread = { channels: false, directConversations: 0 };

function useChatUnread(): ChatUnread {
  const unreadQuery = useChannelUnreadCounts();
  const prefsQuery = useChannelNotificationPreferences();
  const channelsQuery = useChannels();
  return useMemo(() => {
    const counts = sidebarUnreadCounts({
      data: unreadQuery.data,
      isError: unreadQuery.isError,
    });
    if (!counts) return NOTHING_UNREAD;
    const directIds = new Set(
      asArray<{ id: string; type: string }>(channelsQuery.data)
        .filter(isDirectChannel)
        .map((c) => c.id),
    );
    const levels = prefsQuery.data
      ? new Map(prefsQuery.data.map((row) => [row.channel_id, row.level]))
      : undefined;
    let channels = false;
    let directConversations = 0;
    for (const [channelId, c] of counts) {
      if (directIds.has(channelId)) {
        if (countsAddressMember(true, c)) directConversations += 1;
        continue;
      }
      if (countsAddressMember(false, c)) channels = true;
      else if (c.unreadCount > 0 && levels && levels.get(channelId) !== "off") {
        channels = true;
      }
    }
    if (!channels && directConversations === 0) return NOTHING_UNREAD;
    return { channels, directConversations };
  }, [
    unreadQuery.data,
    unreadQuery.isError,
    prefsQuery.data,
    channelsQuery.data,
  ]);
}

/**
 * Whether chat has anything new at all, channels or direct messages: the
 * phone-width menu button's dot, which stands for every row in the drawer.
 */
export function useChatHasUnread(): boolean {
  const unread = useChatUnread();
  return unread.channels || unread.directConversations > 0;
}

export type NavHighlights = {
  /** The rail's and the drawer's Channels button has something unread. */
  channels: boolean;
  /** Conversations with anything unread: the Messages row's red count. */
  messages: number;
};

/**
 * What the sidebar lights for chat, on every route and in the drawer until
 * seen (#3824, #3774).
 *
 * Read by the sidebar itself, never by `DashboardShell`'s body: the counts
 * change with every message the inbox reports, on every route, and only the
 * sidebar has to redraw for it.
 */
export function useNavHighlights(): NavHighlights {
  const { channels, directConversations } = useChatUnread();
  return useMemo(
    () => ({ channels, messages: directConversations }),
    [channels, directConversations],
  );
}
