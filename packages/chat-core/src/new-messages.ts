/**
 * Where a channel's unread messages start, and the way back to them (#6052):
 * a "New messages" divider above the first one, and a pill pointing to it
 * while it is off screen, as Discord's and Slack's threads draw them. Shared
 * by the phone (`apps/mobile/lib/chat/use-new-messages.ts`) and the web
 * (`apps/web/lib/chat/use-new-messages.ts`); each owns its own scroll
 * geometry, as with `./jump-to-latest`, and the rules live here.
 *
 * ## Taken once, when the channel opens
 *
 * Opening a channel stamps its read cursor to the server's clock
 * (`spec/behavior/chat/README.md` § Read Receipts), and so does every message
 * that lands while the member looks at it. A divider read from the live
 * cursor would therefore vanish the moment the channel opened, and move down
 * under the member as they read. So the thread takes the cursor and the count
 * once, from what the unread counts said as the channel opened
 * (`GET /v1/channels/unread`, which the app already holds for the channel
 * list), and keeps them for the visit: a later stamp moves neither the
 * divider nor the pill's count.
 *
 * The count is the server's (`unread_count`), never re-counted here: it
 * excludes the cases a client can't see (§ Read Receipts). The cursor only
 * places the divider.
 */

/** What the counts said for one channel as it opened. */
export interface UnreadArrival {
  /** `unread_count`: the server's, never re-derived. */
  unread: number;
  /** `last_read_at`: the member's read cursor, `null` if never opened. */
  lastReadAt: string | null;
}

/**
 * One channel's row of a `GET /v1/channels/unread` answer, read defensively:
 * the cache entry is typed `unknown` where it is read, and an older API sends
 * no `last_read_at`. `null` while there is no answer, or no row for the
 * channel.
 */
export function readArrival(
  counts: unknown,
  channelId: string | null,
): UnreadArrival | null {
  if (!channelId || !Array.isArray(counts)) return null;
  for (const row of counts as unknown[]) {
    if (!row || typeof row !== "object") continue;
    const entry = row as {
      channel_id?: unknown;
      unread_count?: unknown;
      last_read_at?: unknown;
    };
    if (entry.channel_id !== channelId) continue;
    const unread = entry.unread_count;
    if (typeof unread !== "number" || unread < 0) return null;
    const lastReadAt =
      typeof entry.last_read_at === "string" ? entry.last_read_at : null;
    return { unread, lastReadAt };
  }
  return null;
}

/** What an open keeps for its visit: where reading stopped, and how much is new. */
export interface NewMessagesMark {
  lastReadAt: string;
  count: number;
}

/**
 * The mark an open takes, or `null` for none. Nothing new, no mark. A channel
 * never opened has no cursor, and the server counts its whole history: a
 * divider above its first message would send a new member to the start of a
 * channel's history, so it opens at the newest message with no divider, as
 * Slack's does for a channel just joined.
 */
export function newMessagesMark(
  arrival: UnreadArrival | null,
): NewMessagesMark | null {
  if (!arrival || arrival.unread <= 0 || arrival.lastReadAt === null) {
    return null;
  }
  if (Number.isNaN(Date.parse(arrival.lastReadAt))) return null;
  return { lastReadAt: arrival.lastReadAt, count: arrival.unread };
}

/** One row of the thread, oldest first. */
export interface NewMessagesRow {
  /** Its stable key: `client_message_id`, unchanged through confirmation. */
  id: string;
  createdAt: string;
  /** The viewer's own message, sent or still sending. Never new to them. */
  own: boolean;
  /**
   * Drawn with nothing to read: a blocked member's tombstone or a deleted
   * message. Never new either; neither is counted (§ Read Receipts).
   */
  silent: boolean;
}

/**
 * Where the divider goes:
 *
 * - `{ at: "row", id }`: above that row, the first message after the cursor
 *   that is someone else's and has something to read.
 * - `{ at: "older" }`: above everything loaded. The loaded rows don't reach
 *   back to the cursor and none of them is new to the member yet, or all of
 *   them are, so the first new one is in history still to load.
 * - `null`: no divider. No mark, or nothing new among rows that reach back to
 *   the cursor (the count was ahead of what is left: a message deleted since).
 */
export type DividerPlace = { at: "row"; id: string } | { at: "older" } | null;

