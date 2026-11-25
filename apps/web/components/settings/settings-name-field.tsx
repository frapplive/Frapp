"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The name field that leads a settings page opened from a row (a tier, a
 * pledge class, a member field; #6029): "fields on top", as the Chapter tab
 * leads with its name (`spec/ui/design-system/components.md` § Settings rows).
 *
 * It saves on its own, the way the settings spec says typed text does: on
 * Enter or on leaving the field, then a quiet "Saved" beside the label;
 * Escape puts the saved name back. A blank name is never sent. Read-only
 * (`disabled`) for a viewer who can't change it. Key it on the saved name so a
 * rename from elsewhere replaces what it shows.
 */
export function SettingsNameField({
  value,
  maxLength,
  disabled = false,
  label = "Name",
  onSave,
}: {
  /** The saved name. */
  value: string;
  maxLength: number;
  disabled?: boolean;
  label?: string;
  /** Resolves true once saved; false leaves the typed name for another try. */
  onSave: (next: string) => Promise<boolean>;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function commit() {
    const next = text.trim();
    if (!next) {
      setText(value);
      return;
    }
    if (next === value || saving) return;
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (!ok) return;
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="grid max-w-md gap-1.5">
      <div className="flex items-baseline gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span
          role="status"
          className="text-caption text-muted-foreground"
          aria-live="polite"
        >
          {saved ? "Saved" : ""}
        </span>
      </div>
      <Input
        id={id}
        value={text}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(event) => {
          setText(event.target.value);
          setSaved(false);
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setText(value);
          }
        }}
      />
    </div>
  );
}
