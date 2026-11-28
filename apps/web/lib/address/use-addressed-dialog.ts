"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  useGatedDialog,
  type GatedDialog,
  type SubscriptionGate,
} from "@/components/shared/subscription-gate";
import { useAddressParams } from "./use-address-params";

export type AddressedDialog = Omit<GatedDialog, "setOpen"> & {
  /**
   * Opens (pushes `name=value`, or replaces with it given `replace`, for a
   * one-shot mark acted on) or closes (Back when this tab opened it, else a
   * replace with the page).
   */
  setOpen: (next: boolean, options?: { replace?: boolean }) => void;
  /**
   * Whether the latest open came from `setOpen(true)` rather than the
   * address, and forgets it: read by `useAddressArrival`.
   */
  takeOpenedHere: () => boolean;
};

/**
 * A docked panel whose open state is its address (#6157; § Addresses in
 * `spec/ui/web-dashboard/README.md`): `?panel=upload` on Documents, say.
 * Opening pushes, so Back closes it and Forward reopens it; its back arrow,
 * Escape and a save close it the same way; a reload reopens it.
 *
 * The draft is the panel's own, in memory: a reload reopens the panel empty,
 * and Forward reopens it on whatever the panel kept (#4593).
 *
 * Pair it with `useAddressArrival`, which runs what the panel's own opener
 * does first when the address opens it instead (Forward, a reload, a link).
 *
 * The subscription gate still holds: an open is refused while it blocks, and
 * a panel the address opens on a blocked chapter is closed again, with its
 * parameter replaced away.
 */
export function useAddressedDialog(
  gate: SubscriptionGate,
  name: string,
  value: string,
): AddressedDialog {
  const { values, open, close } = useAddressParams([name]);
  const shown = values[name] === value;
  // Set by our own open, so the address arriving at it isn't an arrival.
  const selfOpened = useRef(false);
  const shownNow = useRef(shown);
  useLayoutEffect(() => {
    shownNow.current = shown;
  }, [shown]);
  const replaceNext = useRef(false);

  const setShown = useCallback(
    (next: boolean) => {
      if (next) {
        if (shownNow.current) return;
        selfOpened.current = true;
        const replace = replaceNext.current;
        replaceNext.current = false;
        open({ [name]: value }, { replace });
      } else {
        replaceNext.current = false;
        close([name]);
      }
    },
    [open, close, name, value],
  );
  const dialog = useGatedDialog(gate, { open: shown, setOpen: setShown });
  const gatedSetOpen = dialog.setOpen;
  const setOpen = useCallback(
    (next: boolean, options?: { replace?: boolean }) => {
      replaceNext.current = next && options?.replace === true;
      gatedSetOpen(next);
      replaceNext.current = false;
    },
    [gatedSetOpen],
  );

  const takeOpenedHere = useCallback(() => {
    const here = selfOpened.current;
    selfOpened.current = false;
    return here;
  }, []);

  return {
    ...dialog,
    setOpen,
    takeOpenedHere,
    dialogProps: {
      open: shown,
      onOpenChange: (next: boolean) => setOpen(next),
    },
  };
}

/**
 * Runs `onArrive` when the address opens `dialog` rather than its own
 * `setOpen(true)` (Forward, a reload, a link), so the panel can do what its
 * opener does first: take back a kept draft, clear a spent error. Called
 * after the panel's opener is declared.
 */
export function useAddressArrival(
  dialog: AddressedDialog,
  onArrive: () => void,
): void {
  const arrive = useRef(onArrive);
  useLayoutEffect(() => {
    arrive.current = onArrive;
  });
  const shown = dialog.open;
  const { takeOpenedHere } = dialog;
  const wasShown = useRef(false);
  useEffect(() => {
    if (shown && !wasShown.current && !takeOpenedHere()) arrive.current();
    wasShown.current = shown;
  }, [shown, takeOpenedHere]);
}
