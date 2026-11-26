import { isDirectChannel } from "@repo/validation";
import { countsLookUnread, type SidebarUnreadCounts } from "./channel-sidebar";

/**
 * Jump to a channel (#6053, Paul's pick of 2026-11-25, from Winston's "scrolling
 * through every channel to find stuff is a pain"): web's Find and the phone's
 * Search open on the channels a member most likely wants, the unread ones
 * then the ones they opened lately, and match a channel from the first letter,
 * the way Slack's Cmd+K, Discord's quick switcher and Linear's Cmd+K do. Both
 * surfaces read this module, so what is listed, in what order and in what
 * words is one rule. `spec/behavior/search.md` § Jump to a channel owns it.
 *
 * Channels only: a direct message's stored name is not what its row shows,
 * and people are found by name in Find's Members group.
 */

/** The fields a channel row carries that this module reads. */
export interface JumpChannel {
  id: string;
  name: string;
  type: string;
  hidden?: boolean;
  category_id?: string | null;
}

/**
 * How many channels each group lists before anything is typed: every unread
 * channel a busy week leaves (a member checking what's new wants them all),
 * and the last few opened.
 */
export const JUMP_UNREAD_LIMIT = 10;
export const JUMP_RECENT_LIMIT = 5;

/** How many channels a device remembers as recently opened. */
export const RECENT_CHANNELS_CAP = 8;

/** The groups Find and Search list before anything is typed. */
export const JUMP_UNREAD_LABEL = "Unread";
export const JUMP_RECENT_LABEL = "Recently opened";

/** Under the channel matches while fewer letters are typed than a search needs. */
export const JUMP_MORE_FROM_LETTERS = (letters: number) =>
  `Messages, events and more from ${letters} letters.`;

/** Before anything is typed, when nothing is unread or recently opened. */
export const JUMP_NOTHING_YET =
  "Nothing unread. Type a channel's name to jump to it.";

/**
 * Which list Find and Search draw for what was typed (#6053): the jump lists
 * for nothing (a lone `#` counts as nothing, since it starts a channel's
 * name), the channel matches below a search's minimum, and the search from
 * there (`null`). `letters` is what the matches rank by, without the `#`.
 */
