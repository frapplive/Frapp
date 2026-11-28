/**
 * How each built-in chat background looks (#3973), as data both renderers
 * read: web turns it into CSS (`apps/web/components/chat/chat-background.tsx`)
 * and mobile into SVG (`apps/mobile/components/chat/chat-background.tsx`). The
 * values come from the chat concept page's backgrounds (Plain, Gold glow,
 * Midnight, Game day, Letters), and Holiday (#6149), which a channel that
 * follows a Plain chapter default shows from Dec 1 to 26 unless an officer
 * turned the season off (`withHolidaySeason` in `@repo/validation`); the
 * keys are `CHAT_BACKGROUND_BUILT_INS` in
 * `@repo/validation`.
 *
 * Every one is dark, because Signet is dark-only and the thread's text tokens
 * are tuned for `--background`. The AA guard
 * (`apps/web/components/chat/chat-background-contrast.spec.ts`) measures every
 * text token against every pixel colour a background can produce
 * (`chatBackgroundSamples`), so a new or brighter background fails there
 * rather than on a member's screen.
 */
import { mixHex } from "@repo/color";
import { signetDarkTokens } from "./signet";

export type ChatBackgroundBuiltInKey =
  "plain" | "gold-glow" | "midnight" | "game-day" | "letters" | "holiday";

export type ChatBackgroundLayer =
  /** A full-bleed gradient of opaque stops, at `angle` degrees (CSS convention). */
  | {
      kind: "linear";
      angle: number;
      stops: readonly { offset: number; color: string }[];
    }
  /**
   * A soft glow: `color` at `alpha` at the centre, fading to nothing at
   * `fade` of the radius. Centre and radii are fractions of the box.
   */
  | {
      kind: "radial";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      color: string;
      alpha: number;
      fade: number;
    }
  /** Horizontal bands of two alternating colours, each `height` px tall. */
  | { kind: "bands"; height: number; colors: readonly [string, string] }
  /** A thin rule every `every` px, `thickness` px tall. */
  | {
      kind: "rules";
      every: number;
      thickness: number;
      color: string;
      alpha: number;
    }
  /** The chapter's letters as a faint repeating tile. */
  | {
      kind: "letters";
      width: number;
      height: number;
      fontSize: number;
      color: string;
      alphas: readonly [number, number];
    }
  /**
   * Snow: round flakes on a square `tile` px wide, repeated. In a thread it
   * drifts down one tile every `fallSeconds`, slowly enough to sit behind
   * the reading; it holds still under reduced motion, and in a swatch.
   */
  | {
      kind: "snow";
      tile: number;
      flakes: readonly { x: number; y: number; r: number }[];
      color: string;
      alpha: number;
      fallSeconds: number;
    };

export interface ChatBackgroundPaint {
  /** The colour under every layer. */
  base: string;
  layers: readonly ChatBackgroundLayer[];
}

const GOLD = "#DDB844";
const CRANBERRY = "#C4283F";

/**
 * Holiday's flakes on its 160px tile: sixteen, from 1 to 2.2px, spread so no
 * two clump and the repeat doesn't read as a grid.
 */
const SNOW_FLAKES = [
  { x: 12, y: 18, r: 1.6 },
  { x: 47, y: 6, r: 1 },
  { x: 83, y: 27, r: 2.2 },
  { x: 128, y: 11, r: 1.3 },
  { x: 150, y: 44, r: 1 },
  { x: 29, y: 58, r: 1.2 },
  { x: 66, y: 71, r: 1.8 },
  { x: 109, y: 62, r: 1 },
  { x: 140, y: 88, r: 1.6 },
  { x: 8, y: 97, r: 1 },
  { x: 44, y: 113, r: 2 },
  { x: 92, y: 104, r: 1.2 },
  { x: 121, y: 131, r: 1.4 },
  { x: 21, y: 142, r: 1.1 },
  { x: 71, y: 150, r: 1.5 },
  { x: 154, y: 151, r: 1 },
] as const;

export const CHAT_BACKGROUND_PAINTS: Record<
  ChatBackgroundBuiltInKey,
  ChatBackgroundPaint
