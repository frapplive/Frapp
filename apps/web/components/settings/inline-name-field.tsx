"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * A name edited where it shows (a recruitment stage, a tag): it saves on
 * Enter or on leaving the field, and Escape puts the old name back (rulebook
 * § 9, "typed text on Enter or leaving the field"). A new one left blank is
 * dropped through `onCancel`. Drawn borderless until hovered or focused, so a
 * list of names reads as a list, not a form. Key it on the saved name so a
 * rename from elsewhere replaces what it shows.
 */
export function InlineNameField({
  label,
  maxLength,
  placeholder,
  autoFocus = false,
  describedBy,
  onCommit,
  onCancel,
}: {
  /** The saved name; empty for a new one. */
  label: string;
  maxLength: number;
  placeholder?: string;
  autoFocus?: boolean;
  describedBy?: string;
  onCommit: (label: string) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(label);
  function commit() {
    const next = text.trim();
    if (!next) {
      setText(label);
      onCancel?.();
      return;
    }
    if (next !== label) onCommit(next);
  }
  return (
    <Input
      value={text}
      autoFocus={autoFocus}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-label={label ? `Rename ${label}` : (placeholder ?? "Name")}
      aria-describedby={describedBy}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setText(label);
          onCancel?.();
        }
      }}
      className="h-9 min-w-0 flex-1 border-transparent bg-transparent px-2 hover:border-control-edge focus-visible:border-control-edge"
    />
  );
}
