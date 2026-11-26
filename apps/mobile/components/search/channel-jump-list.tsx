import { useMemo } from "react";
import { Text, View } from "react-native";
import {
  ALL_GROUP_LIMIT,
  JUMP_MORE_FROM_LETTERS,
  JUMP_RECENT_LABEL,
  JUMP_UNREAD_LABEL,
  SEARCH_MIN_QUERY_LENGTH,
  rankChannelMatches,
  type ChannelJump,
  type JumpChannel,
} from "@repo/hooks";
import { PressableRow } from "@/components/list-section";
import { UnreadBadge } from "@/components/chat/channel-row";
import { createSearchStyles } from "@/components/search/search-styles";
import { useFrappTheme } from "@/lib/theme";

/**
 * Jump to a channel on the phone's Search (#6053), web's Find twin. Before
 * anything is typed it lists the unread channels, then the ones this phone
 * opened lately; with fewer letters than a search needs, the channels they
 * match, at once. The rules are `@repo/hooks` `channel-jump.ts`, one with
 * web; Search draws this above its own recent searches and results.
 *
 * A row reads as its row on Chat home does: `#name`, bold while unread, a
 * count only for a mention, and its category as the hint.
 */
export function ChannelJumpList({
  typed,
  jump,
  onOpen,
  showMoreNote,
}: {
  /** What was typed, trimmed. */
  typed: string;
  jump: ChannelJump;
  onOpen: (channel: JumpChannel) => void;
  /** The line saying a search starts from three letters (not in a council). */
  showMoreNote: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = useMemo(() => createSearchStyles(tokens), [tokens]);

  const groups = useMemo((): { heading: string; rows: JumpChannel[] }[] => {
    if (typed === "") {
      return [
        { heading: JUMP_UNREAD_LABEL, rows: jump.unread },
        { heading: JUMP_RECENT_LABEL, rows: jump.recent },
      ].filter((group) => group.rows.length > 0);
    }
    return [
      {
        heading: "Channels",
        rows: rankChannelMatches(jump.channels, typed, ALL_GROUP_LIMIT * 2),
      },
    ];
  }, [typed, jump]);

  const letters = typed !== "";
  const none = letters && groups[0]!.rows.length === 0;

  return (
    <View testID="channel-jump">
      {none ? (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          No channels match.
        </Text>
      ) : null}
      {groups.map((group) =>
        group.rows.length === 0 ? null : (
          <View key={group.heading}>
            <Text accessibilityRole="header" style={styles.heading}>
              {group.heading}
            </Text>
            {group.rows.map((channel) => {
              const counts = jump.countsFor(channel.id);
              const unread = jump.looksUnread(channel.id);
              const category = jump.categoryOf(channel);
              const mentions = counts?.mentionCount ?? 0;
              return (
                <PressableRow
                  key={`${group.heading}:${channel.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={[
                    `#${channel.name}`,
                    category,
                    mentions > 0
                      ? `${mentions} mention${mentions === 1 ? "" : "s"}`
                      : unread
                        ? "unread"
                        : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  accessibilityHint="Opens the channel."
                  onPress={() => onOpen(channel)}
                  style={styles.row}
                >
                  <Text
                    style={[styles.label, unread ? styles.labelUnread : null]}
                    numberOfLines={1}
                  >
                    #{channel.name}
                  </Text>
                  {category ? (
                    <Text style={styles.hint} numberOfLines={1}>
                      {category}
                    </Text>
                  ) : null}
                  {mentions > 0 && counts ? (
                    <UnreadBadge
                      unreadCount={counts.unreadCount}
                      mentionCount={counts.mentionCount}
                    />
                  ) : null}
                </PressableRow>
              );
            })}
          </View>
        ),
      )}
      {letters && showMoreNote ? (
        <Text style={styles.status}>
          {JUMP_MORE_FROM_LETTERS(SEARCH_MIN_QUERY_LENGTH)}
        </Text>
      ) : null}
    </View>
  );
}
