import { notificationSourceKey, notificationTitle } from "@repo/hooks/notification-rows";

/**
 * Which in-app notification rows the desktop app raises as system
 * notifications (#4842, ADR-29 decision 6).
 *
 * There is no server push to a desktop. The app is the web app with its
 * realtime connection open, so it raises a notification for each new unread
 * row in the member's own list, the row a phone push is sent beside. That is
 * what makes the member's settings hold with nothing decided here: a category
 * switched off, a muted channel, or a channel the member has on screen writes
 * no row (`spec/behavior/notifications.md` § Delivery Flow), and a row written
 * during quiet hours or Do Not Disturb says so (`data.quieted`).
 *
 * Nothing here asks which channel is on screen. The server's presence check
 * is the one rule for that, on every device, and the page leaves presence
 * while it is hidden (`ChatRealtimeManager.setViewerAway`), so a window in
 * the tray is not "reading".
 */
export type NoticeRow = {
  id: string;
  title: string;
  body: string;
  chapter_id?: string | null;
  read_at?: string | null;
  created_at: string;
  data?: {
    target?: { screen?: string; channelId?: string };
    /** The priority the push went out at; `SILENT` makes no sound. */
    priority?: string;
    /** Quiet hours or Do Not Disturb lowered it to `SILENT`. */
    quieted?: boolean;
  } | null;
};

export type DesktopNotice = {
  /** The row a click opens: the conversation's newest. */
  id: string;
  /**
   * Every unread row the notification stands for, which a click reads: the
   * conversation's, as opening its entry in the list does (#3948).
   */
  unreadIds: string[];
  /**
   * One per conversation: a later message in the same channel replaces the
   * earlier notification, as the phone's tray keeps one entry per channel.
   */
  tag: string;
  title: string;
  body: string;
  /** Shown without a sound: the sender marked it low priority. */
  silent: boolean;
};

/** A reconnect after a long sleep must not fill the screen. */
const MAX_AT_ONCE = 3;

function tagOf(row: NoticeRow): string {
  return notificationSourceKey(row.data) ?? row.id;
}

/**
 * The newest row's time in the list the app opened with, which
 * `planDesktopNotices` takes as `since`. The server's own clock, so a
 * computer whose clock is wrong can't hide or invent news. 0 for an empty
 * list: everything after it is new.
 */
export function newestRowTime(rows: readonly NoticeRow[]): number {
  let newest = 0;
  for (const row of rows) {
    const at = Date.parse(row.created_at);
    if (Number.isFinite(at) && at > newest) newest = at;
  }
  return newest;
}

/**
 * The notifications to raise for this read of the list, oldest first.
 *
 * - `announced` holds every row id already handled. The caller seeds it with
 *   the first read, so opening the app raises nothing for what was waiting.
 * - `since` is `newestRowTime` of that first read: a row older than it which
 *   only now scrolled into the page (another was cleared) is not news.
 */
export function planDesktopNotices(
  rows: readonly NoticeRow[],
  context: { announced: ReadonlySet<string>; since: number },
): DesktopNotice[] {
  const byTag = new Map<string, { row: NoticeRow; at: number }>();
  for (const row of rows) {
    if (context.announced.has(row.id) || row.read_at) continue;
    const at = Date.parse(row.created_at);
    if (!Number.isFinite(at) || at < context.since) continue;
    if (row.data?.quieted === true) continue;
    const tag = tagOf(row);
    const held = byTag.get(tag);
    if (held && held.at >= at) continue;
    byTag.set(tag, { row, at });
  }
  return [...byTag.entries()]
    .sort(([, a], [, b]) => a.at - b.at)
    .slice(-MAX_AT_ONCE)
    .map(([tag, { row }]) => ({
      id: row.id,
      unreadIds: rows
        .filter((other) => !other.read_at && tagOf(other) === tag)
        .map((other) => other.id),
      tag,
      title: notificationTitle(row.title),
      // The same cleaning the title gets: without the "OBJ" box (#4346).
      body: notificationTitle(row.body),
      silent: row.data?.priority === "SILENT",
    }));
}
