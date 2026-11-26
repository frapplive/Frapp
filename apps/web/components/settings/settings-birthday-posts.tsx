"use client";

import { useChannels } from "@repo/hooks";
import {
  BIRTHDAY_POSTS_COPY,
  birthdayPostChoices,
  type BirthdayChannelRow,
} from "@repo/hooks/chapter-tab";
import { ProfileSection } from "@/components/profile/profile-section";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** The Select's value for "no channel": Radix refuses an empty string. */
const OFF = "off";

/**
 * Settings → Chapter → Birthday posts (#4959). On each member's birthday,
 * for members who share theirs with the chapter, Frapp posts "Happy birthday,
 * Name!" in the channel picked here, the way a Discord birthday bot posts
 * where a server admin points it. Off until an officer picks one.
 */
export function SettingsBirthdayPosts({
  channelId,
  canManage,
  isSaving,
  onChange,
}: {
  channelId: string | null;
  canManage: boolean;
  isSaving: boolean;
  onChange: (channelId: string | null) => void;
}) {
  const channelsQuery = useChannels();
  const { loaded, channels, paused, value } = birthdayPostChoices(
    channelsQuery.data as BirthdayChannelRow[] | undefined,
    channelId,
  );

  return (
    <ProfileSection
      id="settings-birthday-posts"
      title={BIRTHDAY_POSTS_COPY.title}
      hint={BIRTHDAY_POSTS_COPY.hint}
    >
      <div className="grid max-w-sm gap-2">
        <Label htmlFor="birthday-channel">{BIRTHDAY_POSTS_COPY.label}</Label>
        <Select
          value={channelId ?? OFF}
          disabled={!canManage || isSaving || !loaded}
          onValueChange={(next) => onChange(next === OFF ? null : next)}
        >
          <SelectTrigger
            id="birthday-channel"
            aria-describedby="birthday-channel-hint"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={OFF}>{BIRTHDAY_POSTS_COPY.off}</SelectItem>
            {channels.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                #{channel.name}
              </SelectItem>
            ))}
            {paused && channelId !== null ? (
              <SelectItem value={channelId}>
                {value} {BIRTHDAY_POSTS_COPY.pausedSuffix}
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        <p
          id="birthday-channel-hint"
          className="text-caption text-muted-foreground"
        >
          {channelsQuery.isError && !loaded
            ? "Couldn't load the channels. Reload the page to change this."
            : paused
              ? BIRTHDAY_POSTS_COPY.paused
              : canManage
                ? BIRTHDAY_POSTS_COPY.when
                : "Your role can't change this."}
        </p>
      </div>
    </ProfileSection>
  );
}
