import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SignetTokens } from "@repo/theme/signet";
import {
  NEW_UNREADS_LABEL,
  unreadJumpLabel,
  type UnreadJumpSide,
} from "@repo/hooks";
import { typeRole, useFrappTheme } from "@/lib/theme";

const HEIGHT = 28;

/**
 * Chat home's "New unreads" pill (#6045, Winston 2026-11-25), over the list's
 * top or bottom edge while an unread channel is scrolled out of view that
 * way, as Discord's "NEW UNREADS" bar and Slack's "Unread messages" pill
 * float over theirs. A press scrolls to the nearest one; it doesn't open it.
 * The phone face of web's `components/chat/unread-jump-pill.tsx`, with the
 * same words and the same two looks.
 *
 * The neutral recipe a floating control takes (elevated `--popover` with a
 * hairline, as Jump to latest), and the mention red when anything out of view
 * that way addresses the member, the one thing that red means. Drawn 28pt
 * with `hitSlop` up to the 44pt floor. The caller places it (`style`) over
 * the screen, outside the scroll view, so no row under it moves.
 */
export function UnreadJumpPill({
  direction,
  side,
  onPress,
  style,
}: {
  direction: "above" | "below";
  side: UnreadJumpSide;
  onPress: () => void;
  style: { top: number } | { bottom: number };
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  return (
    <View pointerEvents="box-none" style={[styles.band, style]}>
      <Pressable
        testID={`unread-jump-${direction}`}
        accessibilityRole="button"
        accessibilityLabel={unreadJumpLabel(direction)}
        hitSlop={(tokens.touch.minimum - HEIGHT) / 2}
        onPress={onPress}
        style={({ pressed }) => [
          styles.pill,
          side.addressed ? styles.pillAddressed : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text
          style={[styles.label, side.addressed ? styles.labelAddressed : null]}
        >
          {direction === "above" ? "↑" : "↓"} {NEW_UNREADS_LABEL}
        </Text>
      </Pressable>
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    band: {
      position: "absolute",
      left: 0,
      right: 0,
      alignItems: "center",
    },
    pill: {
      height: HEIGHT,
      borderRadius: HEIGHT / 2,
      paddingHorizontal: tokens.spacing.md,
      borderWidth: 1,
      borderColor: tokens.color.border.hairline,
      backgroundColor: tokens.color.surface.popover,
      alignItems: "center",
      justifyContent: "center",
    },
    pillAddressed: {
      borderColor: tokens.color.semantic.mention,
      backgroundColor: tokens.color.semantic.mention,
    },
    pressed: {
      opacity: 0.7,
    },
    label: {
      ...typeRole({
        ...tokens.typography.role.caption,
        weight: tokens.typography.weight.semibold,
      }),
      color: tokens.color.text.foreground,
    },
    labelAddressed: {
      color: tokens.color.semantic.mentionForeground,
    },
  });
}
