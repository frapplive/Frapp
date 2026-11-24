import { Pressable, StyleSheet, Text, View } from "react-native";
import { SignetTokens } from "@repo/theme/signet";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * A screen's or a list's views as plain words
 * (`spec/ui/design-system/components.md` § View labels): the one you are on in
 * the foreground colour at 600, the others muted at 400. No box, no fill, no
 * accent. Web's twin is `apps/web/components/shared/view-labels.tsx`.
 *
 * Paul, 2026-11-24, on the boxed switch this replaces: "I want to never see
 * one of these switcher things ... too intrusive, draw attention". Threads
 * draws For you and Following this way.
 *
 * **One view draws nothing**: a lone word beside a title is a control that
 * does nothing.
 *
 * **Nothing moves when the pick changes.** Semibold is wider than regular, so
 * each label holds its semibold width with an unseen copy and draws the word
 * over it (P4).
 *
 * In a screen header, pass the views to `ScreenShell` as `views`: it seats
 * them on the title's baseline after a hairline. Anywhere else (a section's
 * head, a sheet's first line) render this; `compact` is the 14pt step for a
 * line that shares its row with a caption.
 */
export interface ViewOption<T extends string> {
  value: T;
  label: string;
}

export function ViewLabels<T extends string>({
  accessibilityLabel,
  options,
  value,
  onChange,
  compact = false,
  flush = false,
}: {
  /** What the views are views of, for a screen reader: "Show". */
  accessibilityLabel: string;
  options: readonly ViewOption<T>[];
  value: T;
  onChange: (next: T) => void;
  compact?: boolean;
  /**
   * For views that start a line: lines the first word's text up with the
   * line's left edge, which the label's padding would otherwise indent.
   */
  flush?: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  if (options.length < 2) return null;
  const held = compact ? styles.heldCompact : styles.held;
  const rest = compact ? styles.restCompact : styles.rest;
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.row, flush ? styles.flush : null]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            // 36 drawn plus 4 above and below is the 44pt touch floor; 4
            // either side takes a three-letter word ("All") to it too.
            hitSlop={LABEL_HIT_SLOP}
            style={({ pressed }) => [
              styles.label,
              pressed && !selected ? styles.pressed : null,
            ]}
          >
            <View>
              {/* The semibold width, held whether or not it is picked. */}
              <Text
                accessible={false}
                importantForAccessibility="no"
                numberOfLines={1}
                style={[held, styles.unseen]}
              >
                {option.label}
              </Text>
              <Text
                numberOfLines={1}
                style={[selected ? held : rest, styles.word]}
              >
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const LABEL_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 } as const;

function createStyles(tokens: SignetTokens) {
  const { body, label } = tokens.typography.role;
  const { regular, semibold } = tokens.typography.weight;
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      flexShrink: 0,
    },
    // 8 either side puts 16 between two words.
    label: {
      minHeight: 36,
      paddingHorizontal: tokens.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    flush: { marginLeft: -tokens.spacing.sm },
    pressed: { opacity: 0.6 },
    held: {
      ...typeRole({ ...body, weight: semibold }),
      color: tokens.color.text.foreground,
    },
    rest: {
      ...typeRole(body),
      color: tokens.color.text.muted,
    },
    heldCompact: {
      ...typeRole(label),
      color: tokens.color.text.foreground,
    },
    restCompact: {
      ...typeRole({ ...label, weight: regular }),
      color: tokens.color.text.muted,
    },
    unseen: { opacity: 0 },
    word: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      textAlign: "center",
    },
  });
}
