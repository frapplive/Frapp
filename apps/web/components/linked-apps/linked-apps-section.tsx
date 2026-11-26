"use client";

import type { ReactNode } from "react";
import { useCurrentChapter } from "@repo/hooks";
import { personalSettingsGroupLabel } from "@repo/validation";
import { SettingsGroup } from "@/components/shared/settings-row";
import { CalendarAppsRow } from "@/components/linked-apps/calendar-apps-row";
import { DiscordRow } from "@/components/linked-apps/discord-row";
import { GoogleCalendarRow } from "@/components/linked-apps/google-calendar-row";
import { useGoogleCalendarReturn } from "@/lib/events/google-calendar-connect";

/**
 * Settings → Linked apps (`/preferences?section=apps`, #5407): every outside
 * account tied to Frapp, one row each with its state drawn (a green check, a
 * greyed row, or red when it expired).
 *
 * Shaped after the lists members already know: Discord's User Settings →
 * Connections and Slack's and Notion's connected apps. One group, the apps
 * linked in this chapter (Google Calendar writes this chapter's events, the
 * calendar link carries them, the Discord link attributes this chapter's
 * import), in the phone's order. The ways the account signs in moved to
 * Account (#6032), as Google Account keeps "Ways you sign in" with the
 * account. A future integration is one more row.
 *
 * Google's and Discord's sign-ins both come back here and finish on arrival,
 * so the member sees the row they pressed turn green.
 */
export function LinkedAppsSection() {
  useGoogleCalendarReturn();
  const { data: chapter } = useCurrentChapter();

  return (
    <section id="linked-apps" className="scroll-mt-16">
      <LinkedGroup
        heading={personalSettingsGroupLabel("chapter", chapter?.name)}
      >
        <GoogleCalendarRow webReturn="linked_apps" />
        <CalendarAppsRow />
        <DiscordRow />
      </LinkedGroup>
    </section>
  );
}

/**
 * A group of linked-app rows, hidden while no row in it is drawn (an app the
 * server doesn't offer draws none), so a group never stands as a bare
 * heading. Account's Sign in group is one too.
 */
export function LinkedGroup({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="hidden has-[li]:block">
      <SettingsGroup heading={heading}>{children}</SettingsGroup>
    </div>
  );
}
