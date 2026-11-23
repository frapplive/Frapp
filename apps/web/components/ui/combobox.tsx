"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useRef,
  type ReactNode,
  type Ref,
} from "react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The shell `TimeField` and `SuggestField` share (#5795). It owns what must
 * not drift between them: the popover anchored to the field, the WAI-ARIA combobox wiring, the
 * arrow / Enter / Escape keys, keeping focus in the field while the list is
 * open, and the option row's look. What the list holds, which row is
 * highlighted and when it opens stay with the field, so each keeps its own
 * state model (a parsed time, free text with suggestions). The geofence
 * place search (`geofences/zone-picker.tsx`) still draws its own list (#5847).
 */

const ListIdContext = createContext<string>("");

type ComboboxFieldProps = Omit<
  React.ComponentProps<"input">,
  "role" | "type" | "children"
> & {
  /** Whether the list shows. The caller folds `disabled` in. */
  open: boolean;
  /** Radix's own close requests (a press outside the field and list). */
  onOpenChange?: (open: boolean) => void;
  /** `"list"` when the options filter on what is typed, else `"none"`. */
  "aria-autocomplete": "none" | "list";
  /** The highlighted option's `optionKey`, or `null` for none. */
  activeKey: string | null;
  /** ArrowDown (`1`) or ArrowUp (`-1`): move the highlight. */
  onStep: (by: 1 | -1) => void;
  /**
   * Enter while the list is open: take the highlighted option. Returns
   * whether it took one, so an Enter with nothing to take still submits.
   */
  onPick: () => boolean;
  /** Escape while the list is open: close it, leaving any dialog around it. */
  onDismiss: () => void;
  /** The list's name for a screen reader. */
  listLabel: string;
  listRef?: Ref<HTMLUListElement>;
  /** `ComboboxOption` rows. */
  options: ReactNode;
};

export const ComboboxField = forwardRef<HTMLInputElement, ComboboxFieldProps>(
  function ComboboxField(
    {
      open,
      onOpenChange,
      activeKey,
      onStep,
      onPick,
      onDismiss,
      listLabel,
      listRef,
      options,
      onKeyDown,
      ...inputProps
    },
    ref,
  ) {
    const listId = useId();
    const anchorRef = useRef<HTMLDivElement>(null);

    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverAnchor asChild>
          <div ref={anchorRef} className="relative">
            <Input
              autoComplete="off"
              {...inputProps}
              ref={ref}
              type="text"
              role="combobox"
              aria-controls={listId}
              aria-expanded={open}
              aria-activedescendant={
                open && activeKey !== null
                  ? optionId(listId, activeKey)
                  : undefined
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  onStep(1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  onStep(-1);
                } else if (event.key === "Enter" && open) {
                  if (onPick()) event.preventDefault();
                } else if (event.key === "Escape" && open) {
                  // The list closes, not the dialog the field sits in.
                  event.stopPropagation();
                  onDismiss();
                }
                onKeyDown?.(event);
              }}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-40 p-1"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // A press on the list keeps focus in the field, so its blur
          // doesn't close the list before the click lands.
          onMouseDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            const target = event.target as Node | null;
            if (target && anchorRef.current?.contains(target)) {
              event.preventDefault();
            }
          }}
        >
          <ListIdContext.Provider value={listId}>
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={listLabel}
              className="max-h-60 overflow-y-auto"
            >
              {options}
            </ul>
          </ListIdContext.Provider>
        </PopoverContent>
      </Popover>
    );
  },
);

type ComboboxOptionProps = Omit<
  React.ComponentProps<"li">,
  "id" | "role" | "onClick"
> & {
  /** Unique in the list and safe in an id; `activeKey` names it. */
  optionKey: string;
  highlighted: boolean;
  /**
   * The field's held value: drawn in the accent and announced as selected.
   * Left out where nothing is held, the highlight is what's announced.
   */
  selected?: boolean;
  onPick: () => void;
};

export function ComboboxOption({
  optionKey,
  highlighted,
  selected,
  onPick,
  className,
  ...props
}: ComboboxOptionProps) {
  const listId = useContext(ListIdContext);
  return (
    <li
      {...props}
      id={optionId(listId, optionKey)}
      role="option"
      aria-selected={selected ?? highlighted}
      onClick={onPick}
      className={cn(
        "flex min-h-8 cursor-pointer items-center rounded-md px-2 text-sm pointer-coarse:min-h-11",
        selected
          ? "bg-accent-subtle font-semibold text-accent-text"
          : highlighted
            ? "bg-card-hover"
            : "hover:bg-card-hover",
        className,
      )}
    />
  );
}

function optionId(listId: string, key: string): string {
  return `${listId}-${key}`;
}
