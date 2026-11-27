import { Circle, Path, Rect } from "react-native-svg";
import { Frame, paint } from "@/components/glyph-recipe";

/**
 * The glyphs at the start of a settings row that opens a page or a sheet of
 * its own, as Discord's channel settings and iOS Settings draw them (Paul,
 * 2026-11-20). They are Lucide's (`Palette`, `Wallpaper`, `ScrollText`,
 * `Image`, `Landmark`, `Building2`, `Type`, `Cake`, personal Settings'
 * rows below them, #6032, and the module pages', #6030), the icon set web's
 * `SettingsRow` draws from
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

/*
 * A channel's settings (#6031): Lucide's `Folder`, `Eye` and `Pin`, with
 * `MessageSquare` and `Bell` below, the icons web's channel page draws on the
 * same rows.
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

/** Lucide's `Bell`. */
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

/** Lucide's `Pin`. */
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

/** Lucide's `MessageSquare`. */
export function MessageSquareGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path
        d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"
        {...detail}
      />
    </Frame>
  );
}

/** Lucide's `Link2`. */
export function Link2Glyph({ color, size = DEFAULT_SIZE }: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M9 17H7A5 5 0 0 1 7 7h2" {...detail} />
      <Path d="M15 7h2a5 5 0 1 1 0 10h-2" {...detail} />
      <Path d="M8 12h8" {...detail} />
    </Frame>
  );
}

/** Lucide's `Sparkles`. */
export function SparklesGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path
        d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
        {...detail}
      />
      <Path d="M20 2v4" {...detail} />
      <Path d="M22 4h-4" {...detail} />
      <Circle cx={4} cy={20} r={2} {...detail} />
    </Frame>
  );
}

/** Lucide's `CircleUserRound`. */
export function CircleUserRoundGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M17.925 20.056a6 6 0 0 0-11.851.001" {...detail} />
      <Circle cx={12} cy={11} r={4} {...detail} />
      <Circle cx={12} cy={12} r={10} {...detail} />
    </Frame>
  );
}

/** Lucide's `UserX`. */
export function UserXGlyph({ color, size = DEFAULT_SIZE }: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...detail} />
      <Circle cx={9} cy={7} r={4} {...detail} />
      <Path d="m17 8 5 5" {...detail} />
      <Path d="m22 8-5 5" {...detail} />
    </Frame>
  );
}

/** Lucide's `Newspaper`. */
export function NewspaperGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M15 18h-5" {...detail} />
      <Path d="M18 14h-8" {...detail} />
      <Path
        d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"
        {...detail}
      />
      <Rect width={8} height={4} x={10} y={6} rx={1} {...detail} />
    </Frame>
  );
}

/** Lucide's `Shield`. */
/** Lucide's `Lock`: Chapter settings' Privacy row (#6028). */
export function LockGlyph({ color, size = DEFAULT_SIZE }: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Rect x={3} y={11} width={18} height={11} rx={2} ry={2} {...detail} />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" {...detail} />
    </Frame>
  );
}

export function ShieldGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path
        d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
        {...detail}
      />
    </Frame>
  );
}

/** Lucide's `GraduationCap`. */
export function GraduationCapGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path
        d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"
        {...detail}
      />
      <Path d="M22 10v6" {...detail} />
      <Path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" {...detail} />
    </Frame>
  );
}

/** Lucide's `HeartHandshake`. */
export function HeartHandshakeGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path
        d="M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762"
        {...detail}
      />
    </Frame>
  );
}

/** A module page's Goals rows (#6030): Lucide's `Target`, as web's. */
export function TargetGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Circle cx={12} cy={12} r={10} {...detail} />
      <Circle cx={12} cy={12} r={6} {...detail} />
      <Circle cx={12} cy={12} r={2} {...detail} />
    </Frame>
  );
}

/** Meetings → Sections in the minutes (#6030): Lucide's `ListChecks`. */
export function ListChecksGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="m3 17 2 2 4-4" {...detail} />
      <Path d="m3 7 2 2 4-4" {...detail} />
      <Path d="M13 6h8" {...detail} />
      <Path d="M13 12h8" {...detail} />
      <Path d="M13 18h8" {...detail} />
    </Frame>
  );
}

/** Recruitment → Stages (#6030): Lucide's `Columns3`. */
export function ColumnsGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Rect x={3} y={3} width={18} height={18} rx={2} {...detail} />
      <Path d="M9 3v18" {...detail} />
      <Path d="M15 3v18" {...detail} />
    </Frame>
  );
}

/** Recruitment → Tags (#6030): Lucide's `Tag`. */
export function TagGlyph({ color, size = DEFAULT_SIZE }: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path
        d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"
        {...detail}
      />
      <Circle cx={7.5} cy={7.5} r={0.5} fill={color} />
    </Frame>
  );
}

/** Recruitment → Interest form (#6030): Lucide's `ClipboardList`. */
export function ClipboardListGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Rect x={8} y={2} width={8} height={4} rx={1} {...detail} />
      <Path
        d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
        {...detail}
      />
      <Path d="M12 11h4" {...detail} />
      <Path d="M12 16h4" {...detail} />
      <Path d="M8 11h.01" {...detail} />
      <Path d="M8 16h.01" {...detail} />
    </Frame>
  );
}

/** Announcements → Announcements channel (#6030): Lucide's `Hash`. */
export function HashGlyph({ color, size = DEFAULT_SIZE }: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M4 9h16" {...detail} />
      <Path d="M4 15h16" {...detail} />
      <Path d="M10 3 8 21" {...detail} />
      <Path d="M16 3l-2 18" {...detail} />
    </Frame>
  );
}

/** Chapter settings → Member fields (#6029): Lucide's `IdCard`. */
export function IdCardGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M16 10h2" {...detail} />
      <Path d="M16 14h2" {...detail} />
      <Path d="M6.17 15a3 3 0 0 1 5.66 0" {...detail} />
      <Circle cx={9} cy={11} r={2} {...detail} />
      <Rect x={2} y={5} width={20} height={14} rx={2} {...detail} />
    </Frame>
  );
}

/*
 * A member field's type, at the start of its row (#6029), web's `TYPE_ICON`
 * (`settings-fields-tab.tsx`): Text is `Type`, Number and Decimal are
 * `Hash`, and these three are Lucide's `Phone`, `List` (Pick one) and
 * `ToggleLeft` (Yes or no).
 */

export function PhoneGlyph({ color, size = DEFAULT_SIZE }: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path
        d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"
        {...detail}
      />
    </Frame>
  );
}

export function ListGlyph({ color, size = DEFAULT_SIZE }: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Path d="M3 5h.01" {...detail} />
      <Path d="M3 12h.01" {...detail} />
      <Path d="M3 19h.01" {...detail} />
      <Path d="M8 5h13" {...detail} />
      <Path d="M8 12h13" {...detail} />
      <Path d="M8 19h13" {...detail} />
    </Frame>
  );
}

export function ToggleLeftGlyph({
  color,
  size = DEFAULT_SIZE,
}: SettingsGlyphProps) {
  const { detail } = paint({ color });
  return (
    <Frame size={size}>
      <Circle cx={9} cy={12} r={3} {...detail} />
      <Rect x={2} y={5} width={20} height={14} rx={7} {...detail} />
    </Frame>
  );
}
