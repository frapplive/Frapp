"use client";

import { useHolidayFlair } from "@repo/hooks";
import {
  HOLLY_SPRIG,
  SANTA_HAT,
  type FlairGlyph,
} from "@repo/theme/holiday-flair";
import { cn } from "@/lib/utils";

/**
 * The Holiday season's flair on web (#6149): a Santa hat on the nav crest and
 * on each message author's photo, and holly after their names. The shapes
 * are `@repo/theme/holiday-flair`, which the phone draws too.
 *
 * `useHolidayFlairOn` is the one switch every site reads. Specs stub it off
 * (`tests/setup.ts`), so a spec that renders a message or the nav needs no
 * chapter read for it.
 */
export function useHolidayFlairOn(): boolean {
  return useHolidayFlair();
}

function Glyph({
  glyph,
  className,
  testId,
}: {
  glyph: FlairGlyph;
  className?: string;
  testId: string;
}) {
  const { width, height } = glyph.viewBox;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-testid={testId}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("pointer-events-none shrink-0", className)}
    >
      {glyph.paths.map((p) => (
        <path key={p.d} d={p.d} fill={p.fill} />
      ))}
      {glyph.circles.map((c) => (
        <circle
          key={`${c.cx}-${c.cy}`}
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          fill={c.fill}
        />
      ))}
    </svg>
  );
}

/** A Santa hat tipped onto the top right of whatever box holds it. */
export function SantaHat({ className }: { className?: string }) {
  return (
    <Glyph
      glyph={SANTA_HAT}
      testId="holiday-santa-hat"
      className={cn("absolute rotate-[18deg]", className)}
    />
  );
}

/** A holly sprig, sized to sit in a line of text after a name. */
export function HollySprig({ className }: { className?: string }) {
  return (
    <Glyph
      glyph={HOLLY_SPRIG}
      testId="holiday-holly"
      className={cn("h-3 w-[17px] self-center", className)}
    />
  );
}
