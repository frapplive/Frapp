import { Pressable, StyleSheet, Text, View } from "react-native";
import { SignetTokens } from "@repo/theme/signet";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * A small segmented control: two to four short answers inside a form, one
 * held, every choice in view (`spec/ui/design-system/components.md` §
 * Segmented control). For a choice a form row sets in one tap, where a menu
 * would hide the current answer behind a press.
 *
 * **Neutral since 2026-11-24.** The held segment is the card step with a quiet
 * edge and foreground text, and the control never changes size between states
 * (P4). It was the chapter accent as a tint until Paul's ruling on the control
 * ("too intrusive, draw attention"): the accent stays on what commits.
 *
 * **Only for a short pick inside a form.** It never changes a screen's or a
 * list's view: that is `ViewLabels` (`components/view-labels.tsx`).
 *
 * `quiet` holds the answer with the edge alone, no fill, for a row whose
 * answer only follows a default set elsewhere (Who's coming's roles that
 * follow "Everyone else"), so the rows that were set apart are the ones raised.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
  quiet = false,
  dense = false,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  quiet?: boolean;
  /** Tighter segment padding, for a row that sets the control beside a name. */
  dense?: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={styles.track}
    >
      {options.map((option) => {
        const held = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: held, disabled }}
            disabled={disabled}
            onPress={() => {
              if (!held) onChange(option.value);
            }}
            hitSlop={{ top: 6, bottom: 6 }}
            style={[
              styles.segment,
              dense ? styles.dense : null,
              held ? (quiet ? styles.quietHeld : styles.held) : null,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.label, held ? styles.heldLabel : null]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    track: {
      flexDirection: "row",
      gap: 2,
      padding: 2,
      borderRadius: tokens.radius.chip,
      backgroundColor: tokens.color.surface.surface1,
      borderWidth: 1,
      borderColor: tokens.color.border.control,
    },
    segment: {
      flex: 1,
      minHeight: 32,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.sm,
      borderRadius: tokens.radius.chip,
      borderWidth: 1,
      borderColor: "transparent",
    },
    label: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.muted,
    },
    // Each segment takes its label's width plus an equal share of the rest,
    // so the longest answer ("Not invited") is never cut short.
    dense: {
      flexBasis: "auto",
      paddingHorizontal: tokens.spacing.xs,
    },
    held: {
      backgroundColor: tokens.color.surface.card,
      borderColor: tokens.color.border.hairline,
    },
    quietHeld: {
      borderColor: tokens.color.border.hairline,
    },
    heldLabel: {
      color: tokens.color.text.foreground,
    },
  });
}
