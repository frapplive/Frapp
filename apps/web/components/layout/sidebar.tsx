"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import {
  activityCountChip,
  useActivity,
  useHiddenUnsetFeatures,
} from "@repo/hooks";
import { SECTION_NAMES } from "@repo/validation";
import { cn } from "@/lib/utils";
import { AccountMenu } from "@/components/layout/account-menu";
import { ChannelListSlot } from "@/components/layout/channel-list-slot";
import {
  ChapterLabel,
  useChapterSwitcher,
} from "@/components/layout/chapter-switcher";
import { useFind } from "@/components/layout/find-bar";
import {
  MORE_ROWS,
  SIDEBAR_ROWS,
  type NavItem,
} from "@/components/layout/nav-config";
import { ChatGlyph, SearchGlyph } from "@/components/layout/nav-glyphs";
import {
  NotificationsBell,
  SHELL_ICON_BUTTON,
} from "@/components/layout/notifications-bell";
import {
  isNavItemVisible,
  navRowClassName,
  ProtectedNavItem,
} from "@/components/layout/protected-nav-item";
import { ASK_ROUTE, isAskRoute } from "@/components/layout/shell-layout";
import { useAskEntry } from "@/components/ask/ask-host";
import { useNavHighlights } from "@/components/layout/use-chat-has-unread";
import { LiveMeetingCard } from "@/components/meetings/live-meeting-card";
import { ConnectionPill } from "@/components/shared/connection-pill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FOCUS_RING_SHELL } from "@/components/ui/focus";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * The sidebar: the one column left of everything, on every route (#5946,
 * Paul 2026-11-24, epic #5943; `spec/ui/web-dashboard/README.md`
 * § Navigation map).
 *
 * Top to bottom:
 *
 * 1. **Head**, 48px, level with the page and channel headers beside it: the
 *    chapter's mark and name as a label, the connection pill when there is a
 *    problem, the notifications bell, and the collapse control.
 * 2. **The rows**: New, Search, then Activity, Messages, Calendar, Resources
 *    and Directory (`nav-config.ts`), the same for every role, and More
 *    while pages are still being folded into those.
 * 3. **The chapter's channels**, after a hairline, scrolling in what is left.
 *    No heading and no control sits over the list (Paul, 2026-11-24: no
 *    switcher over a list); the list is chat's own, drawn here through
 *    `ChannelListSlot`.
 * 4. **The member**, at the foot, and their one menu (`account-menu.tsx`).
 *
 * It replaced a 240px nav of twelve rows under two headings beside a second
 * 240px channels column, under a 48px top bar: 480px and a bar spent before
 * the first message. Claude, Slack, Discord, Linear and Notion all keep one
 * sidebar with a few destinations over a scrolling list and the person at
 * the foot or the head; Apple's HIG keeps a sidebar to the top-level places
 * people use most, and NN/g's left-navigation guidance asks for a scannable
 * list that says where you are.
 *
 * **264px, not 240**: a 24-character channel name and "Beta Theta Omega"
 * beside the bell both fit. **56px as a rail**, the member's preference: the
 * rows as glyphs, a Channels button that opens the list beside it, then the
 * bell, the expand control and the avatar at the foot.
 *
 * **Below `lg` it is the drawer** (`variant="drawer"`), always expanded,
 * rows at the 44px touch height. The drawer holds a Channels row where the
 * column holds the list: below `lg` the shell is one page at a time and chat
 * is mounted only on its own page, which keeps its list there
 * (`dashboard-shell.tsx`). The top bar it opens from keeps the bell and the
 * connection pill, so the drawer's head is the chapter alone.
 */

