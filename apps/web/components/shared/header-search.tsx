"use client";

import * as React from "react";
import { SearchGlyph } from "@/components/layout/nav-glyphs";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import {
  dashboardToolbarSearchClassName,
  dashboardToolbarSearchGlyphClassName,
} from "@/components/shared/table-controls";
import { cn } from "@/lib/utils";

/**
 * A page header's search field, which folds to a glyph on a narrow pane
 * (beside chat) and opens into its field when pressed, the way Events' did
 * first (#5560) and Rush's does (2026-11-24). One copy, so the two behave
 * alike:
 *
 * - **Narrow, closed and empty:** the glyph, named `glyphLabel`. Pressing it
 *   opens the field with the caret in it.
 * - **Escape** clears typed text first and keeps the field open; a second
 *   Escape closes it and hands focus back to the glyph, so a keyboard user
 *   keeps their place. Neither reaches the page, whose Escape closes it.
 * - **Blur while empty** closes it. A field holding text stays open, since
 *   the text is narrowing the page under it.
 *
 * Wide, it is always the field; `className` sizes its box there.
 */
export function HeaderSearch({
  narrow,
  value,
  onChange,
  placeholder,
  label,
  glyphLabel,
  className,
}: {
  narrow: boolean;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** The field's spoken name: "Search events by name or location". */
  label: string;
  /** The folded glyph's spoken name: "Search events". */
  glyphLabel: string;
  /** The field's box where the pane is wide. */
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const glyphRef = React.useRef<HTMLButtonElement>(null);
  // Focus returns to the glyph only after an Escape closed the field, not
  // on the first render or a blur that already moved focus elsewhere.
  const refocusGlyph = React.useRef(false);
  const folded = narrow && !open && !value;

  React.useEffect(() => {
    if (folded && refocusGlyph.current) {
      refocusGlyph.current = false;
      glyphRef.current?.focus();
    }
  }, [folded]);

  if (folded) {
    return (
      <IconButton
        ref={glyphRef}
        variant="secondary"
        className="shrink-0"
        label={glyphLabel}
        onClick={() => setOpen(true)}
      >
        <SearchGlyph className="h-4 w-4" />
      </IconButton>
    );
  }
  return (
    <div
      className={cn("relative min-w-0", narrow ? "min-w-24 flex-1" : className)}
    >
      <SearchGlyph className={dashboardToolbarSearchGlyphClassName} />
      <Input
        type="search"
        value={value}
        autoFocus={narrow && open}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          if (value) {
            event.preventDefault();
            event.stopPropagation();
            onChange("");
            // Kept open where it would fold, so the cleared field doesn't
            // vanish under the caret.
            if (narrow) setOpen(true);
          } else if (narrow) {
            event.preventDefault();
            event.stopPropagation();
            refocusGlyph.current = true;
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (!value) setOpen(false);
        }}
        placeholder={placeholder}
        aria-label={label}
        className={dashboardToolbarSearchClassName}
      />
    </div>
  );
}
