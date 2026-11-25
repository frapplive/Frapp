import { Circle, Path, Rect } from "react-native-svg";
import { Frame, paint } from "@/components/glyph-recipe";

/**
 * The glyphs at the start of a settings row that opens a page or a sheet of
 * its own, as Discord's channel settings and iOS Settings draw them (Paul,
 * 2026-11-20). They are Lucide's `Palette`, `Wallpaper`, `ScrollText`,
 * `Image`, `Landmark`, `Building2`, `Type` and `Cake`,
 * the icon set web's `SettingsRow` draws from
 * (`apps/web/components/shared/settings-row.tsx`); where a row is on both,
 * both draw the same one (Accent color is `Palette` on each). A switch row,
 * or one that opens nothing, goes without, as on web.
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

/** Chapter mark: Lucide's `Image`, as web's row. */
export function ImageGlyph({ color, size = DEFAULT_SIZE }: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Rect x={3} y={3} width={18} height={18} rx={2} ry={2} {...detail} />
      <Circle cx={9} cy={9} r={2} {...detail} />
      <Path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" {...detail} />
    </Frame>
  );
}

/** Identity & founding: Lucide's `Landmark`, as web's row. */
export function LandmarkGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M10 18v-7" {...detail} />
      <Path
        d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"
        {...detail}
      />
      <Path d="M14 18v-7" {...detail} />
      <Path d="M18 18v-7" {...detail} />
      <Path d="M3 22h18" {...detail} />
      <Path d="M6 18v-7" {...detail} />
    </Frame>
  );
}

/** Organization type: Lucide's `Building2`, as web's row. */
export function BuildingGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M10 12h4" {...detail} />
      <Path d="M10 8h4" {...detail} />
      <Path d="M14 21v-3a2 2 0 0 0-4 0v3" {...detail} />
      <Path
        d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"
        {...detail}
      />
      <Path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" {...detail} />
    </Frame>
  );
}

/** Vocabulary: Lucide's `Type`, as web's row. */
export function TypeGlyph({ color, size = DEFAULT_SIZE }: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M12 4v16" {...detail} />
      <Path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" {...detail} />
      <Path d="M9 20h6" {...detail} />
    </Frame>
  );
}

/**
 * Birthday posts: Lucide's `Cake`. Web draws the picker in place, so only
 * the phone's row, which opens a sheet, carries a glyph.
 */
export function CakeGlyph({ color, size = DEFAULT_SIZE }: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" {...detail} />
      <Path
        d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"
        {...detail}
      />
      <Path d="M2 21h20" {...detail} />
      <Path d="M7 8v3" {...detail} />
      <Path d="M12 8v3" {...detail} />
      <Path d="M17 8v3" {...detail} />
      <Path d="M7 4h.01" {...detail} />
      <Path d="M12 4h.01" {...detail} />
      <Path d="M17 4h.01" {...detail} />
    </Frame>
  );
}
