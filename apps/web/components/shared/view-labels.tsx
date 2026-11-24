"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/focus";

/**
 * A page's or a list's views as plain words, `spec/ui/design-system/components.md`
 * § View labels: the one you are on in the foreground colour at 600, the
 * others muted at 400. No box, no fill, no accent, no underline.
 *
 * Paul, 2026-11-24, on the boxed switch this replaces: "I want to never see
 * one of these switcher things ... too intrusive, draw attention". The words
 * are the whole control, the way Notion draws a database's views beside its
 * title and Threads draws For you and Following.
 *
 * **One view draws nothing.** A member who has only "Mine" gets no label for
 * it: a lone word beside the title is a control that does nothing.
 *
 * **Nothing moves when the pick changes.** Semibold text is wider than
 * regular, so every label reserves its semibold width with a hidden copy and
 * the visible word sits over it. Switching views never nudges the next word or
 * the buttons after it (P4).
 *
 * **A tab list to assistive tech** (`tablist` / `tab`, `aria-selected`), with
 * one tab stop: Left and Right move between the views, Home and End jump to
 * the ends, and Tab leaves for the content. Moving selects, as the ARIA tabs
 * pattern recommends when the view is already on the page. `activation="manual"`
 * moves focus only and waits for Enter or Space, for a view that costs
 * something to show (catch-up's range starts a new summary).
 *
 * In a page header it goes inside `PageViews` (`layout/page-actions.tsx`),
 * which seats it beside the title after a hairline.
 */
/**
 * The first word's inset from its line's edge: a label's 6px of padding and
 * its 1px border, which `flush` takes back. Exported for the page header,
 * which lines its views up with the page gutter below `lg`. Spelled out
 * whole, so Tailwind finds each class in this file.
 */
export const VIEW_LABELS_FLUSH = "-ml-[7px]";
export const VIEW_LABELS_FLUSH_NARROW = "max-lg:-ml-[7px]";

export type ViewOption<T extends string> = {
  value: T;
  label: string;
};

export function ViewLabels<T extends string>({
  label,
  options,
  value,
  onChange,
  activation = "auto",
  panelId,
  flush = false,
  className,
}: {
  /** What the views are views of, for a screen reader: "Whose tasks". */
  label: string;
  options: readonly ViewOption<T>[];
  value: T;
  onChange: (next: T) => void;
  activation?: "auto" | "manual";
  /** The id of the region the views change, when the page marks one. */
  panelId?: string;
  /**
   * For views that start a line: lines the first word's text up with the
   * line's left edge, which the label's focus padding would otherwise indent.
   */
  flush?: boolean;
  className?: string;
}) {
  const tabs = React.useRef(new Map<T, HTMLButtonElement>());
  if (options.length < 2) return null;

  // One tab stop, on the held view, which is where the WAI-ARIA tabs pattern
  // puts focus when it enters the list, under manual activation too. A value
  // that matches no option (a view the member lost) leaves the first one
  // reachable.
  const stop = options.some((option) => option.value === value)
    ? value
    : options[0]!.value;

  function move(from: number, to: number) {
    const next = options[(to + options.length) % options.length];
    if (!next || next === options[from]) return;
    tabs.current.get(next.value)?.focus();
    if (activation === "auto") onChange(next.value);
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case "ArrowRight":
        move(index, index + 1);
        break;
      case "ArrowLeft":
        move(index, index - 1);
        break;
      case "Home":
        move(index, 0);
        break;
      case "End":
        move(index, options.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        // 2px between labels, so 16px between words: 6 of padding and 1 of
        // border on either side of the gap.
        "flex shrink-0 items-center gap-0.5",
        flush && VIEW_LABELS_FLUSH,
        className,
      )}
    >
      {options.map((option, index) => {
        const held = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              if (node) tabs.current.set(option.value, node);
              else tabs.current.delete(option.value);
            }}
            type="button"
            role="tab"
            aria-selected={held}
            aria-controls={panelId}
            tabIndex={option.value === stop ? 0 : -1}
            onClick={() => {
              if (!held) onChange(option.value);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              // The Row step to a mouse, 44 on touch. The transparent border
              // is what `FOCUS_RING` turns solid.
              "grid min-h-8 place-items-center whitespace-nowrap rounded-sm border border-transparent px-1.5 text-label transition-colors pointer-coarse:min-h-11",
              held
                ? "cursor-default font-semibold text-foreground"
                : "font-normal text-muted hover:text-muted-foreground",
              FOCUS_RING,
            )}
          >
            {/* The semibold width, held whether or not this view is picked. */}
            <span
              aria-hidden="true"
              className="invisible col-start-1 row-start-1 font-semibold"
            >
              {option.label}
            </span>
            <span className="col-start-1 row-start-1">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
