import {
  askSourceTarget,
  type AskSource,
  WEB_ADDRESS_PARAMS,
} from "@repo/validation";
import { chatDeepLink } from "@/lib/chat/chat-links";
import {
  POINTS_STANDINGS_HREF,
  standingHref,
} from "@/components/standing/standing-doors";

/** `/documents?document=<id>` opens that file in the viewer (`documents-page.tsx`). */
export const DOCUMENT_LINK_PARAM = WEB_ADDRESS_PARAMS.documents.document;

/** The dashboard route each live-data source opens. Dues has no web page in the beta. */
const PAGE_ROUTES: Record<string, string | null> = {
  members: "/members",
  events: "/events",
  // "How many points do I have" cites the member's own points; "who leads"
  // cites the standings, which live in the Directory (#5950).
  points: standingHref("points"),
  standings: POINTS_STANDINGS_HREF,
  dues: null,
  // The member's tasks are Activity's since the Tasks page folded in (#5948).
  tasks: "/activity",
};

/**
 * Where a source opens on web, or null when this build has no page for it:
 * the document in the viewer, the meeting's minutes, the message in its
 * channel, or the page the live data came from. A source with no link is
 * still shown, as plain text (`ask.ts`: kinds and targets are open strings).
 */
export function askSourceHref(source: AskSource): string | null {
  const target = askSourceTarget(source);
  if (!target) return null;
  switch (target.type) {
    case "document":
      return `/documents?${DOCUMENT_LINK_PARAM}=${encodeURIComponent(target.document_id)}`;
    case "meeting":
      return `/meetings/${encodeURIComponent(target.meeting_id)}`;
    case "message":
      return chatDeepLink({
        channelId: target.channel_id,
        messageId: target.message_id,
      });
    case "page":
      return PAGE_ROUTES[target.page] ?? null;
    // Not a page: a tap downloads the file (`askSourceBackworkId`).
    case "backwork":
      return null;
  }
}

/**
 * The backwork file a source is, or null (#5209). A tap downloads it through
 * a link fetched at that moment (`use-ask-backwork-download.ts`), so it is a
 * button, not a link.
 */
export function askSourceBackworkId(source: AskSource): string | null {
  const target = askSourceTarget(source);
  return target?.type === "backwork" ? target.backwork_id : null;
}

/**
 * Whether the source is a chat message. Following one moves the thread under
 * the Ask card instead of opening a page beside it, so the card has to get
 * out of the way (`ask-card.tsx`).
 */
export function askSourceIsMessage(source: AskSource): boolean {
  return askSourceTarget(source)?.type === "message";
}
