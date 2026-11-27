import { Pressable, StyleSheet, Text, View } from "react-native";
import { SignetTokens } from "@repo/theme/signet";
import { CALENDAR_KINDS, type CalendarKind } from "@repo/hooks/calendar-tasks";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * The Calendar's key (#5948), one line under the month: Events, Tasks and
 * Birthdays, each with how many the month on screen holds, and each a toggle
 * that shows or hides its kind on the month and its Day screen. Tasks start
 * off (`DEFAULT_HIDDEN_CALENDAR_KINDS`): the Calendar is the chapter's, and
 * a member's tasks live on Activity, so the key is how a member who wants
 * them on the month turns them on. The choice is kept per member
 * (`useHiddenCalendarKinds`).
 *
 * Web's colour key in words and behaviour (`KindKey` in
 * `apps/web/components/events/events-navigator.tsx`): off, the name is struck
 * through and greys, and the count stays, so a hidden kind still says what it
 * holds back. No swatch, because the phone's month marks kinds by place, not
 * hue (a birthday in the accent, tasks as a count under the titles).
 *
 * The four chips #5310 removed switched layers apart (My tasks, Assigned by
 * me); this switches whole kinds, as web's has since #5560.
 */
export function CalendarKindKey({
  hidden,
  counts,
  onToggle,
}: {
  hidden: ReadonlySet<CalendarKind>;
  counts: Record<CalendarKind, number>;
  onToggle: (kind: CalendarKind) => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Show on Calendar"
      style={styles.row}
    >
      {CALENDAR_KINDS.map(({ value, label }) => {
        const on = !hidden.has(value);
        return (
          <Pressable
            key={value}
            testID={`calendar-key-${value}`}
            accessibilityRole="switch"
            accessibilityLabel={`${label}, ${counts[value]}`}
            accessibilityState={{ checked: on }}
            onPress={() => onToggle(value)}
            hitSlop={4}
            style={({ pressed }) => [
              styles.item,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.label, on ? null : styles.off]}>{label}</Text>
            <Text style={styles.count}>{counts[value]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: tokens.spacing.xs,
    },
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: tokens.touch.minimum,
      paddingHorizontal: tokens.spacing.sm,
      borderRadius: 8,
    },
    pressed: {
      backgroundColor: tokens.color.surface.card,
    },
    label: {
      ...typeRole({
        ...tokens.typography.role.caption,
        weight: tokens.typography.weight.semibold,
      }),
      color: tokens.color.text.foreground,
    },
    off: {
      color: tokens.color.text.mutedForeground,
      textDecorationLine: "line-through",
    },
    count: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
      fontVariant: ["tabular-nums"],
    },
  });
}
