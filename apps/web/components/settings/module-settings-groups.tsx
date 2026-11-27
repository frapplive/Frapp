"use client";

import {
  BookOpen,
  FileDown,
  Hash,
  History,
  Import,
  MapPin,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import { useChannels } from "@repo/hooks";
import {
  ANNOUNCEMENTS_CHANNEL_COPY,
  isAnnouncementChannel,
} from "@repo/validation";
import { type SettingsTool } from "@/components/settings/settings-access";
import { channelSettingsPath } from "@/components/settings/settings-paths";
import { SettingsGroup, SettingsRow } from "@/components/shared/settings-row";
import { asArray } from "@/lib/utils";

/** Each officer tool's glyph on its module page's row. */
const TOOL_ICONS: Readonly<Record<string, LucideIcon>> = {
  "chat-admin": MessagesSquare,
  "discord-import": Import,
  "points-ledger": BookOpen,
  "service-history": History,
  "study-zones": MapPin,
  reports: FileDown,
};

/**
 * A module page's Tools group (#6030): a row per officer tool the viewer
 * holds that lives on this module, opening it in place of the page with a way
 * back. Before, the tool's whole body was drawn on the page, so a ledger that
 * keeps growing pushed the rules and Who can out of reach (#5950).
 */
export function ModuleToolsGroup({
  tools,
  hrefOf,
}: {
  tools: readonly SettingsTool[];
  /** Where a tool's row goes: its page on this module page, or its own. */
  hrefOf: (tool: SettingsTool) => string;
}) {
  if (tools.length === 0) return null;
  return (
    <SettingsGroup heading="Tools">
      {tools.map((tool) => (
        <SettingsRow
          key={tool.id}
          id={`module-row-${tool.id}`}
          icon={TOOL_ICONS[tool.id]}
          label={tool.rowLabel ?? tool.label}
          href={hrefOf(tool)}
        />
      ))}
    </SettingsGroup>
  );
}

/**
 * Announcements' one row (#6030): the chapter's announcements channel, found
 * the way `/announce` and the push worker find it (`isAnnouncementChannel`),
 * opening that channel's settings, where who can post in it is set since
 * #3722 retired `announcements:post`. Only for a viewer who can open channel
 * settings (Chat admin); a chapter with no such channel gets no row.
 */
export function AnnouncementsChannelGroup({
  canOpen,
}: {
  /** Whether the viewer holds Chat admin, which channel settings need. */
  canOpen: boolean;
}) {
  const channelsQuery = useChannels();
  if (!canOpen) return null;
  const channel = asArray<{
    id: string;
    name: string;
    type: string;
    is_read_only?: boolean | null;
  }>(channelsQuery.data).find((candidate) =>
    isAnnouncementChannel({
      name: candidate.name,
      type: candidate.type,
      is_read_only: candidate.is_read_only ?? null,
    }),
  );
  if (!channel) return null;
  return (
    <SettingsGroup
      heading={ANNOUNCEMENTS_CHANNEL_COPY.heading}
      footnote={ANNOUNCEMENTS_CHANNEL_COPY.footnote}
    >
      <SettingsRow
        icon={Hash}
        label={ANNOUNCEMENTS_CHANNEL_COPY.label}
        value={`#${channel.name}`}
        href={channelSettingsPath(channel.id)}
      />
    </SettingsGroup>
  );
}
