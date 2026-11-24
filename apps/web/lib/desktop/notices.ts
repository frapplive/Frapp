import { notificationSourceKey, notificationTitle } from "@repo/hooks/notification-rows";

/**
 * Which in-app notification rows the desktop app raises as system
 * notifications (#4842, ADR-29 decision 6).
 *
 * There is no server push to a desktop. The app is the web app with its
 * realtime connection open, so it raises a notification for each new unread
 * row in the member's own list, the row a phone push is sent beside. That is
 * what makes the member's settings hold with nothing decided here: a category
 * switched off, a muted channel, or a channel the member is reading writes no
 * row (`spec/behavior/notifications.md` § Delivery Flow), and a row written
 * during quiet hours or Do Not Disturb says so (`data.priority: "SILENT"`).
 */
export type NoticeRow = {
  id: string;
  title: string;
  body: string;
  read_at?: string | null;
  created_at: string;
  data?: {
    target?: { screen?: string; channelId?: string };
    priority?: string;
  } | null;
};

export type DesktopNotice = {
  /** The row to mark read and open when the notification is clicked. */
  id: string;
  /**
   * One per conversation: a later message in the same channel replaces the
   * earlier notification, as the phone's tray keeps one entry per channel.
   */
  tag: string;
  title: string;
  body: string;
};

/** A reconnect after a long sleep must not fill the screen. */
const MAX_AT_ONCE = 3;

/**
 * The notifications to raise for this read of the list, oldest first.
 *
 * - `announced` holds every row id already handled. The caller seeds it with
 *   the first read, so opening the app raises nothing for what was waiting.
 * - `since` is when the app started: a row older than that which only now
 *   scrolled into the page (another was cleared) is not news.
 * - `viewingChannelId` is the chat channel on screen with the window focused.
 *   The server already skips a member present in a channel; this covers the
 *   moment between a message landing and presence being read.
 */
export function planDesktopNotices(
  rows: readonly NoticeRow[],
  context: {
    announced: ReadonlySet<string>;
    since: number;
    viewingChannelId: string | null;
  },
): DesktopNotice[] {
  const byTag = new Map<string, { notice: DesktopNotice; at: number }>();
  for (const row of rows) {
    if (context.announced.has(row.id) || row.read_at) continue;
    const at = Date.parse(row.created_at);
    if (!Number.isFinite(at) || at < context.since) continue;
    if (row.data?.priority === "SILENT") continue;
    const target = row.data?.target;
    if (
      target?.screen === "chat" &&
      target.channelId &&
      target.channelId === context.viewingChannelId
    ) {
      continue;
    }
    const tag = notificationSourceKey(row.data) ?? row.id;
    const held = byTag.get(tag);
    if (held && held.at >= at) continue;
    byTag.set(tag, {
      at,
      notice: {
        id: row.id,
        tag,
        title: notificationTitle(row.title),
        // The same cleaning the title gets: without the "OBJ" box (#4346).
        body: notificationTitle(row.body),
      },
    });
  }
  return [...byTag.values()]
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_AT_ONCE)
    .map(({ notice }) => notice);
}

/**
 * The number on the dock or taskbar icon: what addresses the member, the same
 * sum the phone's app icon shows (`spec/behavior/notifications.md` § Badge
 * Count). Chat rows are left out of the notification half because the channel
 * counts already hold those messages.
 */
export function unreadNonChatCount(rows: readonly NoticeRow[]): number {
  return rows.filter((row) => !row.read_at && row.data?.target?.screen !== "chat").length;
}
