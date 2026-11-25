"use client";

import { useMediaQuery } from "@/lib/use-media-query";

export { useMediaQueryState } from "@/lib/use-media-query";

/**
 * The desktop shell's layout state: one sidebar, then a page and the open
 * conversation (#5946, Paul 2026-11-24; chat as a panel beside the chapter
 * tools since #3779, the tool first since #5575).
 *
 * The sidebar always stays, and holds the chapter's channel list, so picking
 * a channel never costs a column. A row opens its page in the main column
 * right of the sidebar; the open conversation docks on the right with a
 * draggable divider between them, and its X closes it. With no page open the
 * conversation has the row to itself.
 *
 * - **The open page is the URL** (`/events`), so links and Back work as they
 *   always did. `/chat` is "no page": the conversation alone. `/messages` is
 *   the Messages page, the member's conversations listed beside the open one.
 * - **Chat open or closed beside a page is a cookie**, and so is the docked
 *   conversation's width, both read by the dashboard layout on the server so
 *   the first paint is right. They live in `shell-prefs.ts`, which the server
 *   imports, so it holds no hooks.
 *
 * Side by side needs room for both 375px floors (the width the thread is
 * tested at) beside the full sidebar, which is exactly the width the sidebar
 * appears at (`lg`), so the shell has two states and one switch: below `lg`
 * it is a single page behind a drawer, and from `lg` up it is the sidebar,
 * the page and the conversation.
 */

/** The width every side-by-side column keeps, chat's panel and the tool page. */
export const PANE_FLOOR = 375;
/** The sidebar, expanded: wide enough for a 24-character channel name. */
export const SIDEBAR_WIDTH = 264;
/** Hairlines: the sidebar's and the divider's. */
const HAIRLINES = 2;

/** The shell's `lg` breakpoint: the sidebar appears, and the split with it. */
export const SPLIT_MIN_WIDTH = 1024;

// Asserted here rather than left to arithmetic in a comment.
if (SIDEBAR_WIDTH + 2 * PANE_FLOOR + HAIRLINES > SPLIT_MIN_WIDTH) {
  throw new Error(
    "shell-layout: the split breakpoint is below the pane floors",
  );
}

export const SPLIT_QUERY = `(min-width: ${SPLIT_MIN_WIDTH}px)`;

/**
 * The shell's lg breakpoint (1024px), where the left column appears and the
 * drawer goes away (`spec/ui/web-dashboard/README.md` § Responsive contract).
 */
const DESKTOP_SHELL_QUERY = SPLIT_QUERY;

/** Whether the desktop column is on screen. `false` on the server. */
export function useIsDesktopShell(): boolean {
  return useMediaQuery(DESKTOP_SHELL_QUERY);
}

/** The Messages page: the member's conversations beside the open one. */
export const MESSAGES_ROUTE = "/messages";

/** Whether `pathname` is the Messages page. */
export function isMessagesRoute(pathname: string | null): boolean {
  return (
    pathname === MESSAGES_ROUTE ||
    Boolean(pathname?.startsWith(`${MESSAGES_ROUTE}/`))
  );
}

/**
 * The routes that hold no tool page, where chat has the row: the open
 * conversation alone (`/chat`), or the Messages page.
 */
export function isChatRoute(pathname: string | null): boolean {
  return (
    pathname === "/chat" ||
    Boolean(pathname?.startsWith("/chat/")) ||
    isMessagesRoute(pathname)
  );
}

/**
 * A field that leaves Escape to the page: Escape there closes the tool page
 * as it does from the page's blank space. Ask's field carries it while empty,
 * where the cursor starts.
 */
export const ESCAPE_LEAVES_ATTRIBUTE = "data-escape-leaves";

/**
 * Frapp Intelligence's page (Paul's pick of 2026-11-22), which the sidebar's
 * New row opens (#5946): the assistant's field, with what New starts under it.
 */
export const ASK_ROUTE = "/ask";

/** Whether `pathname` is Frapp Intelligence's page. */
export function isAskRoute(pathname: string | null): boolean {
  return (
    pathname === ASK_ROUTE || Boolean(pathname?.startsWith(`${ASK_ROUTE}/`))
  );
}

/**
 * Tool routes that take the whole row: chat hides beside them and comes back
 * on leaving (decision 3 of #4068, Paul 2026-11-10). Chapter settings is a
 * grouped rail beside a form; beside chat at a 1280px window its Chapter form
 * was about 150px wide. Chat's open state is left alone, so the next tool
 * page finds it where the member left it.
 */
export function isFullWidthToolRoute(pathname: string | null): boolean {
  return (
    pathname === "/settings" || Boolean(pathname?.startsWith("/settings/"))
  );
}

/**
 * The chat panel's widths a row of `rowWidth` pixels allows: the panel at
 * least `PANE_FLOOR`, and the tool page beside it (the divider's `w-2 -mx-1`
 * takes no width of its own)
 * at least `PANE_FLOOR`. On a row too narrow for both, both bounds are the
 * floor.
 */
export function chatWidthBounds(rowWidth: number): {
  min: number;
  max: number;
} {
  return {
    min: PANE_FLOOR,
    max: Math.max(PANE_FLOOR, Math.floor(rowWidth - PANE_FLOOR)),
  };
}

export function clampChatWidth(width: number, rowWidth: number): number {
  const { min, max } = chatWidthBounds(rowWidth);
  return Math.round(Math.min(max, Math.max(min, width)));
}
