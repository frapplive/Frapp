"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  closeAddress,
  pushAddress,
  replaceAddress,
  type AddressChanges,
} from "./address";

export interface AddressParams<Name extends string> {
  /** Each parameter's value in the address, the source of truth. */
  values: Readonly<Record<Name, string | null>>;
  /**
   * Opens something: a folder, a record, an editor, a named view. Pushes,
   * so Back closes it. `{ replace: true }` is for moving through days,
   * months and sorts, which Back skips.
   */
  open: (
    changes: Partial<Record<Name, string | null>>,
    options?: { replace?: boolean },
  ) => void;
  /**
   * Closes what `names` opened (all of this hook's parameters when left out):
   * Back when this tab opened it, else a replace with its parent.
   */
  close: (names?: readonly Name[]) => void;
}

/**
 * A page's parameters, read from the address and moved through the History
 * API (`./address.ts`; `spec/ui/web-dashboard/README.md` § Addresses). The
 * page keeps no copy in React state: what is open is what the address says,
 * so Back, Forward, a reload and a shared link all land on it.
 *
 * `useSearchParams` needs a `Suspense` boundary on a prerendered route; the
 * dashboard pages already have one.
 */
export function useAddressParams<Name extends string>(
  names: readonly Name[],
): AddressParams<Name> {
  const search = useSearchParams();
  const key = names.join("\u0000");
  const values = useMemo(() => {
    const out = {} as Record<Name, string | null>;
    for (const name of key.split("\u0000") as Name[]) {
      // Null outside a Next router (a spec rendering a page bare).
      out[name] = search?.get(name) || null;
    }
    return out;
  }, [search, key]);
  const open = useCallback(
    (
      changes: Partial<Record<Name, string | null>>,
      options?: { replace?: boolean },
    ) => {
      const merged = changes as AddressChanges;
      if (options?.replace) replaceAddress(merged);
      else pushAddress(merged);
    },
    [],
  );
  const close = useCallback(
    (only?: readonly Name[]) =>
      closeAddress(only ?? (key.split("\u0000") as Name[])),
    [key],
  );
  return { values, open, close };
}

/**
 * A dead or forbidden id in the address (a deleted event, a folder the member
 * can't read): once the page knows `dead`, the parameter is replaced away and
 * this returns the id, so the page can say why the record isn't there with
 * a short inline note in place of it. The note lasts until something else is
 * opened under the same parameter, or, when the page passes `context` (what
 * it shows: a folder, a search), until that changes.
 */
export function useDeadAddressParam(
  name: string,
  value: string | null,
  dead: boolean,
  context?: string,
): string | null {
  const [noted, setNoted] = useState<{ id: string; context?: string } | null>(
    null,
  );
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // A new id opened: forget the old note (React's "storing information
    // from previous renders" pattern, so no effect sets state).
    setSeen(value);
    if (value !== null) setNoted(null);
  }
  if (value !== null && dead && noted?.id !== value) {
    setNoted({ id: value, context });
  }
  useEffect(() => {
    if (value !== null && dead) replaceAddress({ [name]: null });
  }, [name, value, dead]);
  return noted && noted.context === context ? noted.id : null;
}

/** The part of a TanStack read `useGoneAfterRecheck` looks at. */
export interface RecheckableRead<Data> {
  data: Data | undefined;
  isFetching: boolean;
  isError: boolean;
  fetchStatus: "fetching" | "paused" | "idle";
  refetch: () => Promise<unknown>;
}

/**
 * Whether the record `id` names is gone from `read`: the read in hand
 * doesn't hold it (`holds`), so it is read again once (it can be cached from
 * before the record was added), and only a settled, successful read without
 * it calls it gone. A failed, paused or in-flight read never does. Feed the
 * answer to `useDeadAddressParam` (§ Addresses, "A dead or forbidden id").
 */
export function useGoneAfterRecheck<Data>(
  id: string | null,
  read: RecheckableRead<Data>,
  holds: (data: Data, id: string) => boolean,
): boolean {
  const missing =
    id !== null &&
    read.data !== undefined &&
    !read.isFetching &&
    !read.isError &&
    read.fetchStatus !== "paused" &&
    !holds(read.data, id);
  const [recheckedFor, setRecheckedFor] = useState<string | null>(null);
  const { refetch } = read;
  useEffect(() => {
    if (!missing || recheckedFor === id) return;
    void refetch().finally(() => setRecheckedFor(id));
  }, [missing, recheckedFor, id, refetch]);
  return missing && recheckedFor === id;
}
