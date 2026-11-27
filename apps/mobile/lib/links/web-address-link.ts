import { phoneAddressFor } from "@repo/validation";
import { webAppOrigin } from "@/lib/onboarding/chapter-wizard/invite-link";
import {
  notificationHref,
  type NotificationTarget,
} from "@/lib/notifications/targets";

/**
 * A link to the web dashboard, read as the phone screen it opens (#6050).
 *
 * The web gives every screen an address (`spec/ui/web-dashboard/README.md`
 * § Addresses), and `@repo/validation`'s `web-addresses.ts` maps each one to
 * a phone screen. This reads that table, so a link copied on the web opens
 * the same screen here, from a message (`lib/chat/open-link.ts`) or from the
 * system (`app/+native-intent.tsx`), and a rename can't split the two apps.
 *
 * Only this build's own dashboard origin (`webAppOrigin`): on a staging build
 * a production link names records the staging API doesn't have. A web-only
 * page (Backwork, Chapter settings) and a path no page owns are not the
 * app's: `null`, so the link stays a web page.
 *
 * A message thread opens over its channel, as a thread notification does
 * (`under`): the thread screen only listens on its channel's realtime topic,
 * so with nothing under it it would get no live replies (#4054).
 */
export function webLinkTarget(
  raw: string,
  origins: readonly string[] = [webAppOrigin()],
): NotificationTarget | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!sameOriginAsOneOf(url, origins)) return null;
  const screen = phoneAddressFor(url.pathname, url.searchParams);
  if (!screen) return null;
  const target: NotificationTarget = {
    pathname: screen.pathname,
    ...(Object.keys(screen.params).length > 0 ? { params: screen.params } : {}),
  };
  const { channelId, threadRootId } = screen.params;
  if (screen.pathname === "/chat-thread" && channelId && threadRootId) {
    return {
      ...target,
      under: { pathname: "/chat-thread", params: { channelId } },
    };
  }
  return target;
}

/**
 * The path `app/+native-intent.tsx` hands the router for a link the system
 * opened the app with, or `null` when the link isn't a dashboard address.
 *
 * One path, so a thread link opens its channel on the thread's first message
 * rather than the thread alone, which would get no live replies with nothing
 * under it (`webLinkTarget`). The member opens the thread from there.
 */
export function systemPathForWebLink(
  raw: string,
  origins: readonly string[] = [webAppOrigin()],
): string | null {
  const target = webLinkTarget(raw, origins);
  if (!target) return null;
  if (!target.under) return notificationHref(target);
  const threadRootId = target.params?.threadRootId;
  return notificationHref({
    pathname: target.under.pathname,
    params: {
      ...target.under.params,
      ...(threadRootId ? { focusMessageId: threadRootId } : {}),
    },
  });
}

function sameOriginAsOneOf(url: URL, origins: readonly string[]): boolean {
  return origins.some((origin) => {
    try {
      return new URL(origin).origin === url.origin;
    } catch {
      return false;
    }
  });
}
