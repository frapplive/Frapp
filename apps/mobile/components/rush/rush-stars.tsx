import { Pressable, StyleSheet, View } from "react-native";
import { RUSH_RATING_MAX, RUSH_RATING_MIN } from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { StarGlyph } from "@/components/documents/document-glyphs";
import { useChapterBranding } from "@/lib/chapter-branding";
import { useFrappTheme } from "@/lib/theme";

/** Each star as drawn; the 44pt touch floor comes from its slop. */
const STAR_SIZE = 28;

const STARS = Array.from(
  { length: RUSH_RATING_MAX - RUSH_RATING_MIN + 1 },
  (_, index) => RUSH_RATING_MIN + index,
);

/**
 * The viewer's own fit rating, 1 to 5 stars (#5924, `rush.md` § Ratings), as
 * ChapterBuilder and the App Store's own rating rows draw it: tap a star to
 * rate, tap another to change it. Filled stars are the chapter's accent, the
 * colour a control takes while it is on. A screen reader hears one group,
 * "Your rating", and each star as "3 stars", selected on the current one.
 */
export function RushStars({
  value,
  onRate,
  disabled = false,
}: {
  value: number | null;
  onRate: (rating: number) => void;
  disabled?: boolean;
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens);
  const slop = (tokens.touch.minimum - STAR_SIZE) / 2;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Your rating"
      style={styles.row}
    >
      {STARS.map((star) => {
        const on = value !== null && star <= value;
        return (
          <Pressable
            key={star}
            accessibilityRole="radio"
            accessibilityLabel={star === 1 ? "1 star" : `${star} stars`}
            accessibilityState={{ checked: value === star, disabled }}
            disabled={disabled}
            hitSlop={{ top: slop, bottom: slop, left: 2, right: 2 }}
            onPress={() => {
              if (star !== value) onRate(star);
            }}
            style={({ pressed }) => (pressed ? styles.pressed : null)}
          >
            <StarGlyph
              color={on ? accent : tokens.color.text.muted}
              on={on}
              size={STAR_SIZE}
            />
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
      gap: tokens.spacing.xs,
    },
    pressed: {
      opacity: 0.6,
    },
  });
}
