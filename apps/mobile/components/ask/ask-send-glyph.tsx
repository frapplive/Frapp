import Svg, { Path } from "react-native-svg";
import { ASK_SEND_GLYPH } from "@repo/theme/crest";

/**
 * The send arrow (`ASK_SEND_GLYPH`, shared with web since #5476),
 * transcribed from `canvas-screens.dc.html` s17 (the visual truth that wins
 * over prose per #937): on the + panel's Frapp Intelligence field
 * (`ask-entry.tsx`) and on the conversation's send button, so the two are one
 * mark. Colour arrives as a prop for the reason `components/tab-glyphs.tsx`
 * gives.
 */
export function AskSendGlyph({
  color,
  size = 17,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox={ASK_SEND_GLYPH.viewBox}>
      <Path
        d={ASK_SEND_GLYPH.path}
        stroke={color}
        strokeWidth={ASK_SEND_GLYPH.strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
