"use client";

import { useMemo } from "react";
import {
  channelJumpLists,
  channelsThatLookUnread,
  jumpableChannels,
  type JumpChannel,
} from "./channel-jump";
import {
  sidebarMutedChannelIds,
  sidebarUnreadCounts,
  type SidebarUnreadCounts,
} from "./channel-sidebar";
import {
  useCategories,
  useChannelNotificationPreferences,
  useChannelUnreadCounts,
  useChannels,
} from "./use-chat";

/**
 * Jump to a channel's lists and per-row facts (#6053), for web's Find and the
 * phone's Search; the rules are `channel-jump.ts`.
 */
export interface ChannelJump<C extends JumpChannel = JumpChannel> {
  /** Every channel a member can jump to. */
  channels: C[];
  unread: C[];
  recent: C[];
  /** The server's counts for a channel, for its row's weight and mention count. */
  countsFor: (channelId: string) => SidebarUnreadCounts | undefined;
  /** Whether a channel's row reads unread (bold). */
  looksUnread: (channelId: string) => boolean;
  /** A channel's category name, its row's hint. */
  categoryOf: (channel: JumpChannel) => string | undefined;
}

/**
 * The lists and the per-row facts, from reads the channel list already keeps
 * warm (channels, unread counts, notification levels, categories), so opening
 * Find or Search costs no request of its own.
 */
export function useChannelJump(recentIds: readonly string[]): ChannelJump {
  const channelsQuery = useChannels();
  const unreadQuery = useChannelUnreadCounts();
  const levelsQuery = useChannelNotificationPreferences();
  const categoriesQuery = useCategories();

  const channels = useMemo(
    () =>
      jumpableChannels(
        Array.isArray(channelsQuery.data)
          ? (channelsQuery.data as JumpChannel[])
          : undefined,
      ),
    [channelsQuery.data],
  );
  const unreadByChannelId = useMemo(
    () =>
      sidebarUnreadCounts({
        data: unreadQuery.data,
        isError: unreadQuery.isError,
      }),
    [unreadQuery.data, unreadQuery.isError],
  );
  const mutedChannelIds = useMemo(
    () =>
      sidebarMutedChannelIds({
        data: levelsQuery.data,
        isError: levelsQuery.isError,
      }),
    [levelsQuery.data, levelsQuery.isError],
  );
  const categoryNames = useMemo(() => {
    const names = new Map<string, string>();
    const rows = Array.isArray(categoriesQuery.data)
      ? (categoriesQuery.data as { id: string; name: string }[])
      : [];
    for (const row of rows) names.set(row.id, row.name);
    return names;
  }, [categoriesQuery.data]);

  return useMemo(() => {
    const { unread, recent } = channelJumpLists({
      channels,
      unreadByChannelId,
      mutedChannelIds,
      recentIds,
    });
    const unreadIds = channelsThatLookUnread(
      channels,
      unreadByChannelId,
      mutedChannelIds,
    );
    return {
      channels,
      unread,
      recent,
      countsFor: (channelId) => unreadByChannelId?.get(channelId),
      looksUnread: (channelId) => unreadIds.has(channelId),
      categoryOf: (channel) =>
        channel.category_id
          ? categoryNames.get(channel.category_id)
          : undefined,
    };
  }, [channels, unreadByChannelId, mutedChannelIds, recentIds, categoryNames]);
}
