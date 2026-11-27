import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SignetTokens } from "@repo/theme/signet";
import { CALENDAR_KIND_HUE } from "@repo/hooks/activity-agenda";
import { CALENDAR_KINDS, type CalendarKind } from "@repo/hooks/calendar-tasks";
import { selectionHaptic } from "@/lib/haptics";
import { fontFamilyFor, typeRole, useFrappTheme } from "@/lib/theme";

/**
 * The Calendar's colour key (#5948), the phone's twin of web's
 * (`apps/web/components/events/events-navigator.tsx` `KindKey`): Events,
 * Tasks and Birthdays as plain words, each led by its swatch, under the
 * month. A tap switches the kind on or off, remembered per member
 * (`useHiddenCalendarKinds`). Off, the swatch goes hollow and the word is
 * struck through. Tasks start off (Paul's decision 1 on #5943: the Calendar
 * is the chapter's; a member's own tasks live in Activity).
 *
 * A legend, not a switcher: no box, no fill, nothing selected-looking (Paul,
 * decision 5 on #5943; the chips #5310 removed were filled pills).
 */
export function CalendarKey({
  hidden,
  onToggle,
}: {
  hidden: ReadonlySet<CalendarKind>;
  onToggle: (kind: CalendarKind) => void;
}) {
  const { tokens } = useFrappTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Show on Calendar"
      style={styles.row}
    >
      {CALENDAR_KINDS.map(({ value, label }) => {
        const on = !hidden.has(value);
        const hue = CALENDAR_KIND_HUE[value];
        return (
          <Pressable
            key={value}
            testID={`calendar-key-${value}`}
            accessibilityRole="switch"
            accessibilityLabel={label}
            accessibilityState={{ checked: on }}
            onPress={() => {
              selectionHaptic();
              onToggle(value);
            }}
            hitSlop={8}
            style={styles.item}
          >
            <View
              style={[
                styles.swatch,
                value === "tasks" ? styles.round : null,
                on
                  ? { backgroundColor: hue }
                  : { borderWidth: 1.5, borderColor: hue },
              ]}
            />
            <Text style={[styles.label, on ? null : styles.off]}>{label}</Text>
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
      columnGap: tokens.spacing.lg,
    },
    item: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    swatch: { width: 10, height: 10, borderRadius: 2 },
    round: { borderRadius: 5 },
    label: {
      ...typeRole(tokens.typography.role.caption),
      fontFamily: fontFamilyFor(600),
      color: tokens.color.text.foreground,
    },
    off: {
      color: tokens.color.text.mutedForeground,
      textDecorationLine: "line-through",
    },
  });
}
