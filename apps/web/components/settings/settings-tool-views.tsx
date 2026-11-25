"use client";

import {
  CHAT_REPORTS_NOTIFICATION_SCREEN,
  DISCORD_IMPORT_NOTIFICATION_SCREEN,
} from "@repo/hooks";
import { StudyZonesManager } from "@/components/geofences/study-zones-manager";
import {
  ChatAdminPage,
  ChatSettingsSubpage,
} from "@/components/chat-admin/chat-admin-page";
import { ChannelSettingsPage } from "@/components/chat-admin/channel-settings-page";
import { DiscordImportPage } from "@/components/discord-import/discord-import-page";
import { PointsLedger } from "@/components/points/points-ledger";
import { ReportsPage } from "@/components/reports/reports-page";
import { ServiceHistory } from "@/components/service/service-history";
import { SettingsSubpage as SubpageFrame } from "@/components/settings/settings-subpage";
import { useSearchParams } from "next/navigation";
import {
  CHAT_SETTINGS_PATH,
  LEDGER_MEMBER_PARAM,
  type SettingsSubpage,
} from "@/components/settings/settings-paths";
import { MarkScreensSeen } from "@/lib/notifications/mark-screens-seen";

/**
 * The officer tools as Chapter settings draws them (#3837), kept out of
 * `settings-page.tsx` so its tests can stand them in without mocking every
 * read each tool makes.
 */

/**
 * The tool a module page draws as its own body: Study zones' zone list,
 * Chat's channels and report queue, the Reports form, the points ledger, the
 * chapter's service history. Only for a viewer who
 * holds it (`holdsTool` takes a `SETTINGS_TOOLS` id); the tool's row is not
 * on the page's Tools list either way (`embedded`).
 */
export function SettingsToolBody({
  moduleKey,
  holdsTool,
}: {
  moduleKey: string;
  holdsTool: (toolId: string) => boolean;
}) {
  // `?member=`: the member the points ledger opens on (a card's Ledger link).
  const ledgerMember = useSearchParams().get(LEDGER_MEMBER_PARAM);
  if (moduleKey === "points" && holdsTool("points-ledger")) {
    // Keyed by the member, so a second card's Ledger link starts from that
    // member's filter rather than the last one's.
    return (
      <PointsLedger key={ledgerMember ?? "all"} initialMember={ledgerMember} />
    );
  }
  if (moduleKey === "hours" && holdsTool("service-history")) {
    return <ServiceHistory />;
  }
  if (moduleKey === "geofences" && holdsTool("study-zones")) {
    return <StudyZonesManager />;
  }
  if (moduleKey === "chat" && holdsTool("chat-admin")) {
    return <ChatAdminPage holdsDiscordImport={holdsTool("discord-import")} />;
  }
  if (moduleKey === "reports" && holdsTool("reports")) return <ReportsPage />;
  return null;
}

/** A page drawn in place of a module page (`settingsSubpageFor`). */
export function SettingsToolSubpage({ subpage }: { subpage: SettingsSubpage }) {
  if (subpage.kind === "channel") {
    return (
      <>
        {subpage.page === "reports" ? (
          // Opening a channel's reports reads the new-report notices.
          <MarkScreensSeen screens={[CHAT_REPORTS_NOTIFICATION_SCREEN]} />
        ) : null}
        {/*
          Keyed by channel, so opening another channel's settings starts from
          that channel's row rather than the last one's drafts. Not by page:
          an access list half-made on its page survives going back.
        */}
        <ChannelSettingsPage
          key={subpage.channelId}
          channelId={subpage.channelId}
          page={subpage.page}
        />
      </>
    );
  }
  if (subpage.kind === "chat-page") {
    return <ChatSettingsSubpage page={subpage.page} />;
  }
  return (
    <SubpageFrame
      backHref={CHAT_SETTINGS_PATH}
      backLabel="Chat"
      title="Discord import"
    >
      {/* Opening the import reads its finished-or-failed notice. */}
      <MarkScreensSeen screens={[DISCORD_IMPORT_NOTIFICATION_SCREEN]} />
      <DiscordImportPage />
    </SubpageFrame>
  );
}
