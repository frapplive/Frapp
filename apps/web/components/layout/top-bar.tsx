"use client";

import Link from "next/link";
import { ChevronRight, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING_SHELL } from "@/components/ui/focus";
import { FindField } from "@/components/layout/find-bar";
import {
  NotificationsBell,
  SHELL_ICON_BUTTON,
} from "@/components/layout/notifications-bell";
import { ConnectionPill } from "@/components/shared/connection-pill";
import type { PageTitle } from "@/components/layout/page-title";
import { useChatHasUnread } from "@/components/layout/use-chat-has-unread";

/**
 * The 48px bar below `lg`: the drawer's trigger, the page title, Find, the
 * connection pill and the bell.
 *
 * **From `lg` up there is no top bar** (#5946, Paul 2026-11-24). Everything
 * it held has a home in the sidebar (`sidebar.tsx`): Search is a row, the
 * pill and the bell sit in the sidebar's head, the member and their menu are
 * at its foot, and a page's title is in the page's own header
 * (`tool-page-header.tsx`). The bar cost 48px above every conversation to
 * hold four controls a column already on screen had room for. Below `lg` the
 * sidebar is a drawer, closed most of the time, so the bar stays there for
 * what has to be reachable without opening it. The account avatar is not one
 * of those: the member's row is the drawer's foot, and one menu is the rule.
 *
 * **The page title is here below `lg`** and is the route's only `<h1>`
 * there, derived from the route (`page-title.ts`), so it is on the loading,
 * offline and error paths too. A page under another adds its parent as a
 * link and a chevron, "Backwork › Bulk upload".
 *
 * **The connection pill is first in the right cluster** (2026-11-06). It
 * used to float just below the bar, over the first row of every page. In the
 * bar it covers nothing, and it never resizes the find field: it sits in a
 * fixed slot as a dot (`components/shared/connection-pill.tsx`).
 *
 * Not `sticky`. The column this bar heads never scrolls (`<main>` does), so
 * there is nothing to stick to (#1746). No `z-index` either: a positioned,
 * z-indexed bar would be a stacking context capping the find results' `z-50`
 * at the bar's level.
 */

type TopBarProps = {
  /** The open route's title; `null` leaves the cell empty (an unmapped route). */
  pageTitle: PageTitle | null;
  /**
   * Whether this copy is the route's `<h1>`. From `lg` up the bar is not
   * drawn and the heading is the page's own header's, so there is one.
   */
  titleIsHeading?: boolean;
  onOpenMobileNav: () => void;
};

export function TopBar({
  pageTitle,
  titleIsHeading = true,
  onOpenMobileNav,
}: TopBarProps) {
  return (
    <header
      data-top-bar=""
      className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface-1 px-3 lg:hidden"
    >
      {/*
        Left cell. It leads with the drawer trigger, which is the only way to
        reach navigation at this width. It carries the page title, shown from
        `sm` up, which truncates before anything else in the bar gives way.
        From `sm` it is `flex-1` and splits the free space with the find
        field; below `sm`, where the title is hidden, it is `shrink-0`, only
        as wide as the trigger, so the find field keeps the rest of a
        phone-width bar.
      */}
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:flex-1 sm:basis-0">
        <MobileNavTrigger onOpen={onOpenMobileNav} />
        {pageTitle ? (
          <PageTitleText
            pageTitle={pageTitle}
            asHeading={titleIsHeading}
            className="sr-only sm:not-sr-only"
          />
        ) : null}
      </div>

      {/*
        `flex-1 basis-*`, NOT `w-full`.

        `w-full` makes the field's flex BASE SIZE the full width of the bar, so
        below roughly 568px the hypothetical main size already overflows, there
        is no free space to distribute, and both `flex-1 min-w-0` side cells
        resolve to 0px. The field's opaque background then paints over the
        drawer trigger — which is the only route to navigation at all — and
        the right cluster overflows back across it. A basis of 0 with `flex-1`
        lets all three cells share the line.
      */}
      <FindField className="min-w-0 flex-1 basis-0 sm:max-w-[520px]" />

      <div className="flex shrink-0 items-center justify-end gap-1.5">
        {/*
          A 28px slot the bar keeps whether or not there is anything to say,
          so a state that flaps never resizes the find field or the title.
        */}
        <div className="flex w-7 shrink-0 justify-end">
          <ConnectionPill placement="inline" />
        </div>
        <NotificationsBell />
      </div>
    </header>
  );
}

