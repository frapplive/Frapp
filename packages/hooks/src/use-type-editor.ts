import { useEffect, useState } from "react";
import { errorCopy } from "./error-copy";

/**
 * What the Type menu (web) and Type sheet (phone) hand one type's edit view
 * (`spec/ui/design-system/components.md` § Type menu).
 */
export interface TypeEditorHandle {
  /** Back to the list. */
  done: () => void;
  /**
   * The editor's latest save-and-leave, which the menu runs when it closes or
   * on Escape. It resolves to null once left, or to why it couldn't save.
   */
  setLeave: (leave: (() => Promise<string | null>) | null) => void;
}

/**
 * The state every type's edit view keeps, on both apps: a save-and-leave that
 * skips an unchanged draft and says a refused save in place (staying in the
 * view), and a delete that leaves once it lands.
 */
export function useTypeEditor({
  handle,
  changed,
  save,
  remove,
}: {
  handle: TypeEditorHandle;
  /** Whether the draft differs from the type. */
  changed: boolean;
  /** Saves the draft; returns an inline refusal, or null once saved. */
  save: () => Promise<string | null>;
  remove: () => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function leave(): Promise<string | null> {
    if (saving) return null;
    if (!changed) {
      handle.done();
      return null;
    }
    setSaving(true);
    let refused: string | null;
    try {
      refused = await save();
    } catch (cause) {
      refused = errorCopy(cause, "Couldn't save the type. Try again.");
    } finally {
      setSaving(false);
    }
    if (refused) setError(refused);
    else handle.done();
    return refused;
  }
  // The menu runs the latest save when it closes, or on Escape.
  useEffect(() => {
    handle.setLeave(leave);
  });

  async function onDelete() {
    setDeleting(true);
    try {
      await remove();
      handle.done();
    } catch (cause) {
      setError(errorCopy(cause, "Couldn't delete the type. Try again."));
    } finally {
      setDeleting(false);
    }
  }

  return {
    error,
    clearError: () => setError(null),
    saving,
    deleting,
    leave: () => void leave(),
    onDelete: () => void onDelete(),
  };
}
