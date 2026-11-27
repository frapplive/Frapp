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
import { useSearchParams } from "next/navigation";
import {
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
 * An officer tool's page, opened from its row on its module page (`?page=`,
 * #6030): Chat admin's channels and report queue, the points ledger, the
 * chapter's service history, Study zones' zone list, the Reports form. The
 * module page draws the frame and the way back; this is the body. Only for a
 * tool the viewer holds (`SETTINGS_TOOLS` id), which the row's own gate
 * already checked.
 */
export function SettingsToolPage({ toolId }: { toolId: string }) {
  // `?member=`: the member the points ledger opens on (a card's Ledger link).
  const ledgerMember = useSearchParams().get(LEDGER_MEMBER_PARAM);
  switch (toolId) {
    case "points-ledger":
      // Keyed by the member, so a second card's Ledger link starts from that
      // member's filter rather than the last one's.
      return (
        <PointsLedger
          key={ledgerMember ?? "all"}
          initialMember={ledgerMember}
        />
      );
    case "service-history":
      return <ServiceHistory />;
    case "study-zones":
      return <StudyZonesManager />;
    case "chat-admin":
      // The report queue is a page of its own (`?page=reports`), which reads
      // the new-report notices when it opens.
      return <ChatAdminPage />;
    case "reports":
      return <ReportsPage />;
    default:
      return null;
  }
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
  // The import draws its own frame, so its header can say its state.
  return (
    <>
      {/* Opening the import reads its finished-or-failed notice. */}
      <MarkScreensSeen screens={[DISCORD_IMPORT_NOTIFICATION_SCREEN]} />
      <DiscordImportPage page={subpage.page} />
    </>
  );
}
