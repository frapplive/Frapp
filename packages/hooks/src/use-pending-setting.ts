import { useCallback, useRef, useState } from "react";

/**
 * A setting that saves the moment it changes (a switch, a picker; rulebook
 * § 9, "Settings save on their own", #6033): shows the picked value while its
 * save is in flight, then the stored one again. So a refused save falls back
 * to what is stored with nothing to undo, and a change another officer made
 * shows as soon as it is read.
 *
 * `send` resolves true once the save landed and the stored value was read
 * back (its mutation returns the re-read's promise), false when it failed and
 * the caller has already said so. Only the latest pick clears the pending
 * value, so a quick second change isn't overwritten by the first one's reply.
 */
export function usePendingSetting<T>(
  stored: T,
  send: (next: T) => Promise<boolean>,
): readonly [shown: T, change: (next: T) => Promise<boolean>, saving: boolean] {
  const [pending, setPending] = useState<{ value: T } | null>(null);
  const latest = useRef(0);
  const change = useCallback(
    async (next: T) => {
      const ticket = ++latest.current;
      setPending({ value: next });
      try {
        return await send(next);
      } finally {
        if (ticket === latest.current) setPending(null);
      }
    },
    [send],
  );
  return [pending ? pending.value : stored, change, pending !== null] as const;
}