> = {
  plain: { base: signetDarkTokens.color.surface.background, layers: [] },
  "gold-glow": {
    base: "#0B0A08",
    // The concept page's top glow was 0.20; where the two glows meet that put
    // `muted` text at 4.33:1, so it is 0.16 here (the AA guard measures it).
    layers: [
      {
        kind: "radial",
        cx: 0.85,
        cy: 0,
        rx: 1.2,
        ry: 0.7,
        color: GOLD,
        alpha: 0.16,
        fade: 0.6,
      },
      {
        kind: "radial",
        cx: 0,
        cy: 1,
        rx: 0.8,
        ry: 0.6,
        color: GOLD,
        alpha: 0.08,
        fade: 0.6,
      },
    ],
  },
  midnight: {
    base: "#07080C",
    layers: [
      {
        kind: "linear",
        angle: 170,
        stops: [
          { offset: 0, color: "#0F1730" },
          { offset: 0.45, color: "#0B0F1D" },
          { offset: 1, color: "#07080C" },
        ],
      },
    ],
  },
  "game-day": {
    base: "#0E1A10",
    layers: [
      { kind: "bands", height: 60, colors: ["#0E1A10", "#0C170E"] },
      {
        kind: "rules",
        every: 120,
        thickness: 2,
        color: "#FFFFFF",
        alpha: 0.07,
      },
    ],
  },
  letters: {
    base: "#0C0C0C",
    layers: [
      {
        kind: "letters",
        width: 150,
        height: 96,
        fontSize: 30,
        color: GOLD,
        alphas: [0.05, 0.035],
      },
    ],
  },
  // Deep evergreen, a soft cranberry glow from the top right and a fainter
  // one from the bottom left, and light snow (#6149). A flake at its peak, on
  // the glow on the gradient's top stop, is the brightest pixel: snow at 0.11
  // put `muted` text there at 4.47:1, so the flakes stay at 0.10 and the glow
  // at 0.13 (the AA guard measures it).
  holiday: {
    base: "#07130D",
    layers: [
      {
        kind: "linear",
        angle: 170,
        stops: [
          { offset: 0, color: "#0E2219" },
          { offset: 0.5, color: "#0A1912" },
          { offset: 1, color: "#07130D" },
        ],
      },
      {
        kind: "radial",
        cx: 0.9,
        cy: 0,
        rx: 1.1,
        ry: 0.7,
        color: CRANBERRY,
        alpha: 0.13,
        fade: 0.6,
      },
      {
        kind: "radial",
        cx: 0,
        cy: 1,
        rx: 0.8,
        ry: 0.5,
        color: CRANBERRY,
        alpha: 0.08,
        fade: 0.6,
      },
      {
        kind: "snow",
        tile: 160,
        flakes: SNOW_FLAKES,
        color: "#FFFFFF",
        alpha: 0.1,
        fallSeconds: 24,
      },
    ],
  },
};

/**
 * A photo background sits under the thread's own `--background` at this
 * opacity, and blurred. The opacity is chosen for the worst pixel a photo can
 * hold, pure white, so every text token stays AA whatever was uploaded; the
 * guard proves it. It reads as a tint of the photo, which is the point: the
 * messages are the content (#3826).
 */
export const CHAT_BACKGROUND_PHOTO_SCRIM_ALPHA = 0.88;
export const CHAT_BACKGROUND_PHOTO_BLUR_PX = 24;

/** `b` over `a` at `weightOfB`: what CSS composites. Shared with the AA guards. */
function mix(a: string, b: string, weightOfB: number): string {
  return mixHex(a, b, weightOfB);
}

/**
 * Every pixel colour a background can produce at its brightest, for the AA
 * guard. Glows are stacked at full strength over every colour under them
 * (their peaks could overlap, and could sit on a gradient's brightest stop),
 * and a rule, a letter or a flake is laid over everything beneath it.
 */
export function chatBackgroundSamples(key: ChatBackgroundBuiltInKey): string[] {
  const paint = CHAT_BACKGROUND_PAINTS[key];
  const samples = [paint.base];
  for (const layer of paint.layers) {
    switch (layer.kind) {
      case "linear":
        samples.push(...layer.stops.map((s) => s.color));
        break;
      case "radial":
        samples.push(...samples.map((s) => mix(s, layer.color, layer.alpha)));
        break;
      case "bands":
        samples.push(...layer.colors);
        break;
      case "rules":
        samples.push(...samples.map((s) => mix(s, layer.color, layer.alpha)));
        break;
      case "letters":
        samples.push(mix(paint.base, layer.color, Math.max(...layer.alphas)));
        break;
      case "snow":
        samples.push(...samples.map((s) => mix(s, layer.color, layer.alpha)));
        break;
    }
  }
  return samples;
}

/** The brightest pixel a photo can produce once the scrim is over it. */
export function chatBackgroundPhotoWorstPixel(): string {
  return mix(
    "#FFFFFF",
    signetDarkTokens.color.surface.background,
    CHAT_BACKGROUND_PHOTO_SCRIM_ALPHA,
  );
}
