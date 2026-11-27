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
  /**
   * The same channels with their category's name, the rows a search's
   * Channels group takes (`buildFindResults`), so its hint matches the jump
   * rows'.
   */
  findChannels: (C & { category: string | undefined })[];
  unread: C[];
  recent: C[];
  /** The unread counts are known (not loading, not failed). */
  countsKnown: boolean;
  /** The server's counts for a channel, for its row's weight and count. */
  countsFor: (channelId: string) => SidebarUnreadCounts | undefined;
  /** Whether a channel's row reads unread (bold). */
  looksUnread: (channelId: string) => boolean;
  /** Whether the member muted the channel. */
  isMuted: (channelId: string) => boolean;
  /** A channel's category name, its row's hint. */
  categoryOf: (channel: JumpChannel) => string | undefined;
}

/**
 * The lists and the per-row facts. Channels, unread counts and notification
 * levels are reads the shell keeps warm on every route; the categories are
 * warm only while chat is open, so elsewhere opening Find reads them once
 * (cached for a minute), and the hints fill in when it answers.
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
    const unreadIds = channelsThatLookUnread(
      channels,
      unreadByChannelId,
      mutedChannelIds,
    );
    const { unread, recent } = channelJumpLists({
      channels,
      unreadByChannelId,
      mutedChannelIds,
      recentIds,
      unreadIds,
    });
    const categoryOf = (channel: JumpChannel) =>
      channel.category_id ? categoryNames.get(channel.category_id) : undefined;
    return {
      channels,
      findChannels: channels.map((channel) => ({
        ...channel,
        category: categoryOf(channel),
      })),
      unread,
      recent,
      countsKnown: unreadByChannelId !== undefined,
      countsFor: (channelId) => unreadByChannelId?.get(channelId),
      looksUnread: (channelId) => unreadIds.has(channelId),
      isMuted: (channelId) => mutedChannelIds?.has(channelId) ?? false,
      categoryOf,
    };
  }, [channels, unreadByChannelId, mutedChannelIds, recentIds, categoryNames]);
}
