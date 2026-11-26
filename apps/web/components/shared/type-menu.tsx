"use client";

import React, {
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { ArrowLeft, Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  addTypeLabel,
  editTypeLabel,
  TYPE_DELETE,
  TYPE_FIND,
  TYPE_FIND_OR_ADD,
  TYPE_NO_MATCH,
  TYPE_NONE,
  TYPE_SEARCH_FROM,
  typeMatchesSearch,
} from "@repo/validation";
import type { TypeEditorHandle } from "@repo/hooks";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, getErrorMessage } from "@/lib/utils";

/**
 * The one Type menu (`spec/ui/design-system/components.md` § Type menu): a
 * chapter's own list of types, picked, made, renamed and deleted from the
 * menu that applies them, for event types and document types alike (Paul
 * 2026-11-22, at the "Edit types" popover this replaced: "yo what is this?").
 *
 * - The search finds a type; for someone who can add one it reads "Find or
 *   add a type", and a name no type has yet offers `Create “Accreditation”`.
 * - "No type" leads the list while the search is empty.
 * - For someone who can manage the list, each row has an edit button (on
 *   hover or focus; always under a finger) that turns the menu into that
 *   type's edit view: its name, whatever else the caller's type carries, and
 *   Delete type, confirmed in place. Leaving the view (its back arrow, Enter,
 *   Escape, or closing the menu) saves what changed.
 *
 * Comparable: Notion's select options (search, "Create", and each option's
 * own edit view inside the menu) and Linear's label menu. NN/g's guidance on
 * combo boxes: one field that searches and creates beats a row of chips plus a
 * separate editor.
 */

/** What every type in the menu carries. */
export interface TypeMenuItem {
  id: string;
  name: string;
}

