"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Search } from "lucide-react";
import { useChannels } from "@repo/hooks";
import { cn } from "@/lib/utils";
import { FOCUS_RING_SHELL } from "@/components/ui/focus";
import {
  COUNCIL_FIND_PLACEHOLDER,
  FindDialog,
  FIND_PLACEHOLDER,
} from "@/components/layout/find-dialog";
import { useIsCouncil } from "@/lib/hooks/use-tenant-kind";

/**
 * Find: the centered Find dialog (`find-dialog.tsx`), the Cmd/Ctrl+F and
 * Cmd/Ctrl+K bindings that open it, and the two visible ways in. From `lg` up that is the
 * sidebar's Search row (`sidebar.tsx`, #5946); below it, where the sidebar is
 * a drawer, the top bar keeps the field-shaped button (`FindField`).
 *
 * `FindProvider` wraps the shell and owns the dialog, so there is one dialog
 * and one query whichever entry opened it, and the shortcut works on every
 * route. `useFind` is how an entry opens it.
 *
 * **Each entry is visible because the shortcut is not advertised** (Paul
 * removed the keycap, 2026-11-05), so a member who never presses it still
 * sees where search lives. On the field, clicking it, pressing Enter or
 * Space on it, or simply typing while it has focus (as one would into the
 * field it looks like) lands in the dialog's own input.
 *
 * **Taking over Cmd/Ctrl+F is deliberate.** It is the key people already
 * press to find something, and in an app whose content is paginated and
 * virtualized, the browser's own in-page find searches only what happens to
 * be mounted. `components.md` §7 bans a hint for a binding that is NOT wired;
 * an unadvertised binding that is wired breaks nothing.
 *
 * **It only searches** (#5476, Paul, 2026-11-18). From #4904 (2026-11-13) it
 * read "Search or ask Frapp" for a member with Ask and its dialog asked too;
 * Frapp Intelligence has its own page, which New opens.
 *
 * The query lives here, not in the dialog, so closing the dialog (Escape or a
 * click outside) and reopening it keeps what was typed.
 */
/** Apple's platforms, where Ctrl+K is a text field's "delete to end of line". */
function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

/**
 * Whether a K chord pressed inside a text field is the jump key: Cmd+K on a
 * Mac, Ctrl+K elsewhere. A Mac's plain Ctrl+K stays the field's own.
 */
function isJumpChordInText(event: KeyboardEvent): boolean {
  return isApplePlatform() ? event.metaKey : event.ctrlKey;
}

type FindEntry = {
  open: boolean;
  query: string;
  /**
   * Opens Find. `returnTo` takes focus back when it closes (the control that
   * opened it); `typed` is a key pressed on the field, which starts or
   * extends the query instead of selecting it.
   */
  openFind: (options?: {
    returnTo?: HTMLElement | null;
    typed?: string;
  }) => void;
};

const FindContext = createContext<FindEntry | null>(null);

/** The way into Find, from inside the dashboard shell. */
export function useFind(): FindEntry {
  const entry = useContext(FindContext);
  if (!entry) throw new Error("useFind must be used inside FindProvider");
  return entry;
}

export function FindProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // False only when a keystroke on the field opened the dialog; see FindDialog.
  const [selectOnOpen, setSelectOnOpen] = useState(true);
  /*
   * Read here, while the dialog is closed, on purpose. It keeps `["channels"]`
   * warm on every dashboard route, so the dialog's Channels group is instant
   * on the first keystroke, and `use-first-chunk-cache.ts` documents relying
   * on this read having resolved before `/chat` mounts.
   */
  useChannels();
  const inputRef = useRef<HTMLInputElement | null>(null);
  /*
   * Where focus goes back to on close. Radix returns focus to a
   * `Dialog.Trigger`, and this dialog has none (the shortcut opens it from
   * anywhere), so without this focus lands on <body> and the next Tab starts
   * from the top of the document. A shortcut press returns to wherever the
   * member was; a click returns to the control that was clicked.
   */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Read inside the window listener, which is bound once.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "f" && key !== "k") return;
      // `repeat` guard: holding the chord should open once, not re-fire.
      if (event.repeat) return;
      // Already open: the chord means "back to the search text".
      if (openRef.current) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }
      /*
       * Stand down inside another modal layer, and hand the chord back to the
       * browser. Opening a second modal over a sheet or dialog would stack
       * focus traps, and native find is the more useful of the two in a long
       * form anyway.
       */
      if (document.querySelector("[data-radix-focus-guard]")) return;
      const active = document.activeElement;
      const inTextField =
        active instanceof HTMLElement &&
        (active.isContentEditable ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "INPUT");
      if (inTextField && (key === "f" || !isJumpChordInText(event))) {
        // Someone is typing somewhere else (the chat composer, a form field).
        // Stealing the caret mid-sentence is worse than not binding at all.
        // Cmd/Ctrl+K is the jump key (#6053), so it opens Find from the
        // composer too, as Slack's and Discord's do, and focus goes back
        // there on close; but a Mac's plain Ctrl+K deletes to the end of
        // the line in a text field, so there only Cmd+K does.
        return;
      }
      event.preventDefault();
      returnFocusRef.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null;
      // The jump key opens Find empty, on the unread and recently opened
      // channels (#6053); Cmd/Ctrl+F and the Search row keep what was typed.
      if (key === "k") setQuery("");
      setSelectOnOpen(true);
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onOpenChange = useCallback((next: boolean) => setOpen(next), []);
  const restoreFocus = useCallback(() => {
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) target.focus();
  }, []);
  const openFind = useCallback<FindEntry["openFind"]>((options) => {
    returnFocusRef.current = options?.returnTo ?? null;
    const typed = options?.typed;
    if (typed === undefined) {
      setSelectOnOpen(true);
    } else {
      // The first key replaces a kept query, like typing over the selected
      // text the dialog would show; a fast second one, landing before the
      // dialog's input takes focus, appends to it.
      setQuery((previous) => (openRef.current ? previous + typed : typed));
      setSelectOnOpen(false);
    }
    setOpen(true);
  }, []);
  const entry = useMemo<FindEntry>(
    () => ({ open, query, openFind }),
    [open, query, openFind],
  );

  return (
    <FindContext.Provider value={entry}>
      {children}
      <FindDialog
        open={open}
        onOpenChange={onOpenChange}
        query={query}
        onQueryChange={setQuery}
        inputRef={inputRef}
        onCloseFocus={restoreFocus}
        selectOnOpen={selectOnOpen}
      />
    </FindContext.Provider>
  );
}

/**
 * The top bar's field-shaped Find button, below `lg`. It looks like a field
 * because it is the visible way in there.
 */
export function FindField({ className }: { className?: string }) {
  const { open, query, openFind } = useFind();
  // A council's Find lists its channels alone (#5933).
  const placeholder = useIsCouncil()
    ? COUNCIL_FIND_PLACEHOLDER
    : FIND_PLACEHOLDER;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={placeholder}
      onClick={(event) => openFind({ returnTo: event.currentTarget })}
      onKeyDown={(event) => {
        if (event.key.length !== 1 || event.key === " ") return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        openFind({ returnTo: event.currentTarget, typed: event.key });
      }}
      className={cn(
        "flex h-control-field items-center gap-2.5 rounded-[10px] pointer-coarse:h-11 border border-control-edge bg-surface-1 px-3 text-left text-sm text-muted-foreground transition hover:text-foreground",
        FOCUS_RING_SHELL,
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        {query.trim() ? (
          <span className="text-foreground">{query}</span>
        ) : (
          placeholder
        )}
      </span>
    </button>
  );
}
