import { isDirectChannel } from "@repo/validation";
import {
  countsLookUnread,
  isAddressed,
  type ArrangedSidebar,
  type SidebarChannelLike,
  type SidebarUnreadCounts,
} from "./channel-sidebar";

/**
 * The channel list's "New unreads" pills (#6045, Winston 2026-11-25): when an
 * unread channel sits above or below the part of the list on screen, a pill
 * at that edge says so, and pressing it scrolls the list to the nearest one,
 * as Discord's "NEW UNREADS" bar and Slack's "Unread messages" pill do. Web's
 * rail and the phone's Chat home both read this module, so what counts, which
 * one is next and what the pill says are one rule.
 *
 * It counts nothing of its own. A row counts when it reads unread on screen
 * (`countsLookUnread`, so a muted channel's plain unread doesn't), or when a
 * thread listed under it has new replies (its thread row reads unread). A
 * folded section keeps every such row in view under its heading (#6053), so
 * a heading is never a target of its own. A hidden conversation is never in
 * the arrangement, and the open channel is the one being read.
 */

/** One place the pill can take the member to, in the list's order. */
export interface UnreadJumpTarget {
  /** `unreadJumpRowKey`: the row the client draws it as. */
  key: string;
  /** It addresses the member (an @-mention, a reply to them, or a DM): the mention red. */
  addressed: boolean;
}

/** A channel row's key. */
export function unreadJumpRowKey(channelId: string): string {
  return `row:${channelId}`;
}

const NO_UNREAD: SidebarUnreadCounts = { unreadCount: 0, mentionCount: 0 };

export interface UnreadJumpTargetsInput {
  /** The server's counts, as the rows read them. `undefined` (unknown) gives no targets. */
  unreadByChannelId: ReadonlyMap<string, SidebarUnreadCounts> | undefined;
  /** The arrangement's muted set; `undefined` while the levels are unknown quiets nothing. */
  mutedChannelIds: ReadonlySet<string> | undefined;
  /** Channels with a listed thread that has new replies (`channelsWithUnreadThreads`). */
  unreadThreadChannelIds?: ReadonlySet<string>;
  /** The channel open now, which is never a target. */
  activeChannelId: string | null;
}

/**
 * Every place in the arranged list that reads unread, top to bottom. While
 * the counts are unknown there are none, so the pill never claims news it
 * can't see (and never says "nothing" either: it just isn't drawn).
 */
export function unreadJumpTargets<C extends SidebarChannelLike>(
  arranged: ArrangedSidebar<C>,
  input: UnreadJumpTargetsInput,
): UnreadJumpTarget[] {
  const { unreadByChannelId, mutedChannelIds, activeChannelId } = input;
  if (!unreadByChannelId) return [];
  const threadIds = input.unreadThreadChannelIds;
  const targets: UnreadJumpTarget[] = [];
  for (const section of arranged.sections) {
    for (const channel of section.rows) {
      if (channel.id === activeChannelId) continue;
      const counts = unreadByChannelId.get(channel.id) ?? NO_UNREAD;
      const muted = mutedChannelIds?.has(channel.id) ?? false;
      const looksUnread = countsLookUnread(
        isDirectChannel(channel),
        counts,
        muted,
      );
      if (looksUnread) {
        targets.push({
          key: unreadJumpRowKey(channel.id),
          addressed: isAddressed(channel, counts),
        });
      } else if (threadIds?.has(channel.id)) {
        targets.push({ key: unreadJumpRowKey(channel.id), addressed: false });
      }
    }
  }
  return targets;
}

export type UnreadJumpEdge = "above" | "in" | "below";

/**
 * Where a drawn target sits against the part of the list on screen, by its
 * middle: a row half hidden under the pinned heading or the floating bar is
 * out of view, one mostly on screen is in it.
 */
export function unreadJumpEdgeOf(
  span: { top: number; bottom: number },
  view: { top: number; bottom: number },
): UnreadJumpEdge {
  const middle = (span.top + span.bottom) / 2;
  if (middle < view.top) return "above";
  if (middle > view.bottom) return "below";
  return "in";
}

/** One edge's pill: where it goes next, and whether it is red. */
export interface UnreadJumpSide {
  /** The nearest target out of view on this side. */
  next: UnreadJumpTarget;
  /** Any target out of view on this side addresses the member. */
  addressed: boolean;
}

export interface UnreadJumpState {
  above: UnreadJumpSide | null;
  below: UnreadJumpSide | null;
}

export const NO_UNREAD_JUMP: UnreadJumpState = { above: null, below: null };

/**
 * The two pills, from where each target is now. `edgeOf` answers `null` for a
 * target the client hasn't drawn or measured yet, which counts for neither
 * side. Pressing a pill goes to its `next`; once that one is in view the pill
 * moves on to the one after it, so pressing again walks the list.
 */
export function unreadJumpState(
  targets: readonly UnreadJumpTarget[],
  edgeOf: (target: UnreadJumpTarget) => UnreadJumpEdge | null,
): UnreadJumpState {
  let aboveNext: UnreadJumpTarget | null = null;
  let aboveAddressed = false;
  let belowNext: UnreadJumpTarget | null = null;
  let belowAddressed = false;
  for (const target of targets) {
    const edge = edgeOf(target);
    if (edge === "above") {
      // Top to bottom, so the last one above is the nearest.
      aboveNext = target;
      aboveAddressed ||= target.addressed;
    } else if (edge === "below") {
      belowNext ??= target;
      belowAddressed ||= target.addressed;
    }
  }
  const above: UnreadJumpSide | null = aboveNext
    ? { next: aboveNext, addressed: aboveAddressed }
    : null;
  const below: UnreadJumpSide | null = belowNext
    ? { next: belowNext, addressed: belowAddressed }
    : null;
  return { above, below };
}

/** Two states draw the same pills (what a re-render compares). */
export function sameUnreadJumpState(
  a: UnreadJumpState,
  b: UnreadJumpState,
): boolean {
  const side = (x: UnreadJumpSide | null, y: UnreadJumpSide | null) =>
    x === y ||
    (x !== null &&
      y !== null &&
      x.next.key === y.next.key &&
      x.addressed === y.addressed);
  return side(a.above, b.above) && side(a.below, b.below);
}

// ── Copy ─────────────────────────────────────────────────────────────────────
// One wording for both clients (`spec/ui/design-system/writing.md`).

/** What the pill reads, beside its arrow. */
export const NEW_UNREADS_LABEL = "New unreads";

/** Its accessible name. */
export function unreadJumpLabel(direction: "above" | "below"): string {
  return `Jump to unread channels ${direction}`;
}

/** How long the row the pill landed on stays lit, in ms. */
export const UNREAD_JUMP_HIGHLIGHT_MS = 1200;
