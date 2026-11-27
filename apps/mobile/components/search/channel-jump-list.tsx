import { useMemo } from "react";
import { Text, View } from "react-native";
import {
  ALL_GROUP_LIMIT,
  JUMP_MORE_FROM_LETTERS,
  JUMP_NOTHING_YET,
  JUMP_RECENT_LABEL,
  JUMP_UNREAD_LABEL,
  SEARCH_MIN_QUERY_LENGTH,
  rankChannelMatches,
  type ChannelJump,
  type JumpChannel,
} from "@repo/hooks";
import { PressableRow } from "@/components/list-section";
import {
  UnreadBadge,
  accessibilityLabelFor,
} from "@/components/chat/channel-row";
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
  letters,
  jump,
  onOpen,
  showMoreNote,
}: {
  /** The letters to match (`jumpModeOf`), or "" for the lists. */
  letters: string;
  jump: ChannelJump;
  onOpen: (channel: JumpChannel) => void;
  /** The line saying a search starts from three letters (not in a council). */
  showMoreNote: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = useMemo(() => createSearchStyles(tokens), [tokens]);

  const groups = useMemo((): { heading: string; rows: JumpChannel[] }[] => {
    if (letters === "") {
      return [
        { heading: JUMP_UNREAD_LABEL, rows: jump.unread },
        { heading: JUMP_RECENT_LABEL, rows: jump.recent },
      ].filter((group) => group.rows.length > 0);
    }
    return [
      {
        heading: "Channels",
        rows: rankChannelMatches(jump.channels, letters, ALL_GROUP_LIMIT * 2),
      },
    ];
  }, [letters, jump]);

  const typed = letters !== "";
  const none = typed && groups[0]!.rows.length === 0;
  // Nothing unread and nothing opened lately, said only once the counts
  // are known: unknown is not "nothing unread".
  const nothingYet = !typed && groups.length === 0 && jump.countsKnown;

  return (
    <View testID="channel-jump">
      {none ? (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          No channels match.
        </Text>
      ) : null}
      {nothingYet ? (
        <Text style={styles.status}>{JUMP_NOTHING_YET}</Text>
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
                  // Chat home's own words for the row, then its category.
                  accessibilityLabel={[
                    accessibilityLabelFor({
                      name: channel.name,
                      isDirect: false,
                      restriction:
                        channel.type === "PRIVATE"
                          ? "private"
                          : channel.type === "ROLE_GATED"
                            ? "role-gated"
                            : null,
                      unreadCount: counts?.unreadCount ?? 0,
                      mentionCount: counts?.mentionCount ?? 0,
                      isMuted: jump.isMuted(channel.id),
                    }),
                    category,
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
      {typed && showMoreNote ? (
        <Text style={styles.status}>
          {JUMP_MORE_FROM_LETTERS(SEARCH_MIN_QUERY_LENGTH)}
        </Text>
      ) : null}
    </View>
  );
}