type SidebarProps = {
  /** `column`: the desktop shell's left column. `drawer`: inside the sheet. */
  variant?: "column" | "drawer";
  /** Rail: the member's preference. Never in the drawer. */
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  /** `undefined` hides gated rows until the read answers (`useNavPermissions`). */
  permissions: readonly string[] | null | undefined;
  isModuleEnabled?: (moduleKey: string) => boolean;
  pathname: string;
  /** Closes the drawer behind a navigation. */
  onNavigate?: () => void;
  /**
   * Clicking the open page's row closes the page (#3779). Given, the row
   * whose route is open becomes a button that calls this instead of a link
   * to the page already on screen.
   */
  onCloseTool?: () => void;
};

/** The collapse toggle's action, named as the sidebar it folds (#4044). */
const TOGGLE_LABEL = {
  collapse: "Collapse sidebar",
  expand: "Expand sidebar",
} as const;

/** 18px duotone glyph, per `1b` pin 2. */
const ICON = "h-[18px] w-[18px]";

/**
 * A row's `aria-current`: "page" on its own page, "true" on a page under it
 * (a meeting's minutes under Meetings, Bulk upload under Backwork), so the
 * sidebar always says where you are (rulebook § 8). Only "page" makes the row
 * close the page it opened; under it, the row goes back to its list.
 */
export function currentFor(
  item: Pick<NavItem, "href">,
  pathname: string,
): "page" | "true" | undefined {
  if (item.href === pathname) return "page";
  return pathname.startsWith(`${item.href}/`) ? "true" : undefined;
}

