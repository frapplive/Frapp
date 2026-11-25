import { useMemo, useRef, useState } from "react";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useChannels } from "@repo/hooks";
import {
  BIRTHDAY_POSTS_COPY,
  CHAPTER_TAB_COPY,
  birthdayPostChoices,
  type BirthdayChannelRow,
} from "@repo/hooks/chapter-tab";
import type { PatchChapterConfig } from "@repo/validation";
import { ListRow } from "@/components/list-section";
import { OptionSheet, type SheetOption } from "@/components/option-sheet";
import { CakeGlyph } from "@/components/settings-glyphs";
import { SettingAnchor } from "@/components/settings/setting-anchor";

/**
 * Chapter settings → Birthday posts on the phone (#6027; web's card, #4959):
 * on each member's birthday, for members who share theirs with the chapter,
 * Frapp posts in the channel picked here. The row shows Off or the channel
 * and opens the pick in a sheet (Off, then the chapter's public, live
 * channels: `offersBirthdayPosts`), saved the moment it's picked, as a
 * settings pick is (components.md § Settings rows).
 *
 * A saved channel that can't take the posts now (archived, made private,
 * gone) reads as paused under the row, as on web. A viewer without
 * `chapter-config:manage` reads the value, and the line says an officer sets
 * it.
 */
export function BirthdayPostsRow({
  channelId,
  canManage,
  saving,
  onSave,
  glyphColor,
}: {
  channelId: string | null;
  canManage: boolean;
  saving: boolean;
  onSave: (
    diff: PatchChapterConfig,
    callbacks: { onError: () => void },
  ) => void;
  glyphColor: string;
}) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [failed, setFailed] = useState(false);
  const channelsQuery = useChannels();
  const { loaded, channels, paused, value } = birthdayPostChoices(
    channelsQuery.data as BirthdayChannelRow[] | undefined,
    channelId,
  );
  const options = useMemo<SheetOption[]>(
    () => [
      { value: null, label: BIRTHDAY_POSTS_COPY.off },
      ...channels.map((c) => ({ value: c.id, label: `#${c.name}` })),
      // The paused pick stays listed, so the sheet shows what is saved.
      ...(paused && channelId !== null
        ? [
            {
              value: channelId,
              label: `${value} ${BIRTHDAY_POSTS_COPY.pausedSuffix}`,
            },
          ]
        : []),
    ],
    [channels, paused, channelId, value],
  );

  let description: string | null;
  if (failed) description = BIRTHDAY_POSTS_COPY.saveFailed;
  else if (!canManage) description = CHAPTER_TAB_COPY.rowReadOnly;
  else if (paused) description = BIRTHDAY_POSTS_COPY.paused;
  else if (channelsQuery.isError && !loaded)
    description = BIRTHDAY_POSTS_COPY.loadFailed;
  else description = null;

  const opens = canManage && loaded && !saving;
  // A failed read retries from the row itself: the screen has no pull.
  const retries = canManage && channelsQuery.isError && !loaded;

  return (
    <>
      <SettingAnchor id="birthday-posts">
        <ListRow
          leading={<CakeGlyph color={glyphColor} />}
          label={BIRTHDAY_POSTS_COPY.title}
          value={
            value === null
              ? undefined
              : paused
                ? `${value} ${BIRTHDAY_POSTS_COPY.pausedSuffix}`
                : value
          }
          description={description}
          descriptionTone={failed ? "destructive" : "default"}
          busy={saving}
          accessibilityHint={
            opens
              ? `${BIRTHDAY_POSTS_COPY.hint} Opens the channel choices.`
              : retries
                ? "Loads the channels again."
                : BIRTHDAY_POSTS_COPY.hint
          }
          onPress={
            opens
              ? () => sheetRef.current?.present()
              : retries
                ? () => void channelsQuery.refetch()
                : undefined
          }
        />
      </SettingAnchor>
      {canManage ? (
        <OptionSheet
          ref={sheetRef}
          title={BIRTHDAY_POSTS_COPY.label}
          options={options}
          selected={channelId}
          onSelect={(next) => {
            if (next === channelId) return;
            setFailed(false);
            onSave(
              { birthday_channel_id: next },
              { onError: () => setFailed(true) },
            );
          }}
        />
      ) : null}
    </>
  );
}
