"use client";

import { type HTMLAttributes, useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A typed setting that saves on its own, the way the settings spec says typed
 * text does (`spec/ui/design-system/components.md` § Settings rows; #6033):
 * on Enter or on leaving the field, then a quiet "Saved" beside the label;
 * Escape puts the saved text back. A blank entry puts the saved text back
 * unless `allowBlank` (a vocabulary word cleared back to the type's).
 *
 * `validate` refuses text the setting can't take (a founded year out of
 * range): its words show under the field, nothing is sent, and the typed text
 * stays for a fix. A save that fails says so through the page's toast and
 * keeps the typed text for another try.
 *
 * Read-only (`disabled`) for a viewer who can't change it. A change made
 * elsewhere replaces what it shows while the field isn't being edited; it
 * isn't keyed on the value, so its own save keeps its focus and its "Saved".
 */
export function SettingsTextField({
  value,
  label,
  maxLength,
  disabled = false,
  allowBlank = false,
  validate,
  placeholder,
  type,
  inputMode,
  id: idProp,
  className,
  inputClassName,
  onTextChange,
  onSave,
}: {
  /** The saved text. */
  value: string;
  label: string;
  maxLength?: number;
  disabled?: boolean;
  allowBlank?: boolean;
  /** What's wrong with the trimmed text, or `null` when it can be saved. */
  validate?: (next: string) => string | null;
  placeholder?: string;
  type?: "text" | "url";
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  id?: string;
  /** The field's width and place in its grid. */
  className?: string;
  inputClassName?: string;
  /** Every keystroke, for a preview drawn from what is being typed. */
  onTextChange?: (text: string) => void;
  /** Resolves true once saved; false leaves the typed text for another try. */
  onSave: (next: string) => Promise<boolean>;
}) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const errorId = `${id}-error`;
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focused = useRef(false);
  // The text this field last saved, until the saved value catches up: Enter
  // then leaving the field would otherwise send it twice while a refetch is
  // still on its way.
  const sent = useRef<string | null>(null);
  useEffect(() => {
    sent.current = null;
    if (focused.current) return;
    setText(value);
    onTextChange?.(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the saved value only
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function show(next: string) {
    setText(next);
    onTextChange?.(next);
  }

  async function commit() {
    const next = text.trim();
    if (!next && !allowBlank) {
      show(value);
      setProblem(null);
      return;
    }
    const refused = validate?.(next) ?? null;
    setProblem(refused);
    if (refused || next === value.trim() || next === sent.current || saving)
      return;
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (!ok) return;
    sent.current = next;
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className={cn("grid max-w-md gap-1.5", className)}>
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
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClassName}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? errorId : undefined}
        onChange={(event) => {
          show(event.target.value);
          setSaved(false);
          // What was wrong shows again only once the field is left again.
          setProblem(null);
        }}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          void commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            show(value);
            setProblem(null);
          }
        }}
      />
      {problem ? (
        <p id={errorId} role="alert" className="text-xs text-destructive-text">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The name field that leads a settings page opened from a row (a tier, a
 * pledge class, a member field; #6029): "fields on top", as the Chapter tab
 * leads with its name. A {@link SettingsTextField} that never sends a blank
 * name.
 */
export function SettingsNameField({
  value,
  maxLength,
  disabled = false,
  label = "Name",
  onSave,
}: {
  value: string;
  maxLength: number;
  disabled?: boolean;
  label?: string;
  onSave: (next: string) => Promise<boolean>;
}) {
  return (
    <SettingsTextField
      value={value}
      label={label}
      maxLength={maxLength}
      disabled={disabled}
      onSave={onSave}
    />
  );
}