export function Sidebar({
  variant = "column",
  collapsed,
  onToggleCollapsed,
  permissions,
  isModuleEnabled,
  pathname,
  onNavigate,
  onCloseTool,
}: SidebarProps) {
  const isDrawer = variant === "drawer";
  // The drawer has no room to be a rail and no toggle to leave it.
  const rail = collapsed && !isDrawer;
  const switcher = useChapterSwitcher();
  const { channels: channelsUnread, messages: unreadMessages } =
    useNavHighlights();
  const activityCount = activityCountChip(useActivity().data);
  // Study hours with no active zone, and Documents with nothing in it for a
  // viewer who can't upload, leave the nav (`nav-config.ts`, Setup gating).
  const hiddenFeatures = useHiddenUnsetFeatures(permissions, isModuleEnabled);
  const visible = (item: NavItem) =>
    isNavItemVisible(item, permissions, isModuleEnabled, hiddenFeatures);

  const counts: Record<
    string,
    React.ComponentProps<typeof ProtectedNavItem>["count"]
  > = {
    activity: activityCount
      ? {
          text: activityCount.label,
          label: activityCount.spoken,
          tone: "plain",
        }
      : undefined,
    messages:
      unreadMessages > 0
        ? {
            text: unreadMessages > 99 ? "99+" : String(unreadMessages),
            label:
              unreadMessages === 1
                ? "1 unread conversation"
                : `${unreadMessages} unread conversations`,
            tone: "mention",
          }
        : undefined,
  };

  const CollapseIcon = rail ? PanelLeftOpen : PanelLeftClose;
  const toggle = onToggleCollapsed ? (
    <button
      type="button"
      onClick={onToggleCollapsed}
      aria-label={rail ? TOGGLE_LABEL.expand : TOGGLE_LABEL.collapse}
      aria-expanded={!rail}
      title={rail ? TOGGLE_LABEL.expand : TOGGLE_LABEL.collapse}
      data-nav-toggle=""
      className={SHELL_ICON_BUTTON}
    >
      <CollapseIcon className={ICON} aria-hidden="true" />
    </button>
  ) : null;

  return (
    <div
      data-sidebar=""
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        isDrawer
          ? "w-full"
          : cn(
              "box-border h-full shrink-0 border-r border-border bg-surface-1",
              rail ? "w-14" : "w-[264px]",
            ),
      )}
    >
      {/*
        The head. Not a centring flex box in the rail: the recovery card
        (`ChapterLabel`), which is 200px wide whatever the rail says, must
        overflow to the right, into view, not to both sides.
      */}
      <div
        className={cn(
          "box-border flex min-h-12 shrink-0 items-center gap-0.5 border-b border-border",
          rail ? "px-2" : "pl-2 pr-1.5",
          isDrawer && "border-b-0 px-0",
        )}
      >
        <ChapterLabel switcher={switcher} collapsed={rail} />
        {rail || isDrawer || switcher.stranded ? null : (
          <>
            {/*
              No slot is kept for the pill: the head has the chapter's name
              to fit. When there is a problem the pill takes its 28px from
              the name, which truncates; the bell and the toggle stay put.
            */}
            <ConnectionPill placement="inline" />
            <NotificationsBell side="bottom" align="start" />
            {toggle}
          </>
        )}
      </div>

      <nav
        aria-label="Primary"
        className={cn(
          "flex shrink-0 flex-col gap-0.5",
          isDrawer ? "py-2" : "p-2",
          rail && "items-center",
        )}
      >
        <NewRow pathname={pathname} collapsed={rail} onNavigate={onNavigate} />
        <SearchRow collapsed={rail} onNavigate={onNavigate} />
        {SIDEBAR_ROWS.map((item) => {
          const current = currentFor(item, pathname);
          // A gated row is hidden until the permission read answers (#3854).
          // It holds its place meanwhile, so More and the channel list don't
          // move down a row when it arrives.
          if (
            permissions === undefined &&
            (item.requirePermission !== undefined ||
              item.requireAnyOf !== undefined)
          ) {
            return (
              <span
                key={item.id}
                aria-hidden="true"
                data-nav-placeholder=""
                className="block min-h-touch shrink-0 lg:h-[34px] lg:min-h-0"
              />
            );
          }
          return (
            <ProtectedNavItem
              key={item.id}
              item={item}
              current={current}
              permissions={permissions}
              iconClassName={ICON}
              onNavigate={onNavigate}
              focusClassName={FOCUS_RING_SHELL}
              isModuleEnabled={isModuleEnabled}
              hiddenFeatures={hiddenFeatures}
              collapsed={rail}
              count={counts[item.id]}
              {...(onCloseTool && current === "page"
                ? {
                    // Only the row whose own page is open.
                    onSelect: onCloseTool,
                    pressed: true,
                    selectLabel: `Close ${item.title ?? item.label}`,
                  }
                : {})}
            />
          );
        })}
        <MoreRow
          items={MORE_ROWS.filter(visible)}
          pathname={pathname}
          collapsed={rail}
          onNavigate={onNavigate}
        />
        {isDrawer ? (
          <ChannelsLink
            pathname={pathname}
            unread={channelsUnread}
            onNavigate={onNavigate}
          />
        ) : null}
      </nav>

      {isDrawer ? (
        <div className="min-h-0 flex-1" />
      ) : rail ? (
        <div className="flex min-h-0 flex-1 flex-col items-center">
          {/* Rail grouping is a hairline, since a heading has nowhere to go. */}
          <span
            aria-hidden="true"
            className="mb-2 h-px w-6 shrink-0 bg-border"
          />
          <ChannelsPopover unread={channelsUnread} />
        </div>
      ) : (
        <>
          <span aria-hidden="true" className="mx-2 h-px shrink-0 bg-border" />
          {/*
            The chapter's channels, in whatever height is left. `section`
            with a name, so a screen reader finds the list as a region; the
            name is not drawn, because nothing sits over the list.
          */}
          <section
            aria-label="Channels"
            data-sidebar-channels=""
            className="flex min-h-0 flex-1 flex-col pt-1"
          >
            <ChannelListSlot />
          </section>
        </>
      )}

      {/* A live meeting the viewer runs shows its Start minutes card above
          the foot (#5219). No room in the rail. */}
      {rail ? null : (
        <div className={cn("shrink-0 empty:hidden", isDrawer ? "" : "px-2")}>
          <LiveMeetingCard />
        </div>
      )}

      <div
        className={cn(
          "flex shrink-0 flex-col gap-0.5 border-t border-border",
          isDrawer ? "pt-2" : "p-2",
          rail && "items-center",
        )}
      >
        {rail ? (
          <>
            <ConnectionPill placement="inline" />
            <NotificationsBell side="right" align="end" />
            {toggle}
          </>
        ) : null}
        <AccountMenu
          variant={rail ? "rail" : "foot"}
          switcher={switcher}
          onNavigate={onNavigate}
        />
      </div>
      {switcher.dialog}
    </div>
  );
}

