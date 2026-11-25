"use client";

import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/focus";

/**
 * Segmented control, `spec/ui/design-system/components.md` § Segmented
 * control: two to four short answers side by side inside a form, the held one
 * raised, so the current answer never hides behind a menu. A 1px
 * `border-control-edge` track on `surface-1`, padding 2, each segment 32px to
 * a mouse and 44 on touch. A radio group to assistive tech.
 *
 * **Neutral since 2026-11-24.** The held answer is a `card` step with a quiet
 * edge and foreground text; the rest are muted. It was the accent's tint with
 * accent text until Paul's ruling on the control ("too intrusive, draw
 * attention"): a form holds several of these, and each one lit in the accent
 * outshone the form's own action. The accent stays on what commits.
 *
 * **Only for a short pick inside a form** (Repeat, Proof, an attendance
 * mark). It never changes a page's or a list's view: that is `ViewLabels`
 * (`components/shared/view-labels.tsx`), and lint rejects this control inside
 * `PageActions` and `PageViews`.
 *
 * `fill` stretches the track to its container with equal segments (a form
 * row); without it the track hugs its labels (a table row).
 *
 * `quiet` holds the answer with the edge alone, no fill, for a row whose
 * answer only follows a default set elsewhere (Who's coming's roles that
 * follow "Everyone else"), so the rows set apart are the ones raised.
 */
export function SegmentedChoice<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  fill = false,
  quiet = false,
  dense = false,
  className,
  describedBy,
}: {
  label: string;
  /**
   * `disabled` on one option greys out that answer alone, and `title` gives
   * it a hover hint saying why.
   */
  options: readonly {
    value: T;
    label: string;
    disabled?: boolean;
    title?: string;
  }[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  fill?: boolean;
  quiet?: boolean;
  /** Caption-size labels and tighter padding, for a control beside a name in a list row. */
  dense?: boolean;
  className?: string;
  /** The id of a line saying why the control is off (a gate's notice). */
  describedBy?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      className={cn(
        "inline-flex rounded-md border border-control-edge bg-surface-1 p-0.5",
        fill ? "w-full" : "shrink-0",
        className,
      )}
    >
      {options.map((option) => {
        const held = option.value === value;
        const off = disabled || Boolean(option.disabled);
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={held}
            disabled={off}
            title={option.title}
            onClick={() => {
              if (!held) onChange(option.value);
            }}
            className={cn(
              // The transparent border is what the held edge and
              // `FOCUS_RING`'s swap both draw on, so neither changes the size.
              "flex min-h-8 items-center justify-center whitespace-nowrap rounded-sm border border-transparent font-semibold transition-colors pointer-coarse:min-h-11",
              dense ? "px-2 text-caption" : "px-3 text-sm",
              fill && "flex-1",
              held
                ? quiet
                  ? "border-border text-foreground"
                  : "border-border bg-card text-foreground"
                : "text-muted hover:bg-card-hover hover:text-foreground",
              off && "pointer-events-none text-disabled",
              FOCUS_RING,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
