"use client";

import { Star } from "lucide-react";
import { RUSH_RATING_MAX, RUSH_RATING_MIN } from "@repo/validation";
import { FOCUS_RING } from "@/components/ui/focus";
import { cn } from "@/lib/utils";

const STEPS = Array.from(
  { length: RUSH_RATING_MAX - RUSH_RATING_MIN + 1 },
  (_, index) => RUSH_RATING_MIN + index,
);

/**
 * The viewer's own 1-to-5 rating of a prospect (`rush:vote`), the five-point
 * scale ChapterBuilder's members score on. A star press saves at once and
 * pressing another changes it; nobody's rating is shown by name, only the
 * average beside it (`rush:view_results`). Each star is its own button, named
 * for what it sets, so a keyboard reaches every value.
 */
export function RushRatingControl({
  name,
  value,
  disabled,
  onRate,
}: {
  /** The prospect, for the stars' names. */
  name: string;
  value: number | null | undefined;
  disabled?: boolean;
  onRate: (rating: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Your rating of ${name}`}
      className="inline-flex items-center"
    >
      {STEPS.map((step) => {
        const lit = value != null && step <= value;
        return (
          <button
            key={step}
            type="button"
            disabled={disabled}
            aria-pressed={value === step}
            aria-label={`${step} of ${RUSH_RATING_MAX}`}
            onClick={() => onRate(step)}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-card-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50 pointer-coarse:h-11 pointer-coarse:w-11",
              lit && "text-foreground",
              FOCUS_RING,
            )}
          >
            <Star
              className={cn("h-4 w-4", lit && "fill-current")}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
