import type { SidebarUnreadCounts } from "./channel-sidebar";

/**
 * A channel row's count and what a screen reader hears for it, one rule for
 * web's channel list, the phone's Chat home and Find's and Search's Jump to a
 * channel rows (#6053; until then each list kept its own copy, #1194).
 */

/**
 * Badge text. A mention badge leads with `@` and shows the **mention** count,
 * not the total: `@ 2` on a row whose unread total is higher. Counts stop at
 * 99+. A merely unread channel draws no badge at all (foundations.md §5);
 * this is the text for the ones that do.
 */
export function badgeLabel(unreadCount: number, mentionCount: number): string {
  const count = mentionCount > 0 ? mentionCount : unreadCount;
  const capped = count > 99 ? "99+" : String(count);
  return mentionCount > 0 ? `@ ${capped}` : capped;
}

/**
 * What a screen reader hears instead of `@ 2`.
 *
 * Names **both** numbers when there is a mention, because the badge only shows
 * one: a row reading "@ 2" over twelve unread messages tells a sighted reader
 * "two of these are for you", and an announcement of "2 mentions" alone loses
 * the twelve. Pluralised.
 */
export function unreadAnnouncement(
  { unreadCount, mentionCount }: SidebarUnreadCounts,
  isDirect = false,
): string {
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;
  if (mentionCount > 0) {
    return `${plural(mentionCount, "mention")}, ${unreadCount} unread`;
  }
  // A DM badge is red for the same reason a mention badge is, so it says the
  // same thing: this one is addressed to you.
  if (isDirect) return `${plural(unreadCount, "unread direct message")}`;
  return plural(unreadCount, "unread message");
}
