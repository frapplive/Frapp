"use client";

import { forwardRef, useState } from "react";
import { ComboboxField, ComboboxOption } from "@/components/ui/combobox";

type SuggestFieldProps = Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "type"
> & {
  value: string;
  onChange: (value: string) => void;
  /**
   * What to offer under the field for what is typed now, worked out by the
   * caller (`majorSuggestions` for a major). An empty list closes it.
   */
  suggestions: readonly string[];
  /** The list's name for a screen reader ("Majors in your chapter"). */
  suggestionsLabel: string;
};

/**
 * A free-text field that offers what others already wrote under it (#5778),
 * the way Gmail's To field and Slack's channel-name box suggest an existing
 * entry while still taking a new one: type anything, or press a suggestion
 * (arrow keys and Enter work too) to take its exact spelling. Shares
 * `ComboboxField` with `TimeField` (#5795): the list floats over the form and never moves
 * it, and focus stays in the field (WAI-ARIA combobox, list autocomplete).
 */
export const SuggestField = forwardRef<HTMLInputElement, SuggestFieldProps>(
  function SuggestField(
    {
      value,
      onChange,
      suggestions,
      suggestionsLabel,
      onBlur,
      onFocus,
      onKeyDown,
      className,
      disabled,
      ...inputProps
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    // Closed by Escape or a pick until the next keystroke.
    const [dismissed, setDismissed] = useState(false);
    const [active, setActive] = useState<number | null>(null);
    const open =
      focused && !dismissed && !disabled && suggestions.length > 0;
    const highlighted =
      active !== null && active < suggestions.length ? active : null;

    const pick = (suggestion: string) => {
      onChange(suggestion);
      setActive(null);
      setDismissed(true);
    };

    const step = (by: number) => {
      if (suggestions.length === 0) return;
      setDismissed(false);
      setActive((current) =>
        current === null || current >= suggestions.length
          ? by > 0
            ? 0
            : suggestions.length - 1
          : (current + by + suggestions.length) % suggestions.length,
      );
    };

    return (
      <ComboboxField
        {...inputProps}
        ref={ref}
        open={open}
        aria-autocomplete="list"
        activeKey={highlighted === null ? null : String(highlighted)}
        onStep={step}
        onPick={() => {
          const suggestion =
            highlighted === null ? undefined : suggestions[highlighted];
          if (suggestion === undefined) return false;
          pick(suggestion);
          return true;
        }}
        onDismiss={() => {
          setDismissed(true);
          setActive(null);
        }}
        listLabel={suggestionsLabel}
        disabled={disabled}
        value={value}
        className={className}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          setDismissed(false);
          setActive(null);
          onChange(event.target.value);
        }}
        onBlur={(event) => {
          setFocused(false);
          setActive(null);
          setDismissed(false);
          onBlur?.(event);
        }}
        options={suggestions.map((suggestion, index) => (
          <ComboboxOption
            key={suggestion}
            optionKey={String(index)}
            highlighted={index === highlighted}
            onPick={() => pick(suggestion)}
          >
            <span className="truncate">{suggestion}</span>
          </ComboboxOption>
        ))}
      />
    );
  },
);
