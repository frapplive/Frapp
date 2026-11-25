import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SignetTokens } from "@repo/theme/signet";
import {
  MARK_AS_READ_LABEL,
  newMessagesCountLabel,
  newMessagesPillLabel,
  type PillDirection,
} from "@repo/hooks";
import { typeRole, useFrappTheme } from "@/lib/theme";

const HEIGHT = 36;

/**
 * The way to a channel's first unread message while its divider is off screen
 * (#6052), as Discord's and Slack's threads draw it: "12 new messages" with an
 * arrow toward the divider, and Mark as read beside it. Centred over the top of
 * the list, so it reserves no height and nothing under it moves; the jump to
 * the newest message keeps the bottom-right corner (`JumpToLatestButton`), so
 * the two never sit on each other. Web's is `components/chat/new-messages-pill.tsx`.
 *
 * The floating control's neutral recipe, as the jump control's: elevated
 * `--popover` with a hairline, `--foreground` text. Unread is neutral
 * (foundations § Where the accent goes), so no accent and no red. 36pt drawn,
 * with `hitSlop` up to the 44pt floor.
 *
 * The caller renders it only while `pillDirection` gives a direction.
 */
export function NewMessagesPill({
  count,
  direction,
  onJump,
  onMarkRead,
}: {
  count: number;
  direction: PillDirection;
  onJump: () => void;
  onMarkRead: () => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const slop = (tokens.touch.minimum - HEIGHT) / 2;
  return (
    <View
      testID="new-messages-pill"
      style={styles.wrap}
      pointerEvents="box-none"
    >
      <View style={styles.pill}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={newMessagesPillLabel(count, direction)}
          hitSlop={{ top: slop, bottom: slop, left: slop }}
          onPress={onJump}
          style={({ pressed }) => [
            styles.part,
            styles.lead,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.count}>{newMessagesCountLabel(count)}</Text>
          <Text style={styles.count}>{direction === "up" ? "↑" : "↓"}</Text>
        </Pressable>
        <View style={styles.rule} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={MARK_AS_READ_LABEL}
          hitSlop={{ top: slop, bottom: slop, right: slop }}
          onPress={onMarkRead}
          style={({ pressed }) => [
            styles.part,
            styles.trail,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.markRead}>{MARK_AS_READ_LABEL}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  const caption = typeRole({
    ...tokens.typography.role.caption,
    weight: tokens.typography.weight.semibold,
  });
  return StyleSheet.create({
    wrap: {
      position: "absolute",
      top: tokens.spacing.sm,
      left: 0,
      right: 0,
      alignItems: "center",
    },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      height: HEIGHT,
      borderRadius: HEIGHT / 2,
      borderWidth: 1,
      borderColor: tokens.color.border.hairline,
      backgroundColor: tokens.color.surface.popover,
    },
    part: {
      height: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
    },
    lead: {
      paddingLeft: tokens.spacing.md,
      paddingRight: tokens.spacing.sm,
      borderTopLeftRadius: HEIGHT / 2,
      borderBottomLeftRadius: HEIGHT / 2,
    },
    trail: {
      paddingLeft: tokens.spacing.sm,
      paddingRight: tokens.spacing.md,
      borderTopRightRadius: HEIGHT / 2,
      borderBottomRightRadius: HEIGHT / 2,
    },
    pressed: {
      opacity: 0.7,
    },
    rule: {
      width: StyleSheet.hairlineWidth,
      height: HEIGHT / 2,
      backgroundColor: tokens.color.border.hairline,
    },
    count: {
      ...caption,
      color: tokens.color.text.foreground,
    },
    markRead: {
      ...caption,
      color: tokens.color.text.mutedForeground,
    },
  });
}
