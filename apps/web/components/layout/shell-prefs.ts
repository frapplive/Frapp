import {
  writePreferenceCookie,
  writePreferenceValue,
} from "@/components/layout/nav-collapse";

/**
 * The chat panel's remembered layout (#3779; `shell-layout.ts` has the model).
 * Cookies, for the reason `nav-collapse.ts` gives: the dashboard layout reads
 * them on the server, so the first paint is already right.
 *
 * The server layout imports this module, so it must stay free of React hooks
 * and of `"use client"` (`lib/chat/members-panel.ts` says what breaks).
 */

export const CHAT_OPEN_COOKIE = "frapp_chat_open";

/** Open unless the member closed it: chat beside a tool is the default. */
export function parseChatOpen(value: string | undefined): boolean {
  return value !== "0";
}

export function persistChatOpen(open: boolean): void {
  writePreferenceCookie(CHAT_OPEN_COOKIE, open);
}

export const CHAT_WIDTH_COOKIE = "frapp_chat_width";

/**
 * The docked conversation's width beside a page, in pixels (#5575). The
 * floor, so the page keeps as much of the row as it can.
 */
export const DEFAULT_CHAT_WIDTH = 375;

/**
 * A missing or foreign value is the default. Any width is safe to lay out:
 * CSS holds both floors (`dashboard-shell.tsx`), so a width saved at a wider
 * window still fits a narrower one.
 */
export function parseChatWidth(value: string | undefined): number {
  if (value === undefined) return DEFAULT_CHAT_WIDTH;
  const n = Number(value);
  // No upper bound: the divider allows any width a row leaves the page its
  // floor beside, so an ultrawide window's choice must read back too.
  if (!Number.isFinite(n) || n < 0) return DEFAULT_CHAT_WIDTH;
  return Math.round(n);
}

export function persistChatWidth(width: number): void {
  writePreferenceValue(CHAT_WIDTH_COOKIE, String(Math.round(width)));
}
