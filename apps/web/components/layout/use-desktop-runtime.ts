"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  addressedUnreadTotal,
  CHANNEL_UNREAD_COUNTS_KEY,
  invalidateNotificationLists,
  useActiveChapterId,
  useChannelUnreadCounts,
  useChannels,
  useMarkNotificationRead,
  useMarkNotificationsRead,
  useNotifications,
} from "@repo/hooks";
import { unreadNonChatNotificationCount } from "@repo/hooks/notification-rows";
import { isDirectChannel } from "@repo/validation";
import { deepLinkFor } from "@/components/layout/notifications-popover";
import { desktopBridge } from "@/lib/desktop/bridge";
import {
  type DesktopNotice,
  type NoticeRow,
  newestRowTime,
  planDesktopNotices,
} from "@/lib/desktop/notices";
import { asArray } from "@/lib/utils";

type UnreadRow = {
  channel_id: string;
  unread_count: number;
  mention_count: number;
};

/**
 * How often the list and the counts are read again whatever realtime says.
 * A window hidden in the tray has its timers slowed and its socket can drop
 * with nobody looking, and a realtime ping that was missed is never replayed.
 * A minute is also the slowest a hidden page's timer is allowed to run.
 */
export const DESKTOP_REFRESH_MS = 60_000;

/**
 * What the dashboard does only inside the desktop app (ADR-29 decision 6,
 * #4842): keep the unread count on the dock or taskbar icon, and raise a
 * system notification for each new row in the member's notification list, as
 * Discord and Slack do while they run in the tray.
 *
 * Mounted by `DesktopRuntime`, only where the shell's bridge exists, so a
 * browser pays for none of it. The rules for which rows are raised are in
 * `lib/desktop/notices.ts`.
 */
export function useDesktopRuntime(): void {
  const notifications = useNotifications();
  const unread = useChannelUnreadCounts();
  const channels = useChannels();
  const markRead = useMarkNotificationRead();
  const markManyRead = useMarkNotificationsRead();
  const queryClient = useQueryClient();
  const router = useRouter();
  const chapterId = useActiveChapterId();

  // The icon's count: the phone app icon's sum.
  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge?.setBadgeCount) return;
    const directIds = new Set(
      asArray<{ id: string; type: string }>(channels.data)
        .filter(isDirectChannel)
        .map((channel) => channel.id),
    );
    const chat = addressedUnreadTotal(asArray<UnreadRow>(unread.data), (id) =>
      directIds.has(id),
    );
    bridge.setBadgeCount(
      unreadNonChatNotificationCount(notifications.data) + chat,
    );
  }, [notifications.data, unread.data, channels.data]);

  // Signing out or closing the dashboard clears it: the count is this
  // member's, and nothing is left running to keep it true.
  useEffect(() => {
    return () => desktopBridge()?.setBadgeCount?.(0);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void invalidateNotificationLists(queryClient);
      void queryClient.invalidateQueries({
        queryKey: CHANNEL_UNREAD_COUNTS_KEY,
      });
    }, DESKTOP_REFRESH_MS);
    return () => clearInterval(timer);
  }, [queryClient]);

  // Rows already handled. `null` until the first read of the list, which is
  // taken as seen: opening the app raises nothing for what was waiting.
  // Another chapter's list is a first read again, and what the last chapter
  // raised comes down: a click on it would open its row under this chapter.
  const announced = useRef<Set<string> | null>(null);
  const since = useRef(0);
  const raised = useRef(new Set<Notification>());
  useEffect(() => {
    const shown = raised.current;
    return () => {
      announced.current = null;
      for (const notification of shown) notification.close();
      shown.clear();
    };
  }, [chapterId]);

  const open = useRef<(row: NoticeRow, notice: DesktopNotice) => void>(
    () => {},
  );
  useEffect(() => {
    open.current = (row, notice) => {
      desktopBridge()?.showWindow?.();
      // Belt and braces for the chapter guard above: never read or open a
      // row under a chapter it doesn't belong to.
      if (row.chapter_id && chapterId && row.chapter_id !== chapterId) return;
      if (notice.unreadIds.length === 1) markRead.mutate(notice.unreadIds[0]!);
      else if (notice.unreadIds.length > 1)
        markManyRead.mutate({ ids: notice.unreadIds });
      router.push(deepLinkFor(row as Parameters<typeof deepLinkFor>[0]));
    };
  }, [markRead, markManyRead, router, chapterId]);

  useEffect(() => {
    if (notifications.data === undefined) return;
    if (typeof Notification === "undefined") return;
    const rows = asArray<NoticeRow>(notifications.data);
    if (announced.current === null) {
      announced.current = new Set(rows.map((row) => row.id));
      since.current = newestRowTime(rows);
      return;
    }
    const notices = planDesktopNotices(rows, {
      announced: announced.current,
      since: since.current,
    });
    for (const row of rows) announced.current.add(row.id);
    for (const notice of notices) {
      const row = rows.find((candidate) => candidate.id === notice.id);
      if (!row) continue;
      try {
        const shown = new Notification(notice.title, {
          body: notice.body,
          tag: notice.tag,
          silent: notice.silent,
        });
        raised.current.add(shown);
        shown.onclick = () => open.current(row, notice);
        shown.onclose = () => raised.current.delete(shown);
      } catch {
        // The system refused it (notifications off for Frapp): the list and
        // the icon's count still have it.
      }
    }
  }, [notifications.data]);
}
