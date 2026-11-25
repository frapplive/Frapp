"use client";

import {
  MARK_AS_READ_LABEL,
  NEW_MESSAGES_DIVIDER_LABEL,
  newMessagesCountLabel,
  newMessagesPillLabel,
  type PillDirection,
} from "@repo/hooks";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/focus";
import { JumpToLatestGlyph, SendArrowGlyph } from "./chat-glyphs";

/**
 * The way to a channel's first unread message while its divider is off screen
 * (#6052), as Discord's and Slack's threads draw it: "12 new messages" with an
 * arrow toward the divider, and Mark as read beside it. Centred over the top of
 * the list, so it reserves no height and nothing under it moves; the jump to
 * the newest message keeps the bottom-right corner (`JumpToLatestButton`), so
 * the two never sit on each other.
 *
 * The floating control's neutral recipe, as the jump control's: elevated
 * `--popover`, the outlined edge, `--foreground` text. Unread is neutral
 * (foundations § Where the accent goes), so no accent and no red.
 *
 * The caller renders it only while `pillDirection` gives a direction.
 */
export function NewMessagesPill({
  count,
  direction,
  onJump,
  onMarkRead,
}: {
  count: number;
  direction: PillDirection;
  onJump: () => void;
  onMarkRead: () => void;
}) {
  return (
    <div
      data-testid="new-messages-pill"
      className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center rounded-full border border-border bg-popover text-caption font-semibold text-foreground"
    >
      <button
        type="button"
        aria-label={newMessagesPillLabel(count, direction)}
        onClick={onJump}
        className={cn(
          "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-l-full pl-3 pr-2.5 hover:bg-card-hover pointer-coarse:h-11",
          FOCUS_RING,
        )}
      >
        <span>{newMessagesCountLabel(count)}</span>
        {/* The send arrow points up, and turned over it is Jump to latest's. */}
        {direction === "up" ? (
          <SendArrowGlyph className="h-3.5 w-3.5" />
        ) : (
          <JumpToLatestGlyph className="h-3.5 w-3.5" />
        )}
      </button>
      <span aria-hidden="true" className="h-4 w-px bg-border" />
      <button
        type="button"
        onClick={onMarkRead}
        className={cn(
          "h-8 whitespace-nowrap rounded-r-full pl-2.5 pr-3 text-muted-foreground hover:bg-card-hover hover:text-foreground pointer-coarse:h-11",
          FOCUS_RING,
        )}
      >
        {MARK_AS_READ_LABEL}
      </button>
    </div>
  );
}

/**
 * A thread divider's row: the day divider's (`message-timeline.tsx`) and the
 * New messages line's, so the two sit at the same height (`components.md`
 * § 11, Day divider).
 */
export const THREAD_DIVIDER_ROW =
  "flex items-center gap-3 px-5 pb-1 pt-4 text-caption font-semibold";

/**
 * The line above a channel's first unread message (#6052): a rule in
 * `--foreground` with "New messages" at its end, where Discord and Slack put
 * their "New" tag. Neutral, as unread is everywhere else (the channel row's
 * pip is `--foreground` too), and brighter than the day divider's `--border`
 * hairline so the two never read as one. When the first unread message also
 * starts a day, the one line carries the date in the middle, as Discord's does,
 * rather than stacking two rules.
 */
export function NewMessagesDivider({ dayLabel }: { dayLabel?: string }) {
  return (
    <div
      data-slot="new-messages-divider"
      role="separator"
      aria-label={
        dayLabel
          ? `${NEW_MESSAGES_DIVIDER_LABEL}, ${dayLabel}`
          : NEW_MESSAGES_DIVIDER_LABEL
      }
      className={THREAD_DIVIDER_ROW}
    >
      <span aria-hidden="true" className="h-px flex-1 bg-foreground" />
      {dayLabel ? (
        <>
          <span aria-hidden="true" className="text-muted-foreground">
            {dayLabel}
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-foreground" />
        </>
      ) : null}
      <span aria-hidden="true" className="text-foreground">
        {NEW_MESSAGES_DIVIDER_LABEL}
      </span>
    </div>
  );
}
