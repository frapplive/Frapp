import { Alert } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { isOpenableHref } from "@repo/chat-core/links";
import { currentPathname } from "@/lib/current-pathname";
import { webLinkTarget } from "@/lib/links/web-address-link";
import { openNotificationTarget } from "@/lib/notifications/targets";

/** The alert a link that would not open shows. */
export const LINK_OPEN_FAILED_TITLE = "Couldn't open that link";
export const LINK_OPEN_FAILED_BODY =
  "Check the address in the message, or copy it into your browser.";

/**
 * Opens a link a member tapped in a message (#2775).
 *
 * A web page opens in the in-app browser, the same way an attachment does, so
 * the member comes back to the thread with one swipe. A `mailto:` goes to the
 * OS, which hands it to the mail app. The href is re-checked here even though
 * `MessageMarkdown` only draws openable ones as links, because this is the call
 * that hands a member-typed string to the OS. A failure gets an alert: a tap that does
 * nothing reads as a dead link.
 *
 * With `dashboardLinksInApp`, a link to a dashboard address the phone has a screen
 * for opens that screen here in the app rather than the web page in a browser
 * sheet (#6050; `lib/links/web-address-link.ts`): a chat link (Copy message
 * link's, or the web's channel Copy link, #3723) opens its channel on its
 * message, as Discord and Slack open their message links in place, and an
 * event, task or member link opens that record. Only a message body passes it: a
 * proof-link chip sits in a sheet, over which a pushed screen would open out
 * of sight, so its links keep the browser its label promises. Through
 * `openHref`, so a link tapped in an open channel replaces it rather than
 * stacking a second, and a thread opens over its channel.
 */
export async function openMessageLink(
  href: string,
  options: { dashboardLinksInApp?: boolean } = {},
): Promise<void> {
  if (!isOpenableHref(href)) return;
  const target = options.dashboardLinksInApp ? webLinkTarget(href) : null;
  if (target) {
    openNotificationTarget(router, target, currentPathname());
    return;
  }
  try {
    if (href.toLowerCase().startsWith("mailto:")) {
      await Linking.openURL(href);
    } else {
      await WebBrowser.openBrowserAsync(href);
    }
  } catch {
    Alert.alert(LINK_OPEN_FAILED_TITLE, LINK_OPEN_FAILED_BODY);
  }
}
