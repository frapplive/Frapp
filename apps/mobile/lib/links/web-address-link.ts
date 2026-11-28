import {
  isOnOneOfOrigins,
  phoneAddressFor,
  phoneRowFits,
  webAddressRow,
} from "@repo/validation";
import { webAppOrigin } from "@/lib/onboarding/chapter-wizard/invite-link";
import {
  notificationHref,
  threadTarget,
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
 * page (Backwork, any Chapter settings page but a role's or a tier's) and a
 * path no page owns are not the app's: `null`, so the link stays a web page.
 * So is an address the phone would open without what it points at (a
 * document, a folder, Alumni, a message with no channel): a parameter the
 * chosen screen drops, unless it only picks a less specific screen of the
 * same page (an event link's day) or only places the page on web (the
 * screen's `matches`, such as `tab=roles` in front of a role, #6049).
 * Ids are trimmed, and an empty one counts as absent.
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
  if (!isOnOneOfOrigins(url, origins)) return null;
  const row = webAddressRow(url.pathname);
  if (!row?.phone) return null;
  const query = new URLSearchParams();
  for (const [name, value] of url.searchParams) {
    if (row.params.includes(name) && value.trim()) {
      query.set(name, value.trim());
    }
  }
  const screen = phoneAddressFor(url.pathname, query);
  if (!screen) return null;
  const chosen = row.phone.find(
    (candidate) =>
      candidate.pathname === screen.pathname && phoneRowFits(candidate, query),
  );
  // What the screen reads, and what only placed the page on web (`matches`).
  const kept = new Set([
    ...Object.keys(chosen?.params ?? {}),
    ...Object.keys(chosen?.matches ?? {}),
  ]);
  const context = new Set(
    row.phone
      .slice(chosen ? row.phone.indexOf(chosen) + 1 : 0)
      .flatMap((candidate) => candidate.when ?? []),
  );
  for (const name of query.keys()) {
    if (!kept.has(name) && !context.has(name)) return null;
  }
  const { channelId, threadRootId } = screen.params;
  if (screen.pathname === "/chat-thread" && channelId && threadRootId) {
    return threadTarget(
      channelId,
      threadRootId,
      screen.params.focusMessageId ?? null,
    );
  }
  return {
    pathname: screen.pathname,
    ...(Object.keys(screen.params).length > 0 ? { params: screen.params } : {}),
  };
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
