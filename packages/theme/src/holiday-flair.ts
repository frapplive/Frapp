/**
 * The Holiday season's flair (#6149, Winston 2026-11-27): a Santa hat on the
 * chapter crest and on each message author's photo, and a holly sprig after
 * each author's name. Drawn glyphs, never emoji (the app draws none), as data
 * both apps render: web as inline SVG
 * (`apps/web/components/chat/holiday-flair.tsx`), the phone with
 * react-native-svg (`apps/mobile/components/chat/holiday-flair.tsx`).
 *
 * It shows from Dec 1 to 26 while the chapter's season switch is on
 * (`holidayFlairOn` in `@repo/validation`), whatever background a channel
 * shows. It sits beside the text, never behind it, so it changes no contrast.
 */

const HAT_RED = "#C8283A";
const SNOW_WHITE = "#F2F2F2";
const HOLLY_GREEN = "#2E8B57";
const BERRY_RED = "#D3263E";

export interface FlairGlyph {
  viewBox: { width: number; height: number };
  paths: readonly { d: string; fill: string }[];
  circles: readonly { cx: number; cy: number; r: number; fill: string }[];
}

/** A Santa hat leaning right, its pompom hanging off the tip. */
export const SANTA_HAT: FlairGlyph = {
  viewBox: { width: 24, height: 20 },
  paths: [
    {
      d: "M3 15 C4.5 8 10 2.5 18.5 4 C16.5 6.5 16 10 17 14.5 Z",
      fill: HAT_RED,
    },
    {
      d: "M2.5 13 H17.5 A2.5 2.5 0 0 1 17.5 18 H2.5 A2.5 2.5 0 0 1 2.5 13 Z",
      fill: SNOW_WHITE,
    },
  ],
  circles: [{ cx: 20.5, cy: 5, r: 2.7, fill: SNOW_WHITE }],
};

/** Two holly leaves and two berries where they meet. */
export const HOLLY_SPRIG: FlairGlyph = {
  viewBox: { width: 20, height: 14 },
  paths: [
    { d: "M1 8 C3.5 3 8 3 10 6.5 C8 10 3.5 11 1 8 Z", fill: HOLLY_GREEN },
    { d: "M19 8 C16.5 3 12 3 10 6.5 C12 10 16.5 11 19 8 Z", fill: HOLLY_GREEN },
  ],
  circles: [
    { cx: 9, cy: 9.2, r: 2.1, fill: BERRY_RED },
    { cx: 11.8, cy: 10.3, r: 1.8, fill: BERRY_RED },
  ],
};
