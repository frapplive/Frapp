import { useChannels } from "@repo/hooks";
import {
  ANNOUNCEMENTS_CHANNEL_COPY,
  isAnnouncementChannel,
} from "@repo/validation";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";
import { HashGlyph } from "@/components/settings-glyphs";
import { useFrappTheme } from "@/lib/theme";

type ChannelRow = {
  id: string;
  name: string;
  type: string;
  is_read_only?: boolean | null;
};

/**
 * Announcements' one group on the phone (#6030), web's
 * `AnnouncementsChannelGroup`: the chapter's announcements channel, found the
 * way `/announce` and the push worker find it (`isAnnouncementChannel`),
 * where who can post in it is set. Only for a viewer who can open channel
 * settings (`channels:manage`); a chapter with no such channel gets no row.
 *
 * Read-only until the phone's channel settings screen lands (#6112): on
 * `main` its route is still a placeholder that goes back to Chat home, so a
 * press there would be a dead end. Once it lands, this row pushes
 * `/channel-settings?channelId=`, as web's opens the channel's settings.
 */
export function AnnouncementsChannelSection({ canOpen }: { canOpen: boolean }) {
  const { tokens } = useFrappTheme();
  const channelsQuery = useChannels();
  if (!canOpen) return null;
  const rows = Array.isArray(channelsQuery.data)
    ? (channelsQuery.data as ChannelRow[])
    : [];
  const channel = rows.find((candidate) =>
    isAnnouncementChannel({
      name: candidate.name,
      type: candidate.type,
      is_read_only: candidate.is_read_only ?? null,
    }),
  );
  if (!channel) return null;
  return (
    <>
      <SectionHeader>{ANNOUNCEMENTS_CHANNEL_COPY.heading}</SectionHeader>
      <ListSection footnote={ANNOUNCEMENTS_CHANNEL_COPY.footnote}>
        <ListRow
          leading={<HashGlyph color={tokens.color.text.mutedForeground} />}
          label={ANNOUNCEMENTS_CHANNEL_COPY.label}
          value={`#${channel.name}`}
        />
      </ListSection>
    </>
  );
}
