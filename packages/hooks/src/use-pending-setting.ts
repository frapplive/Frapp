import { useCallback, useRef, useState } from "react";

/** A queued pick a newer pick replaced before it was sent. */
const SKIPPED = Symbol("skipped");

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
 *
 * Sends of one setting run one at a time, in the order picked: each waits
 * for the one before it to settle, so the server never applies two quick
 * flips out of order and keeps the first. A pick still waiting its turn when
 * a newer one comes is never sent; it resolves with the newer one's result.
 */
export function usePendingSetting<T>(
  stored: T,
  send: (next: T) => Promise<boolean>,
): readonly [shown: T, change: (next: T) => Promise<boolean>, saving: boolean] {
  const [pending, setPending] = useState<{ value: T } | null>(null);
  const latest = useRef(0);
  // The last send queued, until it settles; null while none is.
  const queue = useRef<Promise<void> | null>(null);
  // The newest pick's own result, for a pick it replaced.
  const newest = useRef<Promise<boolean>>(Promise.resolve(true));
  const change = useCallback(
    (next: T): Promise<boolean> => {
      const ticket = ++latest.current;
      setPending({ value: next });
      // A newer pick waiting behind this one is the only one worth sending.
      const start = (): Promise<boolean> | typeof SKIPPED =>
        ticket === latest.current ? send(next) : SKIPPED;
      const prior = queue.current;
      const turn: Promise<boolean | typeof SKIPPED> = prior
        ? prior.then<boolean | typeof SKIPPED>(start)
        : new Promise((resolve) => resolve(start()));
      const settled = turn.then(
        () => undefined,
        () => undefined,
      );
      queue.current = settled;
      void settled.then(() => {
        if (queue.current === settled) queue.current = null;
      });
      const result = (async () => {
        try {
          const outcome = await turn;
          return outcome === SKIPPED ? await newest.current : outcome;
        } finally {
          if (ticket === latest.current) setPending(null);
        }
      })();
      newest.current = result;
      return result;
    },
    [send],
  );
  return [pending ? pending.value : stored, change, pending !== null] as const;
}
