import { Circle, Path, Rect } from "react-native-svg";
import { Frame, paint } from "@/components/glyph-recipe";

/**
 * The glyphs at the start of a settings row that opens a page or a sheet of
 * its own, as Discord's channel settings and iOS Settings draw them (Paul,
 * 2026-11-20). Web draws the same Lucide icons on its `SettingsRow`
 * (`apps/web/components/shared/settings-row.tsx`): `Palette`, `Wallpaper`,
 * `MapPin` and `ScrollText`. A switch row goes without, as it does on web.
 *
 * Detail strokes only, from `glyph-recipe.tsx`, at 20px. Decorative: the row
 * carries the label.
 */

interface SettingsGlyphProps {
  color: string;
  size?: number;
}

const DEFAULT_SIZE = 20;

export function PaletteGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path
        d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"
        {...detail}
      />
      <Circle cx={13.5} cy={6.5} r={1} fill={color} />
      <Circle cx={17.5} cy={10.5} r={1} fill={color} />
      <Circle cx={6.5} cy={12.5} r={1} fill={color} />
      <Circle cx={8.5} cy={7.5} r={1} fill={color} />
    </Frame>
  );
}

export function WallpaperGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M12 17v4" {...detail} />
      <Path d="M8 21h8" {...detail} />
      <Path d="m9 17 6.1-6.1a2 2 0 0 1 2.81.01L22 15" {...detail} />
      <Circle cx={8} cy={9} r={2} {...detail} />
      <Rect x={2} y={3} width={20} height={14} rx={2} {...detail} />
    </Frame>
  );
}

export function MapPinGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path
        d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
        {...detail}
      />
      <Circle cx={12} cy={10} r={3} {...detail} />
    </Frame>
  );
}

export function ScrollTextGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M15 12h-5" {...detail} />
      <Path d="M15 8h-5" {...detail} />
      <Path d="M19 17V5a2 2 0 0 0-2-2H4" {...detail} />
      <Path
        d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"
        {...detail}
      />
    </Frame>
  );
}