/**
 * New: the first row, and the app's one way to start anything (Paul,
 * 2026-11-24: "a universal new button which opens a chat with Frapp
 * Intelligence"). It opens Frapp Intelligence's page, whose field takes a
 * sentence and whose action row under it opens each form directly
 * (`ask-page.tsx`). It wears the shared New button's outlined accent
 * (`ui/new-button.tsx`), so "New" looks the same here as on every page; the
 * accent goes to it alone among the rows.
 */
function NewRow({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const open = isAskRoute(pathname);
  const askEntry = useAskEntry();
  return (
    <Link
      href={ASK_ROUTE}
      onClick={(event) => {
        // Already on New: the press means "start typing", as Claude's New
        // chat does from its own page (`openAsk` puts focus in the field).
        if (open && askEntry) {
          event.preventDefault();
          askEntry.openAsk();
        }
        onNavigate?.();
      }}
      aria-current={open ? "page" : undefined}
      aria-label={collapsed ? "New" : undefined}
      title={collapsed ? "New" : undefined}
      data-nav-new=""
      className={cn(
        // The row's geometry with the action button's edge: 1px of border
        // inside the same 34px, so its glyph lines up with the rows under it.
        "relative mb-1 flex min-h-touch items-center rounded-[10px] border border-primary/35 text-left text-sm font-semibold text-primary transition hover:bg-primary/10 lg:h-[34px] lg:min-h-0",
        collapsed ? "w-[34px] justify-center" : "w-full gap-2.5 px-[9px]",
        open && "border-accent-border bg-accent-subtle text-accent-text",
        FOCUS_RING_SHELL,
      )}
    >
      <Plus className={ICON} aria-hidden="true" />
      {collapsed ? null : <span className="truncate">New</span>}
    </Link>
  );
}

/**
 * Search: opens Find (`find-bar.tsx`), the centred dialog Cmd/Ctrl+F opens
 * too. A row since the top bar and its field went (#5946), where Claude and
 * Notion keep theirs.
 */
function SearchRow({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const find = useFind();
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={find.open}
      aria-label={collapsed ? SECTION_NAMES.search : undefined}
      title={collapsed ? SECTION_NAMES.search : undefined}
      onClick={(event) => {
        // In the drawer the row leaves with the drawer, so there is nothing
        // to hand focus back to.
        find.openFind({ returnTo: onNavigate ? null : event.currentTarget });
        onNavigate?.();
      }}
      className={navRowClassName({
        collapsed,
        active: false,
        focusClassName: FOCUS_RING_SHELL,
      })}
    >
      <SearchGlyph className={ICON} />
      {collapsed ? null : (
        <span className="truncate">{SECTION_NAMES.search}</span>
      )}
    </button>
  );
}

/**
 * More: the pages a later step of #5943 folds into the rows above, a dropdown
 * under its button until then (`nav-config.ts` `MORE_ROWS`). It is lit while
 * one of its pages is open, so the sidebar still says where you are. With
 * nothing to hold (every step landed, or every module off) it is not drawn.
 */
function MoreRow({
  items,
  pathname,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  if (items.length === 0) return null;
  const open = items.find((item) => currentFor(item, pathname));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={collapsed ? "More" : undefined}
          title={collapsed ? "More" : undefined}
          aria-current={open ? "true" : undefined}
          data-nav-more=""
          className={cn(
            navRowClassName({
              collapsed,
              active: Boolean(open),
              focusClassName: FOCUS_RING_SHELL,
            }),
            !open &&
              "data-[state=open]:bg-card data-[state=open]:text-foreground",
          )}
        >
          {/* Not ⋯, which is the app's action menu (rulebook § 9). */}
          <LayoutGrid className={ICON} aria-hidden="true" />
          {collapsed ? null : (
            <>
              <span className="truncate">More</span>
              <ChevronDown
                className="ml-auto mr-1 h-3.5 w-3.5 shrink-0 opacity-70"
                aria-hidden="true"
              />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={collapsed ? "right" : "bottom"}
        className="w-[248px]"
      >
        {items.map((item) => {
          const current = currentFor(item, pathname);
          return (
            <DropdownMenuItem key={item.id} asChild>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={current}
                className={cn(current && "font-semibold text-accent-text")}
              >
                <item.icon className={ICON} active={Boolean(current)} />
                <span>{item.label}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What a screen reader hears after a lit Channels control's name. */
const CHANNELS_UNREAD = "unread messages";

/**
 * The drawer's Channels row: below `lg` the channel list is chat's own page,
 * so the drawer links to it where the column holds the list. It lights while
 * a channel has something unread (#3824).
 */
function ChannelsLink({
  pathname,
  unread,
  onNavigate,
}: {
  pathname: string;
  unread: boolean;
  onNavigate?: () => void;
}) {
  return (
    <ProtectedNavItem
      item={CHANNELS_ROW}
      current={pathname === "/chat" ? "page" : undefined}
      permissions={null}
      iconClassName={ICON}
      onNavigate={onNavigate}
      focusClassName={FOCUS_RING_SHELL}
      highlight={unread ? CHANNELS_UNREAD : undefined}
    />
  );
}

/** The drawer's Channels row, as a row (no gates: every member has chat). */
const CHANNELS_ROW: NavItem = {
  id: "channels",
  label: "Channels",
  icon: ChatGlyph,
  href: "/chat",
  description: "The chapter's channels.",
};

/**
 * The rail's Channels button: the channel list, in a popover beside it. The
 * list is the same one the expanded column holds (`ChannelListSlot`), so the
 * rail keeps every channel one click away, with its pips, menus and order.
 * Picking a channel closes it.
 */
function ChannelsPopover({ unread }: { unread: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  /*
    The list is chat's own, portaled in from the chat panel, so in React's
    tree it is not inside this popover, and Radix would read every focus and
    press on it (and on the row and filter menus it opens, which portal to the
    body) as outside, and close. Inside the popover's box, or in a menu, is
    inside.
  */
  const content = useRef<HTMLDivElement>(null);
  const keepIfInside = useCallback((event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      content.current?.contains(target) ||
      target.closest("[data-radix-popper-content-wrapper], [role='menu']")
    ) {
      event.preventDefault();
    }
  }, []);
  const label = unread ? `Channels, ${CHANNELS_UNREAD}` : "Channels";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title="Channels"
          data-nav-channels=""
          className={cn(
            navRowClassName({
              collapsed: true,
              active: false,
              lit: unread,
              focusClassName: FOCUS_RING_SHELL,
            }),
            "data-[state=open]:bg-card data-[state=open]:text-foreground",
          )}
        >
          <ChatGlyph className={ICON} />
          {unread ? (
            <span
              aria-hidden="true"
              data-nav-highlight=""
              className="absolute right-1 top-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
            />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        onPointerDownOutside={keepIfInside}
        onFocusOutside={keepIfInside}
        side="right"
        align="start"
        sideOffset={12}
        collisionPadding={8}
        aria-label="Channels"
        // The sidebar's own width and surface, so the list reads as the
        // column it is, opened.
        className="flex h-[min(560px,var(--radix-popover-content-available-height))] w-[264px] flex-col overflow-hidden bg-surface-1 p-0 pt-1"
      >
        <ChannelListSlot onPicked={close} />
      </PopoverContent>
    </Popover>
  );
}
