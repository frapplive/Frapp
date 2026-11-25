/**
 * Chat timeouts (#6006, `spec/behavior/chat/README.md` § Timeouts): an
 * officer holding `members:timeout` stops a member ranked below them from
 * posting or reacting in the chapter's channels for a set time, as Discord's
 * Timeout does. DMs and group DMs are unaffected, and the member still reads.
 *
 * The API enforces it (`ChannelAccessService`) and the clients read the same
 * rules from here, so a composer never offers what the server refuses.
 */

import { isDirectChannel } from "./chat-notification-defaults";

/** The lengths an officer picks from, shortest first. */
export const CHAT_TIMEOUT_DURATIONS = [
  { key: "5m", minutes: 5, label: "5 minutes" },
  { key: "1h", minutes: 60, label: "1 hour" },
  { key: "1d", minutes: 60 * 24, label: "1 day" },
  { key: "1w", minutes: 60 * 24 * 7, label: "1 week" },
] as const;

export type ChatTimeoutDurationKey =
  (typeof CHAT_TIMEOUT_DURATIONS)[number]["key"];

export const CHAT_TIMEOUT_DURATION_KEYS: readonly ChatTimeoutDurationKey[] =
  CHAT_TIMEOUT_DURATIONS.map((duration) => duration.key);

/** The longest reason an officer can give. The column's check holds the same. */
export const CHAT_TIMEOUT_REASON_MAX = 200;

/**
 * The first segment of the React Query key the member's own timeout is cached
 * under (`useMyChatTimeout` in `@repo/hooks`). Chat-core invalidates it when a
 * write comes back refused for a timeout, so the composer's banner shows at
 * once rather than at the next poll.
 */
export const MY_CHAT_TIMEOUT_QUERY_ROOT = "chat-timeout";

/** The code on the API's 403 for a write a timeout refuses. */
export const CHAT_TIMED_OUT_CODE = "chat.timed_out";

/**
 * What a member reads when a send or reaction is refused for a timeout. The
 * API sends it as the 403's message; the clients match the code and show this
 * same sentence, and the composer's banner says until when.
 */
export const CHAT_TIMED_OUT_REFUSAL =
  "You're timed out, so you can't post or react in channels right now.";

export function chatTimeoutDuration(key: string) {
  return CHAT_TIMEOUT_DURATIONS.find((duration) => duration.key === key);
}

/** Whether `until` is a timeout still running at `now`. */
export function isChatTimeoutActive(
  until: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!until) return false;
  const at = Date.parse(until);
  return Number.isFinite(at) && at > now;
}

/**
 * Whether a timeout reaches this channel: every channel but a DM or group
 * DM. A thread is in its channel, so a thread reply counts as the channel.
 */
export function chatTimeoutApplies(channel: { type?: string | null }): boolean {
  return !isDirectChannel({ type: channel.type ?? "" });
}
