import { View, type StyleProp, type ViewStyle } from "react-native";
import { useFrappTheme } from "@/lib/theme";
import { useChapterBranding } from "@/lib/chapter-branding";
import { DriveGlyph, PinGlyph, StarGlyph } from "./document-glyphs";
import { LimitedMark } from "./limited-mark";

/**
 * A file's marks on s12, in one order for the list row and the tile: the
 * lock when not everyone can see it, Drive's mark on a Drive file (#6055),
 * then its pin and star. Drawn only, and nothing when it has none: each row
 * says the same in its accessibility value and description.
 */
export function DocumentMarks({
  limited,
  fromDrive,
  pinned,
  starred,
  style,
}: {
  limited: boolean;
  fromDrive: boolean;
  pinned: boolean;
  starred: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  if (!limited && !fromDrive && !pinned && !starred) return null;
  return (
    <View style={[{ flexDirection: "row", gap: tokens.spacing.xs }, style]}>
      {limited ? (
        <LimitedMark color={tokens.color.text.mutedForeground} />
      ) : null}
      {fromDrive ? <DriveGlyph size={14} /> : null}
      {pinned ? <PinGlyph color={accent} on size={14} /> : null}
      {starred ? <StarGlyph color={accent} on size={14} /> : null}
    </View>
  );
}