/**
 * The drawer trigger, the only route to navigation below `lg`. It carries the
 * nav's unread mark (#3900): the Channels row lights on every page when a
 * message arrives (#3824), and the Messages row counts unread conversations
 * (#3774), but below `lg` both sit in a closed drawer, so without a mark here
 * a message landing while the member is on Calendar showed nothing.
 * Slack's and Discord's phone layouts mark the collapsed nav the same way, on
 * the menu button.
 *
 * - **The same mark as the row it leads to**: a plain dot in `foreground`, not
 *   a count. Red stays reserved for direct address and gold for the
 *   notifications badge beside it (foundations §5). It stands for both chat
 *   rows, so a direct message lights it too, and the drawer then shows the
 *   Channels row's dot, the Messages row's red count, or both.
 * - **8px, not the row's 6px, with a 2px cutout** in the bar's own surface.
 *   It sits on the glyph's corner, over the top line's end, and the cutout is
 *   what keeps it a separate mark rather than a blob on the line; it tracks
 *   the button's hover fill so the cutout never shows as a ring.
 * - **Named**: "Open navigation menu, unread messages", the way the collapsed
 *   rail names its lit Channels button.
 *
 * Its own component so the unread reads redraw this button, not the bar or
 * the shell (the counts change with every message the inbox reports).
 */
function MobileNavTrigger({ onOpen }: { onOpen: () => void }) {
  const hasUnread = useChatHasUnread();
  const label = hasUnread
    ? "Open navigation menu, unread messages"
    : "Open navigation menu";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      /*
       * The bar exists ONLY on the touch tier, where the 44px floor binds,
       * and this is the only route to navigation there, so it cannot take
       * the shell's pointer geometry (the Small step on a mouse).
       */
      className={cn(
        SHELL_ICON_BUTTON,
        // `min-h-touch`/`min-w-touch`, not `h-touch`: only the min-* keys
        // are bound to `--touch-min` in the Tailwind config, and an unknown
        // key compiles to nothing at all rather than erroring (#1145).
        "group min-h-touch min-w-touch",
      )}
    >
      <span className="relative">
        <Menu className="block h-[18px] w-[18px]" aria-hidden="true" />
        {hasUnread ? (
          <span
            aria-hidden="true"
            data-menu-unread=""
            className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-foreground ring-2 ring-surface-1 group-hover:ring-card"
          />
        ) : null}
      </span>
    </button>
  );
}

/**
 * The title, with its parent when it has one. The page's own header draws it
 * from `lg` up (`tool-page-header.tsx`), and the top bar below it.
 *
 * The parent is a quiet link (muted, `label` at 500) and the title the anchor
 * (`label` at 700): the board's 15/700 rounds onto the `label` step and keeps
 * only the weight (#2842).
 *
 * **Below `sm` the top bar's copy is visually hidden**, and stays the `<h1>`
 * for a screen reader. The `sr-only` sits on the wrapper, not the `<h1>`:
 * `not-sr-only` resets `overflow` and `white-space`, which on the `<h1>` would
 * undo `truncate` from `sm` up and let a long name wrap the bar. A 390px bar
 * holds the drawer trigger, the find field and the right cluster, and nothing
 * else: sharing it cut the title to "Stud…" and the find field to a bare
 * glyph (measured 2026-11-05). On a phone the drawer marks the open row, and
 * the mobile app, which has its own titles, is the phone surface. Everything
 * is `nowrap` and the title truncates from `sm` up, so a long name never wraps
 * the 48px bar onto a second line.
 *
 * `asHeading` false draws the same words without the `<h1>`, for the copy
 * the shell is not using as the route's heading.
 */
export function PageTitleText({
  pageTitle,
  asHeading = true,
  className,
}: {
  pageTitle: PageTitle;
  asHeading?: boolean;
  className?: string;
}) {
  const { title, parent } = pageTitle;
  const Title = asHeading ? "h1" : "p";
  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      {parent ? (
        <>
          <Link
            href={parent.href}
            className={cn(
              "hidden shrink-0 rounded-[6px] px-0.5 text-label font-medium text-muted-foreground transition hover:text-foreground sm:inline",
              FOCUS_RING_SHELL,
            )}
          >
            {parent.label}
          </Link>
          <ChevronRight
            className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block"
            aria-hidden="true"
          />
        </>
      ) : null}
      <Title className="min-w-0 truncate text-label font-bold text-foreground">
        {title}
      </Title>
    </div>
  );
}
