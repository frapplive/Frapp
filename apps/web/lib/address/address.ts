/**
 * The web shell's addresses (#6034; `spec/ui/web-dashboard/README.md`
 * § Addresses owns the rules). The pure half: what an address becomes, and
 * the History API calls that move it. `use-address-params.ts` is the hook a
 * page reads them through.
 *
 * Next folds `pushState` and `replaceState` into its router, so
 * `useSearchParams` follows these calls with no navigation, no server read
 * and no scroll ("Native History API" in Next's linking guide). It does that
 * only for a state object without its own `__NA` mark: one carrying `__NA`
 * passes straight through and the router never hears of the new address.
 * So the state written here is ours, minus Next's marks, and Next copies its
 * own back on.
 */

/** A change to the query: a value sets the parameter, `null` removes it. */
export type AddressChanges = Readonly<Record<string, string | null>>;

/**
 * The state key that marks an entry this tab pushed to open something, and
 * the address it was pushed from. Closing that thing from that entry goes
 * Back to it, so Forward reopens it.
 */
export const ADDRESS_FROM_KEY = "frappAddressFrom";

/** The relative address (`/events?day=…`) of a URL. */
function relative(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `href` with `changes` merged into its query; the other parameters stay. */
export function addressWith(href: string, changes: AddressChanges): string {
  const url = new URL(href, "http://frapp.invalid");
  for (const [name, value] of Object.entries(changes)) {
    if (value === null || value === "") url.searchParams.delete(name);
    else url.searchParams.set(name, value);
  }
  return relative(url);
}

function currentAddress(): string {
  return relative(new URL(window.location.href));
}

/** The current entry's own state, without Next's marks (see the header). */
function ownState(): Record<string, unknown> {
  const state = window.history.state as Record<string, unknown> | null;
  const own: Record<string, unknown> = { ...state };
  delete own.__NA;
  delete own._N;
  delete own.__PRIVATE_NEXTJS_INTERNALS_TREE;
  return own;
}

/**
 * Opens something: merges `changes` into the address and pushes it, marked
 * with the address it was pushed from. Does nothing when nothing changes.
 */
export function pushAddress(changes: AddressChanges): void {
  const from = currentAddress();
  const to = addressWith(from, changes);
  if (to === from) return;
  const state = ownState();
  window.history.pushState({ ...state, [ADDRESS_FROM_KEY]: from }, "", to);
}

/**
 * Moves through something in place (a day, a month, a sort, a one-shot mark
 * acted on): merges `changes` and replaces the entry, keeping its mark.
 */
export function replaceAddress(changes: AddressChanges): void {
  const from = currentAddress();
  const to = addressWith(from, changes);
  if (to === from) return;
  window.history.replaceState(ownState(), "", to);
}

/**
 * Closes something (its back arrow, X or Escape): the address without
 * `names`. When this tab pushed the current entry from exactly that address,
 * it goes Back, so Forward reopens what was closed. Otherwise (it arrived
 * from a link, a notification or another tab) it replaces the entry with
 * that address, so Back leaves the page as it would have.
 */
export function closeAddress(names: readonly string[]): void {
  const from = currentAddress();
  const to = addressWith(
    from,
    Object.fromEntries(names.map((name) => [name, null])),
  );
  if (to === from) return;
  if (ownState()[ADDRESS_FROM_KEY] === to) {
    window.history.back();
    return;
  }
  const state = ownState();
  delete state[ADDRESS_FROM_KEY];
  window.history.replaceState(state, "", to);
}

/**
 * Takes a one-shot mark (`?new=1`, `&message=`, `&excuse=1`, `?setting=`)
 * off the address once it has been acted on, in place. With `expected`, only
 * while the mark still holds that value, so a newer mark isn't lost.
 */
export function consumeAddressParam(name: string, expected?: string): void {
  const value = new URL(window.location.href).searchParams.get(name);
  if (value === null) return;
  if (expected !== undefined && value !== expected) return;
  replaceAddress({ [name]: null });
}
