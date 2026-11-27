import {
  CHAT_LINK_CHANNEL_PARAM,
  CHAT_LINK_MESSAGE_PARAM,
  WEB_ADDRESS_PARAMS,
} from "@repo/validation";

/**
 * The web chat deep-link contract: `/chat?channel=<id>&message=<id>`.
 *
 * Three call sites build links into `/chat` — the notification drawer, the
 * command-palette search results, and `ChatPage`'s own param reader — and
 * they only work if they agree on the query-param names. The names themselves
 * live in `@repo/validation`'s `message-link.ts` (#3723), which the phone's
 * Copy message link builds absolute links from, so a link copied on the phone
 * lands here: rename them there, never by replacing these aliases.
 */
export const CHAT_CHANNEL_PARAM = CHAT_LINK_CHANNEL_PARAM;
export const CHAT_MESSAGE_PARAM = CHAT_LINK_MESSAGE_PARAM;
/** The open thread's root message on `/chat` (#6041). */
export const CHAT_THREAD_PARAM = WEB_ADDRESS_PARAMS.chat.thread;
/**
 * The two kinds of conversation, and the two lists that hold them: the
 * chapter's channels, which live in the sidebar, and the member's direct and
 * group messages, which the Messages page (`/messages`) lists. A link that
 * names a conversation needs to say neither: the shell follows its kind, so a
 * notification for a DM opens on Messages without knowing it is one
 * (`dashboard-shell.tsx`).
 */
export type ChatView = "channels" | "direct";

export interface ChatLinkTarget {
  channelId?: string | null;
  messageId?: string | null;
}

/**
 * Builds a `/chat` URL carrying whichever of `channelId` / `messageId` are
 * present. Neither is required — `chatDeepLink()` is a bare `/chat`, matching
 * every existing caller that has no target to carry.
 */
export function chatDeepLink(target: ChatLinkTarget = {}): string {
  const params = new URLSearchParams();
  if (target.channelId) params.set(CHAT_CHANNEL_PARAM, target.channelId);
  if (target.messageId) params.set(CHAT_MESSAGE_PARAM, target.messageId);
  const query = params.toString();
  return query ? `/chat?${query}` : "/chat";
}
