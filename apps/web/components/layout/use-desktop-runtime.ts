"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addressedUnreadTotal,
  useActiveChapterId,
  useChannelUnreadCounts,
  useChannels,
  useMarkNotificationRead,
  useNotifications,
} from "@repo/hooks";
import { isDirectChannel } from "@repo/validation";
import { deepLinkFor } from "@/components/layout/notifications-popover";
import { CHAT_CHANNEL_PARAM } from "@/lib/chat/chat-links";
import { desktopBridge } from "@/lib/desktop/bridge";
import {
  type NoticeRow,
  planDesktopNotices,
  unreadNonChatCount,
} from "@/lib/desktop/notices";
import { asArray } from "@/lib/utils";

type UnreadRow = { channel_id: string; unread_count: number; mention_count: number };

/**
 * What the dashboard does only inside the desktop app (ADR-29 decision 6,
 * #4842): keep the unread count on the dock or taskbar icon, and raise a
 * system notification for each new row in the member's notification list, as
 * Discord and Slack do while they run in the tray. In a browser there is no
 * bridge and this does nothing; it reads only queries the shell already holds.
 *
 * The rules for which rows are raised are in `lib/desktop/notices.ts`.
 */
export function useDesktopRuntime(): void {
  const notifications = useNotifications();
  const unread = useChannelUnreadCounts();
  const channels = useChannels();
  const markRead = useMarkNotificationRead();
  const router = useRouter();
  const searchParams = useSearchParams();

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
      unreadNonChatCount(asArray<NoticeRow>(notifications.data)) + chat,
    );
  }, [notifications.data, unread.data, channels.data]);

  // Signing out or closing the dashboard clears it: the count is this
  // member's, and nothing is left running to keep it true.
  useEffect(() => {
    return () => desktopBridge()?.setBadgeCount?.(0);
  }, []);

  // Rows already handled. `null` until the first read of the list, which is
  // taken as seen: opening the app raises nothing for what was waiting.
  // Another chapter's list is a first read again.
  const chapterId = useActiveChapterId();
  const announced = useRef<Set<string> | null>(null);
  const since = useRef(0);
  useEffect(() => {
    announced.current = null;
  }, [chapterId]);
  // Read at raise time, not subscribed to: a channel change isn't a reason to
  // look at the list again.
  const viewing = useRef<string | null>(null);
  useEffect(() => {
    viewing.current = searchParams.get(CHAT_CHANNEL_PARAM);
  }, [searchParams]);
  const open = useRef<(row: NoticeRow) => void>(() => {});
  useEffect(() => {
    open.current = (row) => {
      desktopBridge()?.showWindow?.();
      markRead.mutate(row.id);
      router.push(deepLinkFor(row as Parameters<typeof deepLinkFor>[0]));
    };
  }, [markRead, router]);

  useEffect(() => {
    if (!desktopBridge() || notifications.data === undefined) return;
    if (typeof Notification === "undefined") return;
    const rows = asArray<NoticeRow>(notifications.data);
    if (announced.current === null) {
      announced.current = new Set(rows.map((row) => row.id));
      since.current = Date.now();
      return;
    }
    const notices = planDesktopNotices(rows, {
      announced: announced.current,
      since: since.current,
      viewingChannelId: document.hasFocus() ? viewing.current : null,
    });
    for (const row of rows) announced.current.add(row.id);
    for (const notice of notices) {
      const row = rows.find((candidate) => candidate.id === notice.id);
      if (!row) continue;
      try {
        const shown = new Notification(notice.title, {
          body: notice.body,
          tag: notice.tag,
        });
        shown.onclick = () => open.current(row);
      } catch {
        // The system refused it (notifications off for Frapp): the list and
        // the icon's count still have it.
      }
    }
  }, [notifications.data]);
}
