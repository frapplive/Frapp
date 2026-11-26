"use client";

import {
  NEW_UNREADS_LABEL,
  unreadJumpLabel,
  type UnreadJumpSide,
} from "@repo/hooks";
import { FOCUS_RING } from "@/components/ui/focus";
import { cn } from "@/lib/utils";
import { JumpToLatestGlyph, SendArrowGlyph } from "./chat-glyphs";

/**
 * The channel list's "New unreads" pill (#6045, Winston 2026-11-25), over the
 * list's top or bottom edge while an unread channel is scrolled out of view
 * that way, as Discord's "NEW UNREADS" bar and Slack's "Unread messages" pill
 * float over theirs. Pressing it scrolls to the nearest one; it doesn't open
 * it. The web face of mobile's `components/chat/unread-jump-pill.tsx`.
 *
 * Its height is the Chip step (24) to a mouse. The neutral recipe a floating
 * control takes (elevated `--popover` with the outlined edge, as Jump to
 * latest), and the mention red when anything out of view that way addresses
 * the member, the one thing that red means (foundations.md §5).
 *
 * It draws in a zero-height band pinned to that edge of the list's scroller,
 * so it reserves no height and no row under it moves.
 */
export function UnreadJumpPill({
  direction,
  side,
  onJump,
}: {
  direction: "above" | "below";
  side: UnreadJumpSide;
  onJump: () => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none sticky z-20 flex h-0 justify-center",
        direction === "above" ? "top-0" : "bottom-0",
      )}
    >
      <button
        type="button"
        data-unread-jump={direction}
        data-addressed={side.addressed ? "" : undefined}
        aria-label={unreadJumpLabel(direction)}
        onClick={onJump}
        className={cn(
          "pointer-events-auto absolute inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-caption font-semibold transition-colors",
          // Under a pinned heading at the top, over the list's end at the
          // bottom.
          direction === "above" ? "top-8" : "bottom-2",
          side.addressed
            ? "border-transparent bg-mention text-mention-foreground"
            : "border-border bg-popover text-foreground hover:bg-card",
          FOCUS_RING,
        )}
      >
        {/* The chat family's arrow, up or down to where the unread are. */}
        {direction === "above" ? (
          <SendArrowGlyph className="h-3.5 w-3.5" />
        ) : (
          <JumpToLatestGlyph className="h-3.5 w-3.5" />
        )}
        {NEW_UNREADS_LABEL}
      </button>
    </div>
  );
}
