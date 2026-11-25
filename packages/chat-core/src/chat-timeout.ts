/**
 * Chat timeouts on the clients (#6006, `spec/behavior/chat/README.md`
 * § Timeouts): what the composer's banner says, which message menus offer
 * Time out, and how a refused send reads. Web and the phone read these, so
 * the two say and offer the same.
 *
 * The rules themselves (the durations, the code, which channels a timeout
 * reaches) live in `@repo/validation`, which the API enforces from.
 */

import { codeOf } from "@repo/api-sdk";
import { dayDelta, formatDay, formatTimeOfDay } from "@repo/formatting";
import {
  CHAT_TIMED_OUT_CODE,
  chatTimeoutApplies,
  isChatTimeoutActive,
} from "@repo/validation";
import { isBlockableSender } from "./blocks";
import { canReportMessage } from "./message-actions";
import type { ChatMessage } from "./types";

/** A member's own timeout as `GET /v1/chat/timeout` serves it. */
export interface ChatTimeoutState {
  until: string | null;
  reason: string | null;
}

/** The menu entry, the dialog's title and its commit, on both apps. */
export const CHAT_TIMEOUT_COPY = {
  action: "Time out",
  lift: "Lift timeout",
  title: (name: string) => `Time out ${name}`,
  duration: "How long",
  reason: "Reason",
  reasonPlaceholder: "Optional. They'll see it.",
  commit: "Time out",
  // What the dialog says about what a timeout does, once, under its title.
  effect:
    "They can still read and send DMs, but can't post or react in channels.",
  timedOut: "Timed out",
  liftConfirmTitle: (name: string) => `Lift ${name}'s timeout?`,
  liftConfirmBody: "They can post and react in channels again right away.",
  // The profile read says the viewer can't (`viewer_can_timeout`): the
  // server's own rule, said before anything is sent.
  outOfReach: "You can only time out members ranked below you.",
  failed: "Couldn't time them out. Try again.",
  liftFailed: "Couldn't lift the timeout. Try again.",
  /** The line on a timed-out member's profile and in the dialog. */
  until: (until: string, now?: Date) =>
    `Timed out until ${timeoutEndLabel(until, now)}`,
} as const;

/**
 * When a timeout ends, the way a member reads a time: `"3:40 PM"` today,
 * `"tomorrow at 3:40 PM"`, the weekday within the week (`"Friday at 3:40
 * PM"`), else the date (`"December 2 at 3:40 PM"`).
 */
export function timeoutEndLabel(until: string, now: Date = new Date()): string {
  const at = new Date(until);
  const clock = formatTimeOfDay(at);
  const days = dayDelta(now, at);
  if (days <= 0) return clock;
  if (days === 1) return `tomorrow at ${clock}`;
  if (days < 7) {
    return `${at.toLocaleDateString(undefined, { weekday: "long" })} at ${clock}`;
  }
  return `${formatDay(at, now) ?? ""} at ${clock}`;
}

/**
 * The composer's banner for a member timed out of the channel they're in, or
 * `null` when they can post: none running, or a DM or group DM, which a
 * timeout doesn't reach. `detail` is the officer's reason, when they gave one.
 */
export function chatTimeoutNotice(
  timeout: ChatTimeoutState | null | undefined,
  channel: { type?: string | null } | null | undefined,
  now: Date = new Date(),
): { title: string; detail: string | null } | null {
  if (!timeout?.until || !channel || !chatTimeoutApplies(channel)) return null;
  if (!isChatTimeoutActive(timeout.until, now.getTime())) return null;
  return {
    title: `You're timed out until ${timeoutEndLabel(timeout.until, now)}`,
    detail: timeout.reason?.trim() ? `Reason: ${timeout.reason.trim()}` : null,
  };
}

/** Whether an API failure is a timeout's refusal (the coded 403). */
export function isChatTimedOutError(error: unknown): boolean {
  return codeOf(error) === CHAT_TIMED_OUT_CODE;
}

/**
 * Whether Time out is offered in this conversation at all: the viewer holds
 * `members:timeout` (or `*`) and it is a channel a timeout reaches, not a DM.
 */
export function timeOutOfferedIn(
  canTimeOutMembers: boolean,
  channel: { type?: string | null } | null | undefined,
): boolean {
  return canTimeOutMembers && !!channel && chatTimeoutApplies(channel);
}

/**
 * Whether a message's menu offers Time out on its sender, where
 * {@link timeOutOfferedIn} says the conversation does: anyone else's
 * confirmed message from a member (not Frapp's own posts, or an imported row
 * nobody linked). The rank rule is the server's: the dialog reads the
 * member's profile and says when they rank too high, before anything is
 * sent.
 */
export function canTimeOutSender(
  message: Pick<ChatMessage, "sender_id" | "_status" | "is_deleted"> &
    Partial<Pick<ChatMessage, "kind" | "payload">>,
  viewerId: string | null,
  offeredHere: boolean,
): boolean {
  return (
    offeredHere &&
    isBlockableSender(message.sender_id) &&
    canReportMessage(message, viewerId)
  );
}
