import * as React from "react";
import { Plus } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * How a worded header button folds to its glyph where the header is narrow
 * (below), shared with the Filter button (`shared/filter-menu.tsx`) so the
 * two fold at the same width and a header never shows one worded and the
 * other bare. `HEADER_BUTTON_FOLD` squares the button; `HEADER_LABEL_FOLD`
 * keeps its words for a screen reader only.
 */
export const HEADER_BUTTON_FOLD =
  "@max-[26rem]:w-9 @max-[26rem]:px-0 @max-[26rem]:pointer-coarse:w-11 group-has-[[data-tool-page-views]:not(:empty)]/page-header:@max-[36rem]:w-9 group-has-[[data-tool-page-views]:not(:empty)]/page-header:@max-[36rem]:px-0 group-has-[[data-tool-page-views]:not(:empty)]/page-header:@max-[36rem]:pointer-coarse:w-11";
export const HEADER_LABEL_FOLD =
  "@max-[26rem]:sr-only group-has-[[data-tool-page-views]:not(:empty)]/page-header:@max-[36rem]:sr-only";
/** A count on a folded button rides its corner, as `FilterMenu`'s glyph's. */
export const HEADER_BADGE_FOLD =
  "@max-[26rem]:absolute @max-[26rem]:-right-1.5 @max-[26rem]:-top-1.5 @max-[26rem]:h-4 @max-[26rem]:min-w-4 @max-[26rem]:justify-center @max-[26rem]:px-1 group-has-[[data-tool-page-views]:not(:empty)]/page-header:@max-[36rem]:absolute group-has-[[data-tool-page-views]:not(:empty)]/page-header:@max-[36rem]:-right-1.5 group-has-[[data-tool-page-views]:not(:empty)]/page-header:@max-[36rem]:-top-1.5 group-has-[[data-tool-page-views]:not(:empty)]/page-header:@max-[36rem]:h-4 group-has-[[data-tool-page-views]:not(:empty)]/page-header:@max-[36rem]:min-w-4 group-has-[[data-tool-page-views]:not(:empty)]/page-header:@max-[36rem]:justify-center group-has-[[data-tool-page-views]:not(:empty)]/page-header:@max-[36rem]:px-1";

/**
 * A page's "New ..." button: a +, then "New" and the thing it makes ("New
 * event", "New minutes", "New task"). Paul, 2026-11-19: "make the new buttons
 * match across the board"; on the decision card the same day he chose the
 * outlined look Events already had (#5560) over a filled pill. The look is
 * the Button's `action` variant (`button.tsx`), which a page's main action
 * that keeps its own verb (Log service, Upload, Adjust points) draws too.
 *
 * The label is "New <thing>", not "Add", "Create" or "Start": one verb for
 * making something, so a member learns it once. On the phone the same action
 * is the floating glass + (`apps/mobile/components/floating-create-button.tsx`),
 * whose accessibility label is the same "New <thing>".
 *
 * Where it is narrow, in a page header beside chat, the words go and the +
 * stays (the name is still read out), so the page's title keeps its room.
 * That keys off the nearest `@container`: the tool page header is one. A
 * header that also holds the page's views (`PageViews`, #5947) needs the room
 * sooner, so there the words go below 36rem rather than 26rem: the title and
 * the view words keep their text, and the + says the rest.
 *
 * Forwards its ref and props, so it works as a dialog or popover trigger
 * (`asChild`) and takes a gate's `controlProps()`.
 */
export type NewButtonProps = Omit<ButtonProps, "children" | "variant"> & {
  /** What it makes, lowercase unless a name: "event", "minutes", "task". */
  thing: string;
  /**
   * The + alone at any width, the words read out only: for a page that has
   * folded its views into a menu, so the header's views-present fold no
   * longer applies though the header is just as narrow.
   */
  glyphOnly?: boolean;
};

export const NewButton = React.forwardRef<HTMLButtonElement, NewButtonProps>(
  function NewButton(
    { thing, glyphOnly = false, className, size = "toolbar", ...props },
    ref,
  ) {
    return (
      <Button
        ref={ref}
        size={size}
        variant="action"
        className={cn(
          "shrink-0 gap-2",
          glyphOnly ? "w-9 px-0 pointer-coarse:w-11" : HEADER_BUTTON_FOLD,
          className,
        )}
        {...props}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span className={glyphOnly ? "sr-only" : HEADER_LABEL_FOLD}>
          {newLabel(thing)}
        </span>
      </Button>
    );
  },
);

/** "New event": the button's words, for a test or a screen reader name. */
export function newLabel(thing: string): string {
  return `New ${thing}`;
}
