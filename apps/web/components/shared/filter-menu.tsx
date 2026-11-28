"use client";

import { useState } from "react";
import { matchesWordStarts } from "@repo/hooks/fuzzy-match";
import { ListFilter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FILTER_SEARCH_THRESHOLD } from "@/components/shared/filter-chip";
import { FOCUS_RING } from "@/components/ui/focus";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  HEADER_BADGE_FOLD,
  HEADER_BUTTON_FOLD,
  HEADER_LABEL_FOLD,
} from "@/components/ui/new-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The one way to filter a list on web (rulebook § 9,
 * `spec/ui/design-system/components.md` § Filter bar): a single Filter button
 * in the page header, beside the search field and the view switch, that
 * shows how many filters are on. It opens one menu with a row per filter
 * (Role, Status, Date added, Sort); each row opens its options, and Clear all
 * is last. Linear, GitHub and Notion filter this way. The phone draws the same
 * rows, in the same order, in a Filters sheet.
 *
 * A list that splits into two or three named sets people switch between all
 * day (Actives / Alumni, All / Unread) is a view, not a filter: plain words
 * beside the title (`ViewLabels` in `PageViews`, #5947).
 */
export type FilterMenuFilter = {
  key: string;
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  /** The option that means "no filter" (All, Any). Not counted as on. */
  anyValue: string;
  onChange: (value: string) => void;
  /** A sort row is listed with the filters but never counted or cleared. */
  isSort?: boolean;
};

/** The "no filter" value `anyFilterRow` gives a row; no id or value can be it. */
export const ANY_FILTER = "\u0000any";

/**
 * A filter whose state is `null` for "any", as one `FilterMenu` row: its
 * "any" option leads the list. The Directory and Tasks keep their filters
 * this way.
 */
export function anyFilterRow({
  key,
  label,
  anyLabel,
  options,
  value,
  onChange,
}: {
  key: string;
  label: string;
  anyLabel: string;
  options: readonly { value: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
}): FilterMenuFilter {
  return {
    key,
    label,
    options: [{ value: ANY_FILTER, label: anyLabel }, ...options],
    value: value ?? ANY_FILTER,
    anyValue: ANY_FILTER,
    onChange: (next) => onChange(next === ANY_FILTER ? null : next),
  };
}

export function FilterMenu({
  filters,
  thing,
  narrow = false,
}: {
  filters: readonly FilterMenuFilter[];
  /** What the list holds, for the button's name: "Filter members". */
  thing: string;
  /** Draws the button as an icon only, for a pane too narrow for its word. */
  narrow?: boolean;
}) {
  const on = filters.filter((f) => !f.isSort && f.value !== f.anyValue);
  const name =
    on.length > 0 ? `Filter ${thing}, ${on.length} on` : `Filter ${thing}`;
  const count =
    on.length > 0 ? (
      <Badge
        variant="default"
        aria-hidden="true"
        // On the glyph it rides the corner; on the worded button it does
        // where the header folds that button to its glyph.
        className={
          narrow
            ? "absolute -right-1.5 -top-1.5 h-4 min-w-4 justify-center px-1"
            : HEADER_BADGE_FOLD
        }
      >
        {on.length}
      </Badge>
    ) : null;

  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {narrow ? (
          <IconButton
            variant="secondary"
            className="relative shrink-0"
            data-filter-menu-trigger=""
            label={name}
          >
            <ListFilter className="h-4 w-4" aria-hidden="true" />
            {count}
          </IconButton>
        ) : (
          // Folds to its glyph where the header is narrow, at the same width
          // as New beside it (`HEADER_BUTTON_FOLD`), the count riding its
          // corner as the narrow glyph's does.
          <Button
            size="toolbar"
            variant="secondary"
            className={cn("relative shrink-0 gap-2", HEADER_BUTTON_FOLD)}
            data-filter-menu-trigger=""
            aria-label={name}
          >
            <ListFilter className="h-4 w-4" aria-hidden="true" />
            <span className={HEADER_LABEL_FOLD}>Filter</span>
            {count}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        {filters.map((filter) => (
          <FilterSubmenu
            key={filter.key}
            filter={filter}
            close={() => setOpen(false)}
          />
        ))}
        {on.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                for (const filter of on) filter.onChange(filter.anyValue);
              }}
            >
              Clear all
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One filter's row and its options. Past `FILTER_SEARCH_THRESHOLD` options
 * (the "any" row not counted) the list gets a type-to-filter field (#3970: a
 * chapter imported from Discord can carry 100+ roles, and scrolling for one
 * is slow). It searches as the filter chip did and as the phone does: every
 * word typed starts a word of the label, case, accents and punctuation
 * ignored (`matchesWordStarts`), and the "any" row steps aside while a query
 * is typed, so a query never clears the filter by matching "Any role".
 * Enter picks the first match; Escape clears a query before it closes.
 */
function FilterSubmenu({
  filter,
  close,
}: {
  filter: FilterMenuFilter;
  close: () => void;
}) {
  const [query, setQuery] = useState("");
  const current = filter.options.find((o) => o.value === filter.value);
  const choices = filter.options.filter((o) => o.value !== filter.anyValue);
  const searchable = !filter.isSort && choices.length > FILTER_SEARCH_THRESHOLD;
  const typed = query.trim() !== "";
  const shown = typed
    ? choices.filter((o) => matchesWordStarts(o.label, query))
    : filter.options;
  return (
    <DropdownMenuSub onOpenChange={(open) => !open && setQuery("")}>
      <DropdownMenuSubTrigger className="gap-6">
        <span className="flex-1">{filter.label}</span>
        <span className="text-muted-foreground">{current?.label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="max-h-80 overflow-y-auto"
        onEscapeKeyDown={(event) => {
          if (!query) return;
          event.preventDefault();
          setQuery("");
        }}
      >
        {searchable ? (
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            // The menu's typeahead would take these keys; arrows and Escape
            // still reach it.
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const first = shown[0];
                if (typed && first) {
                  filter.onChange(first.value);
                  close();
                }
              }
              if (
                !["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(event.key)
              ) {
                event.stopPropagation();
              }
            }}
            placeholder={`Search ${filter.label.toLowerCase()}`}
            aria-label={`Search ${filter.label.toLowerCase()}`}
            className="mb-1 h-control-row"
          />
        ) : null}
        <DropdownMenuRadioGroup
          value={filter.value}
          onValueChange={filter.onChange}
        >
          {shown.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {searchable && shown.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            No matches
          </p>
        ) : null}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/**
 * The filters that are on, as small removable chips just under the page
 * header, with Clear all; nothing at all while none are on. Baymard's testing
 * found people lose track when applied filters hide behind the button, so the
 * button's count alone is not enough. Pass the same `filters` as `FilterMenu`.
 */
export function ActiveFilterChips({
  filters,
}: {
  filters: readonly FilterMenuFilter[];
}) {
  const on = filters.filter((f) => !f.isSort && f.value !== f.anyValue);
  if (on.length === 0) return null;
  // The pressed chip unmounts, so focus moves to the next chip, else the
  // Filter button, instead of falling to the top of the page.
  const keepFocus = (from: HTMLElement, clearsAll: boolean) => {
    const row = from.parentElement;
    const chips = row
      ? Array.from(row.querySelectorAll<HTMLElement>("[data-filter-chip]"))
      : [];
    const next = clearsAll ? undefined : chips.find((chip) => chip !== from);
    requestAnimationFrame(() => {
      const target =
        next && next.isConnected
          ? next
          : document.querySelector<HTMLElement>("[data-filter-menu-trigger]");
      target?.focus();
    });
  };
  return (
    <div
      role="group"
      className="flex flex-wrap items-center gap-1.5"
      aria-label="Filters on"
    >
      {on.map((filter) => {
        const current = filter.options.find((o) => o.value === filter.value);
        return (
          <button
            key={filter.key}
            type="button"
            data-filter-chip=""
            onClick={(event) => {
              keepFocus(event.currentTarget, false);
              filter.onChange(filter.anyValue);
            }}
            aria-label={`Remove filter ${filter.label}: ${current?.label ?? ""}`}
            className={cn(
              "inline-flex h-control-chip items-center gap-1 rounded-full border border-border bg-card px-2.5 text-caption text-foreground transition hover:bg-card-hover",
              FOCUS_RING,
            )}
          >
            <span className="text-muted-foreground">{filter.label}</span>
            {current?.label}
            <X className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          </button>
        );
      })}
      {on.length > 1 ? (
        <button
          type="button"
          onClick={(event) => {
            keepFocus(event.currentTarget, true);
            for (const filter of on) filter.onChange(filter.anyValue);
          }}
          className={cn(
            "h-control-chip rounded-full px-2 text-caption text-muted-foreground hover:text-foreground",
            FOCUS_RING,
          )}
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}
