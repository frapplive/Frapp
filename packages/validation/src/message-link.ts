
/**
 * A message's link (#3723): `https://app.frapp.live/chat?channel=…&message=…`.
 *
 * Copy message link on the phone's long-press sheet copies it, as Discord's
 * and Slack's do. The web's chat panel opens the shape (it is how a
 * notification or a search hit lands on a message), and the phone reads it
 * through the shared address table (`./web-addresses`, #6050), tapped inside
 * a message or handed over by the system. The app doesn't claim `/chat` as a
 * universal link yet: when it does is #6185.
 *
 * The parameter names live here: the phone mints and reads the link, and the
 * web's `chatDeepLink` (`apps/web/lib/chat/chat-links.ts`), which builds the
 * dashboard's own relative `/chat` links, reads its names from here too.
 */

/** The path the web serves a message's link on. Not claimed by the app yet (#6185). */
export const CHAT_LINK_PATH = "/chat";
export const CHAT_LINK_CHANNEL_PARAM = "channel";
export const CHAT_LINK_MESSAGE_PARAM = "message";

/** What a message link names. */
export interface MessageLinkTarget {
  channelId: string;
  messageId: string;
}

/** A message's link, on the dashboard origin the caller is built for. */
export function messageLinkUrl(
  origin: string,
  target: MessageLinkTarget,
): string {
  const base = origin.trim().replace(/\/+$/, "");
  return (
    `${base}${CHAT_LINK_PATH}` +
    `?${CHAT_LINK_CHANNEL_PARAM}=${encodeURIComponent(target.channelId)}` +
    `&${CHAT_LINK_MESSAGE_PARAM}=${encodeURIComponent(target.messageId)}`
  );
}
