import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useHolidayFlair } from "@repo/hooks";
import {
  HOLLY_SPRIG,
  SANTA_HAT,
  type FlairGlyph,
} from "@repo/theme/holiday-flair";

/**
 * The Holiday season's flair on the phone (#6149): a Santa hat on Chat home's
 * crest and on each message author's photo, and holly after their names.
 * The shapes are `@repo/theme/holiday-flair`, which web draws too.
 *
 * `useHolidayFlairOn` is the one switch every site reads. Specs stub it off
 * (`vitest.setup.ts`), so a spec that renders a message or the crest needs no
 * chapter read for it.
 */
export function useHolidayFlairOn(): boolean {
  return useHolidayFlair();
}

function Glyph({
  glyph,
  width,
  style,
  testID,
}: {
  glyph: FlairGlyph;
  width: number;
  style?: StyleProp<ViewStyle>;
  testID: string;
}) {
  const { width: w, height: h } = glyph.viewBox;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={[{ width, height: (width * h) / w }, style]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}>
        {glyph.paths.map((p) => (
          <Path key={p.d} d={p.d} fill={p.fill} />
        ))}
        {glyph.circles.map((c) => (
          <Circle
            key={`${c.cx}-${c.cy}`}
            cx={c.cx}
            cy={c.cy}
            r={c.r}
            fill={c.fill}
          />
        ))}
      </Svg>
    </View>
  );
}

/**
 * A Santa hat tipped onto the top right of the box it sits in: the box must
 * be the hat's positioned parent and must not clip it.
 */
export function SantaHat({ size }: { size: number }) {
  return (
    <Glyph
      glyph={SANTA_HAT}
      width={size}
      testID="holiday-santa-hat"
      style={[styles.hat, { top: -size * 0.45, right: -size * 0.32 }]}
    />
  );
}

/** A holly sprig, sized to sit in a line of text after a name. */
export function HollySprig() {
  return (
    <Glyph
      glyph={HOLLY_SPRIG}
      width={17}
      testID="holiday-holly"
      style={styles.holly}
    />
  );
}

const styles = StyleSheet.create({
  hat: { position: "absolute", transform: [{ rotate: "18deg" }] },
  holly: { alignSelf: "center" },
});
