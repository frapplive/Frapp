"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Plus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCUS_RING } from "@/components/ui/focus";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ADD_ROW =
  "flex min-h-control-settings-row pointer-coarse:min-h-11 w-full items-center gap-4 px-4 py-1.5 text-left text-sm font-medium text-foreground transition hover:bg-card-hover disabled:opacity-50 group-first:rounded-t-[13px] group-last:rounded-b-[13px]";

/**
 * The last row of a settings list that adds to it ("Add role", "New group",
 * "Add pledge class"): a plus and the verb, which opens a name field in
 * place. Enter adds it and the row closes; Escape or Cancel closes it.
 * Discord adds a role or an onboarding question in place the same way.
 * It sits inside a `SettingsGroup`, so it draws its own `<li>`.
 */
export function SettingsAddRow({
  label,
  inputLabel,
  placeholder,
  maxLength,
  submitLabel = label,
  full,
  icon: Icon = Plus,
  onAdd,
}: {
  /** The row's glyph: a plus, or what it adds ("Add tier" draws layers). */
  icon?: LucideIcon;
  /** The row's verb: "Add role". */
  label: string;
  /** The name field's accessible name: "New role name". */
  inputLabel: string;
  placeholder?: string;
  maxLength: number;
  /** The button that adds it, when it differs from the row's words. */
  submitLabel?: string;
  /** The list holds as many as it may: the row dims and says so. */
  full?: string | null;
  /** Resolves true once added, which clears and closes the field. */
  onAdd: (name: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setPending(true);
    const ok = await onAdd(trimmed);
    setPending(false);
    if (!ok) return;
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <li className="group">
        <button
          type="button"
          disabled={!!full}
          onClick={() => setOpen(true)}
          className={cn(ADD_ROW, FOCUS_RING)}
        >
          <Icon
            className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {label}
            {full ? (
              <span className="text-caption font-normal text-muted-foreground">
                {full}
              </span>
            ) : null}
          </span>
        </button>
      </li>
    );
  }
  return (
    <li className="px-4 py-2">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          aria-label={inputLabel}
          placeholder={placeholder}
          value={name}
          maxLength={maxLength}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              // Only the field closes, not a surface around it.
              event.stopPropagation();
              setOpen(false);
            }
          }}
          className="max-w-xs"
        />
        <Button type="submit" size="sm" disabled={!name.trim() || pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </form>
    </li>
  );
}
