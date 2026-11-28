import { useState } from "react";

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Settings rows that save on their own (#6031, rulebook § 9), on either app:
 * a row shows the value it was given from the moment it changes until the
 * live record agrees, not only while its request is out. A channel's save
 * invalidates the list without waiting for the refetch, so a switch that
 * showed only the request's value flipped back to the old one between the
 * save and the refetch, and stayed there if the refetch failed; a second
 * press then sent the opposite and undid the save.
 *
 * `live` is the record's current values, by the field names `save` is given.
 * A held value the live record matches is let go, so a later change made
 * elsewhere shows as it arrives.
 */
export function useHeldRowSaves(live: Record<string, unknown>) {
  const [saving, setSaving] = useState<Record<string, unknown> | null>(null);
  const [held, setHeld] = useState<Record<string, unknown>>({});

  const settled = Object.keys(held).filter((field) =>
    same(live[field], held[field]),
  );
  if (settled.length > 0) {
    setHeld((current) => {
      const next = { ...current };
      for (const field of settled) delete next[field];
      return next;
    });
  }

  /** What a row shows for `field`: the value being saved or just saved, else the live one. */
  function shown<T>(field: string): T {
    if (saving && field in saving) return saving[field] as T;
    if (field in held) return held[field] as T;
    return live[field] as T;
  }

  /**
   * Saves `values` (the fields the rows show) by running `request`. Resolves
   * to `null` when it landed, or to the error, which the caller words.
   */
  async function save(
    values: Record<string, unknown>,
    request: () => Promise<unknown>,
  ): Promise<unknown> {
    setSaving(values);
    try {
      await request();
      setHeld((current) => ({ ...current, ...values }));
      return null;
    } catch (error) {
      return error ?? new Error("save failed");
    } finally {
      setSaving(null);
    }
  }

  return { shown, save, busy: saving !== null };
}
