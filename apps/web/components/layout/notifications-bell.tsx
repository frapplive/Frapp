"use client";

import { useMemo, useState } from "react";
import { useNotifications } from "@repo/hooks";
import { NotificationsGlyph } from "@/components/layout/nav-glyphs";
import { NotificationsPopover } from "@/components/layout/notifications-popover";
import { FOCUS_RING_SHELL } from "@/components/ui/focus";
import { cn } from "@/lib/utils";

/**
 * The notifications bell and the list it opens.
 *
 * From `lg` up it sits in the sidebar's head beside the chapter's name
 * (#5946, where Claude, Linear and Notion keep theirs once there is no top
 * bar), and in the collapsed rail at its foot; below `lg` it stays in the top
 * bar. Each home draws its own bell, and only one is on screen at a time. The
 * list's always-on effects are not here (`useNotificationsLive`), so a second
 * mounted bell costs nothing.
 *
 * Its own component so the unread read redraws the bell, not the sidebar.
 */
export function NotificationsBell({
  side = "bottom",
  align = "end",
  className,
}: {
  /** Where the list opens from the bell (`NotificationsPopover`). */
  side?: "bottom" | "right";
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const unread = useMemo(() => {
    if (!Array.isArray(data)) return 0;
    return (data as Array<{ read_at?: string | null }>).filter(
      (n) => !n.read_at,
    ).length;
  }, [data]);

  return (
    <NotificationsPopover
      open={open}
      onOpenChange={setOpen}
      side={side}
      align={align}
    >
      <button
        type="button"
        aria-label={
          unread > 0 ? `Notifications (${unread} unread)` : "Notifications"
        }
        title="Notifications"
        className={cn(SHELL_ICON_BUTTON, "relative", className)}
      >
        <NotificationsGlyph className="h-[18px] w-[18px]" />
        {/*
          Fixed gold, and deliberately NOT `bg-primary`.

          `--primary` is the per-tenant accent slot, so painting the badge
          with it is the house-tenant mistake (`web-dashboard/tokens.md` § L-01):
          on a chapter seeded a red accent this badge becomes visually
          identical to the fixed `#E5484D` mention/DM badge, and a member
          can no longer tell "3 notifications" from "3 people addressed me".
          The board draws it in mark gold (`1b`). This uses `--gold-house`,
          the existing "never retints per chapter" brand slot, rather than
          adding a second fixed-gold token for one badge; the two differ by
          a step of hue and the load-bearing property (fixed, not tenant) is
          identical. Red stays reserved for direct address (foundations §5).
        */}
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-gold-house px-1 text-[9.5px] font-bold text-gold-on-house"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
    </NotificationsPopover>
  );
}

/**
 * The shell's icon control, radius 10: the bell, the collapse toggle. The
 * Small step on a mouse (foundations §9; 34px until #6115), 44 to a finger.
 */
export const SHELL_ICON_BUTTON = cn(
  "grid size-control-small pointer-coarse:size-11 shrink-0 place-items-center rounded-[10px] text-muted-foreground transition hover:bg-card hover:text-foreground",
  FOCUS_RING_SHELL,
);