export function TypeMenu<T extends TypeMenuItem>({
  trigger,
  label,
  types,
  isHeld,
  heldNewName = null,
  onPick,
  toAdd,
  onCreate,
  describe,
  renderEditor,
  align = "start",
}: {
  /** The field that shows the held type; it becomes the menu's trigger. */
  trigger: ReactElement;
  /** The menu's accessible name ("Event type"). */
  label: string;
  types: readonly T[];
  /** Whether this type is the one held. */
  isHeld: (type: T) => boolean;
  /**
   * A name held that is not on the list yet (a document type the upload will
   * add): drawn first, checked, so the menu agrees with its field.
   */
  heldNewName?: string | null;
  /** `null` for No type. */
  onPick: (type: T | null) => void;
  /** What `Create “…”` would make from the search, or null; absent when nobody here can add. */
  toAdd?: (typed: string) => string | null;
  /** Makes (or holds) the typed type; a thrown error is said in the menu. */
  onCreate?: (name: string) => Promise<void> | void;
  /** A muted line beside a type's name ("10 points · Required"). */
  describe?: (type: T) => string;
  /** The edit view for one type; absent when the list can't be managed here. */
  renderEditor?: (type: T, handle: TypeEditorHandle) => ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const leaveRef = useRef<(() => Promise<string | null>) | null>(null);
  const canAdd = toAdd !== undefined && onCreate !== undefined;
  const showSearch = canAdd || types.length > TYPE_SEARCH_FROM;
  const adding = canAdd ? toAdd(search) : null;
  const editing =
    editingId === null
      ? null
      : (types.find((type) => type.id === editingId) ?? null);
  // Filtered here, by name only, as the phone's sheet filters: cmdk's own
  // fuzzy match would also match letters in each type's id.
  const searching = search.trim() !== "";
  const shown = types.filter((type) => typeMatchesSearch(type.name, search));

  function reset() {
    setSearch("");
    setCreateError(null);
    setEditingId(null);
    leaveRef.current = null;
  }

  function setMenuOpen(next: boolean) {
    const leave = editing ? leaveRef.current : null;
    if (!next && leave) {
      // An open edit saves first; a refused or failed save keeps the menu
      // open on the edit view, saying why, rather than closing on a loss.
      void leave().then((refused) => {
        if (refused !== null) return;
        setOpen(false);
        reset();
      });
      return;
    }
    setOpen(next);
    if (!next) reset();
  }

  function pick(type: T | null) {
    onPick(type);
    setMenuOpen(false);
  }

  async function create(name: string) {
    if (!onCreate || creating) return;
    setCreateError(null);
    setCreating(true);
    try {
      await onCreate(name);
      setMenuOpen(false);
    } catch (error) {
      setCreateError(
        getErrorMessage(error, "Couldn't make the type. Try again."),
      );
    } finally {
      setCreating(false);
    }
  }

  const handle: TypeEditorHandle = {
    done: () => {
      leaveRef.current = null;
      setEditingId(null);
    },
    setLeave: (leave) => {
      leaveRef.current = leave;
    },
  };

  return (
    <Popover open={open} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
        onEscapeKeyDown={(event) => {
          // Escape steps back out of an edit view before it closes the menu.
          if (editing) {
            event.preventDefault();
            void leaveRef.current?.();
          }
        }}
      >
        {editing && renderEditor ? (
          // eslint-disable-next-line react-hooks/refs -- `handle.setLeave` writes the ref from the editor's effect; the menu reads it on close or Escape, never during render
          renderEditor(editing, handle)
        ) : (
          <Command label={label} shouldFilter={false}>
            {showSearch ? (
              <CommandInput
                placeholder={canAdd ? TYPE_FIND_OR_ADD : TYPE_FIND}
                value={search}
                onValueChange={(next) => {
                  setSearch(next);
                  setCreateError(null);
                }}
              />
            ) : null}
            <CommandList className="max-h-72">
              {adding ? null : <CommandEmpty>{TYPE_NO_MATCH}</CommandEmpty>}
              <CommandGroup>
                {searching ? null : (
                  <CommandItem
                    value={TYPE_NONE}
                    onSelect={() => pick(null)}
                    className={cn(ROW, "text-muted-foreground")}
                  >
                    <HeldMark
                      held={
                        heldNewName === null &&
                        !types.some((type) => isHeld(type))
                      }
                    />
                    {TYPE_NONE}
                  </CommandItem>
                )}
                {heldNewName !== null &&
                typeMatchesSearch(heldNewName, search) ? (
                  <CommandItem
                    value={`held ${heldNewName}`}
                    onSelect={() => setMenuOpen(false)}
                    className={ROW}
                  >
                    <HeldMark held />
                    <span className="min-w-0 flex-1 truncate">
                      {heldNewName}
                    </span>
                    <span className="shrink-0 text-caption text-muted-foreground">
                      New
                    </span>
                  </CommandItem>
                ) : null}
                {shown.map((type) => (
                  <CommandItem
                    key={type.id}
                    value={type.id}
                    onSelect={() => pick(type)}
                    className={cn(ROW, "group")}
                  >
                    <HeldMark held={isHeld(type)} />
                    <span className="min-w-0 flex-1 truncate">{type.name}</span>
                    {describe ? (
                      <span className="shrink-0 text-caption text-muted-foreground">
                        {describe(type)}
                      </span>
                    ) : null}
                    {renderEditor ? (
                      <IconButton
                        label={editTypeLabel(type.name)}
                        className={cn(
                          "-my-1 -mr-1 shrink-0 opacity-0 group-hover:opacity-100 group-data-[selected=true]:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
                        )}
                        onPointerDown={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          // cmdk takes Enter at its root to pick the selected
                          // row; on this button Enter opens the type instead.
                          if (event.key !== "Enter") return;
                          event.stopPropagation();
                          event.preventDefault();
                          setEditingId(type.id);
                        }}
                        onClick={(event) => {
                          // The row picks the type; this button opens it instead.
                          event.stopPropagation();
                          event.preventDefault();
                          setEditingId(type.id);
                        }}
                      >
                        <Pencil />
                      </IconButton>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
              {adding ? (
                <CommandGroup>
                  <CommandItem
                    value={`create ${adding}`}
                    disabled={creating}
                    onSelect={() => void create(adding)}
                    className={ROW}
                  >
                    {creating ? (
                      <Loader2
                        className="h-4 w-4 animate-spin text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <Plus
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {addTypeLabel(adding)}
                    </span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
            {createError ? (
              <p
                role="alert"
                className="border-t border-border px-3 py-2 text-caption text-destructive-text"
              >
                {createError}
              </p>
            ) : null}
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

const ROW = "min-h-control-list-row gap-2 text-sm pointer-coarse:min-h-11";

function HeldMark({ held }: { held: boolean }) {
  return (
    <span className="w-4 shrink-0 text-accent-text" aria-hidden="true">
      {held ? <Check className="h-4 w-4" /> : null}
    </span>
  );
}

/**
 * One type's edit view inside the menu: a back arrow beside its name, the
 * caller's other fields, then Delete type, confirmed in place with what it
 * does to the records that carry it. Enter, the back arrow and Escape all
 * leave through `onLeave`, which saves what changed.
 */
export function TypeEditPane({
  id,
  name,
  nameMaxLength,
  onNameChange,
  error,
  saving,
  onLeave,
  deleteConsequence,
  deletePending,
  onDelete,
  children,
}: {
  id: string;
  name: string;
  nameMaxLength: number;
  onNameChange: (name: string) => void;
  error: string | null;
  saving: boolean;
  onLeave: () => void;
  /** What deleting does, said while it is being confirmed. */
  deleteConsequence: string;
  deletePending: boolean;
  onDelete: () => void;
  children?: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <form
      className="grid"
      // Enter in any field leaves (and saves); a form of two fields with no
      // submit button would otherwise ignore it.
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        if (!(event.target instanceof HTMLInputElement)) return;
        event.preventDefault();
        onLeave();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        // The menu is portalled, but React bubbles the submit up its own tree
        // to any form around the trigger (the upload panel), which it would send.
        event.stopPropagation();
      }}
    >
      <div className="grid gap-2 px-2 py-2">
        <div className="flex items-end gap-1">
          <IconButton
            type="button"
            label="Back to types"
            onClick={onLeave}
            disabled={saving}
            className="shrink-0"
          >
            {saving ? <Loader2 className="animate-spin" /> : <ArrowLeft />}
          </IconButton>
          <div className="grid min-w-0 flex-1 gap-1">
            <Label htmlFor={`${id}-name`} className="sr-only">
              Name
            </Label>
            <Input
              id={`${id}-name`}
              autoFocus
              value={name}
              maxLength={nameMaxLength}
              onChange={(event) => onNameChange(event.target.value)}
              aria-invalid={error ? true : undefined}
            />
          </div>
        </div>
        {children ? <div className="grid gap-2 pl-10">{children}</div> : null}
        {error ? (
          <p role="alert" className="pl-10 text-caption text-destructive-text">
            {error}
          </p>
        ) : null}
      </div>
      <div className="border-t border-border px-2 py-1.5">
        {confirming ? (
          <div className="flex items-center gap-2 pl-2">
            <p className="min-w-0 flex-1 text-caption text-muted-foreground">
              {deleteConsequence}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deletePending}
              onClick={onDelete}
            >
              {deletePending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive-text hover:text-destructive-text"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="h-4 w-4" />
            {TYPE_DELETE}
          </Button>
        )}
      </div>
    </form>
  );
}
