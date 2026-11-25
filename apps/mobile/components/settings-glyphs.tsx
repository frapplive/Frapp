import { Circle, Path, Rect } from "react-native-svg";
import { Frame, paint } from "@/components/glyph-recipe";

/**
 * The glyphs at the start of a settings row that opens a page or a sheet of
 * its own, as Discord's channel settings and iOS Settings draw them (Paul,
 * 2026-11-20). They are Lucide's `Palette`, `Wallpaper` and `ScrollText`,
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

/*
 * A channel's settings (#6031): Lucide's `Folder`, `Eye`, `MessageSquare`,
 * `Bell` and `Pin`, the icons web's channel page draws on the same rows.
 */

export function FolderGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path
        d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
        {...detail}
      />
    </Frame>
  );
}

export function EyeGlyph({ color, size = DEFAULT_SIZE }: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path
        d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
        {...detail}
      />
      <Circle cx={12} cy={12} r={3} {...detail} />
    </Frame>
  );
}

export function MessageSquareGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        {...detail}
      />
    </Frame>
  );
}

export function BellGlyph({ color, size = DEFAULT_SIZE }: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M10.268 21a2 2 0 0 0 3.464 0" {...detail} />
      <Path
        d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"
        {...detail}
      />
    </Frame>
  );
}

export function PinGlyph({ color, size = DEFAULT_SIZE }: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M12 17v5" {...detail} />
      <Path
        d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
        {...detail}
      />
    </Frame>
  );
}