export function placeNewMessagesDivider(
  rows: readonly NewMessagesRow[],
  mark: NewMessagesMark | null,
  hasOlder: boolean,
): DividerPlace {
  if (!mark || rows.length === 0) return null;
  const cursor = Date.parse(mark.lastReadAt);
  // Without older history the loaded rows are the channel's whole history,
  // so they reach the cursor whether or not one of them is older than it.
  let reachesCursor = !hasOlder;
  for (const row of rows) {
    const at = Date.parse(row.createdAt);
    if (!(at > cursor)) {
      reachesCursor = true;
      continue;
    }
    if (row.own || row.silent) continue;
    return reachesCursor ? { at: "row", id: row.id } : { at: "older" };
  }
  return reachesCursor ? null : { at: "older" };
}

/**
 * Where the divider is against the viewport: above what is on screen (the
 * member has read down past it, or it is in history not loaded yet), on
 * screen, or below (the member scrolled back above it).
 */
export type DividerSide = "above" | "shown" | "below";

/** Which way the pill's arrow points, or `null` while there is no pill. */
export type PillDirection = "up" | "down";

/**
 * What the pill remembers about this visit. `seen`: the divider has been on
 * screen. `readThrough`: after that, the member reached the newest message,
 * so there is nothing left to point at. `dismissed`: they pressed Mark as
 * read, which also takes the divider away, as Discord's does.
 */
export interface PillProgress {
  seen: boolean;
  readThrough: boolean;
  dismissed: boolean;
}

export const PILL_START: PillProgress = Object.freeze({
  seen: false,
  readThrough: false,
  dismissed: false,
});

/**
 * The visit's progress after the thread reports where the divider is and
 * whether the member is at the newest message. The same object when nothing
 * changed, so it can be stored without a render loop.
 */
export function advancePill(
  progress: PillProgress,
  side: DividerSide | null,
  atNewest: boolean,
): PillProgress {
  const seen = progress.seen || side === "shown";
  const readThrough = progress.readThrough || (seen && atNewest);
  if (seen === progress.seen && readThrough === progress.readThrough) {
    return progress;
  }
  return { ...progress, seen, readThrough };
}

/**
 * The pill's arrow, or `null` for no pill. Shown while the divider is off
 * screen, until the member has read through to the newest message after
 * seeing it, or pressed Mark as read. A divider in unloaded history is above.
 */
export function pillDirection(
  place: DividerPlace,
  side: DividerSide | null,
  progress: PillProgress,
): PillDirection | null {
  if (!place || progress.dismissed || progress.readThrough) return null;
  if (place.at === "older") return "up";
  if (side === "above") return "up";
  if (side === "below") return "down";
  return null;
}

/**
 * Where the divider sits against the rows on screen, by index into the rows
 * the list draws. `first` and `last` are the lowest and highest index on
 * screen; `newestLast` says which end the newest row is at (the web's list,
 * oldest first) or isn't (the phone's inverted list, newest first). `null`
 * when nothing is on screen yet, or the row is not in the list.
 */
export function dividerSide(
  dividerIndex: number,
  visible: { first: number; last: number } | null,
  newestLast: boolean,
): DividerSide | null {
  if (!visible || dividerIndex < 0) return null;
  if (dividerIndex >= visible.first && dividerIndex <= visible.last) {
    return "shown";
  }
  const beforeFirst = dividerIndex < visible.first;
  // Oldest first, a lower index is older and so above the screen; newest
  // first, it is newer and below.
  return beforeFirst === newestLast ? "above" : "below";
}

/**
 * How many older pages the thread reads looking for the first new message,
 * when the member asks for it from the pill. A hundred rows a page
 * (`OLDER_PAGE_LIMIT`), so about a thousand messages back; past that it goes
 * as far as it got.
 */
export const NEW_MESSAGES_SEEK_MAX_PAGES = 10;

/** The divider's words. */
export const NEW_MESSAGES_DIVIDER_LABEL = "New messages";

/** "1 new message", "12 new messages", "99+ new messages". */
export function newMessagesCountLabel(count: number): string {
  if (count === 1) return "1 new message";
  return `${count > 99 ? "99+" : count} new messages`;
}

/** The pill's accessible name: what it says, and where it goes. */
export function newMessagesPillLabel(
  count: number,
  direction: PillDirection,
): string {
  const where = direction === "up" ? "above" : "below";
  return `${newMessagesCountLabel(count)} ${where}. Jump to the first one`;
}