export function jumpModeOf(
  typed: string,
  minLetters: number,
): { mode: "lists" | "letters" | null; letters: string } {
  const letters = typed.trim().replace(/^#/, "").trim();
  if (letters === "") return { mode: "lists", letters };
  return { mode: letters.length < minLetters ? "letters" : null, letters };
}

/** The channels a member can jump to: listed, not hidden, not a DM. */
export function jumpableChannels<C extends JumpChannel>(
  channels: readonly C[] | undefined,
): C[] {
  return (channels ?? []).filter(
    (channel) => !channel.hidden && !isDirectChannel(channel),
  );
}

/**
 * Channels whose name matches what was typed, best first: the name starts
 * with it (`ru` → `#rush-events`), then a word in the name does
 * (`ev` → `#rush-events`), then it appears anywhere. Ties go to the shorter
 * name, then A to Z, so the exact channel leads its longer namesakes.
 * Case is ignored, and so is a leading `#`.
 */
export function rankChannelMatches<C extends JumpChannel>(
  channels: readonly C[],
  query: string,
  limit = Number.POSITIVE_INFINITY,
): C[] {
  const needle = query.trim().replace(/^#/, "").toLowerCase();
  if (!needle) return [];
  const scored: { channel: C; rank: number }[] = [];
  for (const channel of channels) {
    const name = channel.name.toLowerCase();
    let rank: number;
    if (name.startsWith(needle)) rank = 0;
    else if (name.split(/[-_\s.]+/).some((word) => word.startsWith(needle)))
      rank = 1;
    else if (name.includes(needle)) rank = 2;
    else continue;
    scored.push({ channel, rank });
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.channel.name.length - b.channel.name.length ||
      a.channel.name.localeCompare(b.channel.name),
  );
  return scored.slice(0, limit).map(({ channel }) => channel);
}

/**
 * The channels whose row reads unread (`countsLookUnread`): a muted channel's
 * plain unread is left out, its mention isn't. None while the counts are
 * unknown, so nothing is called unread on missing data.
 */
export function channelsThatLookUnread(
  channels: readonly JumpChannel[],
  unreadByChannelId: ReadonlyMap<string, SidebarUnreadCounts> | undefined,
  mutedChannelIds: ReadonlySet<string> | undefined,
): Set<string> {
  const ids = new Set<string>();
  if (!unreadByChannelId) return ids;
  for (const channel of channels) {
    const counts = unreadByChannelId.get(channel.id);
    if (
      counts &&
      countsLookUnread(false, counts, mutedChannelIds?.has(channel.id) ?? false)
    ) {
      ids.add(channel.id);
    }
  }
  return ids;
}

export interface ChannelJumpListsInput<C extends JumpChannel> {
  /** The jumpable channels (`jumpableChannels`), in the chapter's order. */
  channels: readonly C[];
  /** The server's counts; `undefined` (unknown) lists nothing as unread. */
  unreadByChannelId: ReadonlyMap<string, SidebarUnreadCounts> | undefined;
  /** Muted channels; a muted channel's plain unread doesn't count. */
  mutedChannelIds: ReadonlySet<string> | undefined;
  /** This device's recently opened channels, newest first. */
  recentIds: readonly string[];
  unreadLimit?: number;
  recentLimit?: number;
  /** `channelsThatLookUnread`'s answer, when the caller already has it. */
  unreadIds?: ReadonlySet<string>;
}

/**
 * What Find and Search list before anything is typed. Unread: every channel
 * whose row reads unread (`countsLookUnread`, so a muted channel's plain
 * unread is left out and its mention isn't), mentions first, then in the
 * chapter's order. Recently opened: the channels this device opened last,
 * newest first, less any already listed as unread, so no channel shows twice.
 */
export function channelJumpLists<C extends JumpChannel>({
  channels,
  unreadByChannelId,
  mutedChannelIds,
  recentIds,
  unreadLimit = JUMP_UNREAD_LIMIT,
  recentLimit = JUMP_RECENT_LIMIT,
  unreadIds,
}: ChannelJumpListsInput<C>): { unread: C[]; recent: C[] } {
  const reads =
    unreadIds ??
    channelsThatLookUnread(channels, unreadByChannelId, mutedChannelIds);
  const mentioned: C[] = [];
  const plain: C[] = [];
  for (const channel of channels) {
    if (!reads.has(channel.id)) continue;
    const mentions = unreadByChannelId?.get(channel.id)?.mentionCount ?? 0;
    (mentions > 0 ? mentioned : plain).push(channel);
  }
  const unread = [...mentioned, ...plain].slice(0, unreadLimit);
  const listed = new Set(unread.map((channel) => channel.id));
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const recent: C[] = [];
  for (const id of recentIds) {
    const channel = byId.get(id);
    if (!channel || listed.has(id)) continue;
    recent.push(channel);
    listed.add(id);
    if (recent.length >= recentLimit) break;
  }
  return { unread, recent };
}

// ── Recently opened, remembered on the device ──────────────────────────────
//
// Kept on the device beside the last channel (`lastChannelStorageKey`), per
// member and chapter, for the reason the last channel is: it is where this
// device was (owner, 2026-11-05). localStorage on web, AsyncStorage on the
// phone; both store the ids as a JSON array.

/** Where a device keeps the member's recently opened channels. */
export function recentChannelsStorageKey(
  userId: string,
  chapterId: string,
): string {
  return `frapp.chat.recent-channels.${userId}.${chapterId}`;
}

/** The stored list, or none when it is missing or unreadable. */
export function parseRecentChannels(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .filter((id): id is string => typeof id === "string")
          .slice(0, RECENT_CHANNELS_CAP)
      : [];
  } catch {
    return [];
  }
}

/** The list with `channelId` opened just now: first, once, capped. */
export function withRecentChannel(
  recentIds: readonly string[],
  channelId: string,
): string[] {
  return [channelId, ...recentIds.filter((id) => id !== channelId)].slice(
    0,
    RECENT_CHANNELS_CAP,
  );
}
